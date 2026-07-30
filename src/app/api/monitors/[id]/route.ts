import { NextResponse } from "next/server";
import db from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { assertMonitorOwner } from "@/lib/permissions";
import { updateMonitorSchema } from "@/lib/validation";
import { validateTargetUrl } from "@/lib/ssrf";
import { scheduleMonitorCheck, removeMonitorSchedule } from "@/jobs/scheduler";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    await assertMonitorOwner(id, user.id);

    const monitor = await db.monitor.findUnique({
      where: { id },
      include: {
        checkResults: {
          orderBy: { checkedAt: "desc" },
          take: 20,
        },
        incidents: {
          orderBy: { startedAt: "desc" },
          take: 10,
        },
      },
    });

    return NextResponse.json({ monitor });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("not found")) {
      return NextResponse.json({ error: "Monitor not found" }, { status: 404 });
    }
    if (message.includes("belongs to another user") || message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const existing = await assertMonitorOwner(id, user.id);

    const body = await req.json();
    const parsed = updateMonitorSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const data = parsed.data;

    // If URL was updated, run SSRF validation
    if (data.url && data.url !== existing.url) {
      const ssrf = await validateTargetUrl(data.url);
      if (!ssrf.isValid) {
        return NextResponse.json(
          { error: "Invalid target URL", details: ssrf.reason },
          { status: 422 }
        );
      }
    }

    const updated = await db.monitor.update({
      where: { id },
      data,
    });

    // Reconcile BullMQ schedule
    try {
      await scheduleMonitorCheck({
        id: updated.id,
        intervalSeconds: updated.intervalSeconds,
        isActive: updated.isActive,
      });
    } catch (schedErr) {
      console.warn("Failed updating BullMQ schedule:", schedErr);
    }

    return NextResponse.json({ monitor: updated });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("not found")) {
      return NextResponse.json({ error: "Monitor not found" }, { status: 404 });
    }
    return NextResponse.json({ error: message || "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    await assertMonitorOwner(id, user.id);

    // Remove from BullMQ queue
    await removeMonitorSchedule(id);

    // Delete from DB (cascades checkResults & incidents)
    await db.monitor.delete({
      where: { id },
    });

    return NextResponse.json({ message: "Monitor deleted successfully" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("not found")) {
      return NextResponse.json({ error: "Monitor not found" }, { status: 404 });
    }
    return NextResponse.json({ error: message || "Internal server error" }, { status: 500 });
  }
}
