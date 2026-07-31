import { NextResponse } from "next/server";
import db from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { updateStatusPageSchema } from "@/lib/validation";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  // 1. Fetch status page (look by slug or id)
  const page = await db.statusPage.findFirst({
    where: {
      OR: [{ slug }, { id: slug }],
    },
  });

  if (!page || !page.isPublished) {
    return NextResponse.json({ error: "Status page not found or unpublished" }, { status: 404 });
  }

  // 2. Fetch monitors selected for this status page
  const monitors = await db.monitor.findMany({
    where: {
      id: { in: page.selectedMonitorIds },
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      lastStatus: true,
      lastCheckedAt: true,
      checkResults: {
        where: {
          checkedAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // last 7 days
          },
        },
        select: {
          success: true,
          responseTimeMs: true,
          checkedAt: true,
        },
      },
    },
  });

  // Calculate sanitized health metrics for each monitor without leaking private URLs
  const sanitizedMonitors = monitors.map((m) => {
    const total = m.checkResults.length;
    const successes = m.checkResults.filter((r) => r.success).length;
    const uptimePercent = total > 0 ? Number(((successes / total) * 100).toFixed(2)) : 100;

    const avgResponseTime =
      successes > 0
        ? Math.round(
            m.checkResults
              .filter((r) => r.success)
              .reduce((acc, r) => acc + r.responseTimeMs, 0) / successes
          )
        : 0;

    return {
      id: m.id,
      name: m.name,
      status: m.lastStatus || "operational",
      uptimePercent,
      avgResponseTime,
      lastCheckedAt: m.lastCheckedAt,
    };
  });

  // 3. Determine overall system status
  let overallStatus: "ALL_OPERATIONAL" | "PARTIAL_OUTAGE" | "MAJOR_OUTAGE" = "ALL_OPERATIONAL";
  if (sanitizedMonitors.some((m) => m.status === "down")) {
    overallStatus = "MAJOR_OUTAGE";
  } else if (sanitizedMonitors.some((m) => m.status === "degraded")) {
    overallStatus = "PARTIAL_OUTAGE";
  }

  // 4. Fetch recent incidents for these monitors (sanitized)
  const incidents = await db.incident.findMany({
    where: {
      monitorId: { in: page.selectedMonitorIds },
    },
    orderBy: { startedAt: "desc" },
    take: 10,
    include: {
      monitor: {
        select: { name: true },
      },
    },
  });

  const sanitizedIncidents = incidents.map((inc) => ({
    id: inc.id,
    serviceName: inc.monitor.name,
    status: inc.status,
    reason: inc.reason,
    startedAt: inc.startedAt,
    resolvedAt: inc.resolvedAt,
  }));

  return NextResponse.json({
    statusPage: {
      title: page.title,
      description: page.description,
      slug: page.slug,
      overallStatus,
      updatedAt: page.updatedAt,
      monitors: sanitizedMonitors,
      incidents: sanitizedIncidents,
    },
  });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await params;

  const existing = await db.statusPage.findFirst({
    where: {
      OR: [{ slug }, { id: slug }],
    },
  });

  if (!existing) {
    return NextResponse.json({ error: "Status page not found" }, { status: 404 });
  }

  if (existing.userId !== user.id) {
    return NextResponse.json({ error: "Forbidden: Not your status page" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const parsed = updateStatusPageSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const data = parsed.data;

    // Check slug collision if changing slug
    if (data.slug && data.slug !== existing.slug) {
      const collision = await db.statusPage.findUnique({
        where: { slug: data.slug },
      });
      if (collision) {
        return NextResponse.json({ error: "Slug is already taken" }, { status: 409 });
      }
    }

    const updated = await db.statusPage.update({
      where: { id: existing.id },
      data,
    });

    return NextResponse.json({ page: updated });
  } catch (err: unknown) {
    console.error("Update status page error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await params;

  const existing = await db.statusPage.findFirst({
    where: {
      OR: [{ slug }, { id: slug }],
    },
  });

  if (!existing) {
    return NextResponse.json({ error: "Status page not found" }, { status: 404 });
  }

  if (existing.userId !== user.id) {
    return NextResponse.json({ error: "Forbidden: Not your status page" }, { status: 403 });
  }

  await db.statusPage.delete({
    where: { id: existing.id },
  });

  return NextResponse.json({ message: "Status page deleted successfully" });
}
