import { NextResponse } from "next/server";
import db from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { monitorSchema } from "@/lib/validation";
import { validateTargetUrl } from "@/lib/ssrf";
import { scheduleMonitorCheck } from "@/jobs/scheduler";

export async function GET(req: Request) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const monitors = await db.monitor.findMany({
    where: { userId: user.id },
    include: {
      _count: {
        select: { checkResults: true, incidents: true },
      },
      incidents: {
        where: { status: "OPEN" },
        take: 1,
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ monitors });
}

export async function POST(req: Request) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const parsed = monitorSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const {
      name,
      url,
      method,
      intervalSeconds,
      timeoutMs,
      expectedStatusCode,
      failureThreshold,
      recoveryThreshold,
      isActive,
    } = parsed.data;

    // SSRF Security verification
    const ssrfCheck = await validateTargetUrl(url);
    if (!ssrfCheck.isValid) {
      return NextResponse.json(
        {
          error: "Invalid or prohibited destination URL",
          details: ssrfCheck.reason,
        },
        { status: 422 }
      );
    }

    // Limit monitors per user (reasonable quota enforcement)
    const monitorCount = await db.monitor.count({
      where: { userId: user.id },
    });

    if (monitorCount >= 50) {
      return NextResponse.json(
        { error: "Monitor quota exceeded (maximum 50 monitors per account)" },
        { status: 403 }
      );
    }

    const monitor = await db.monitor.create({
      data: {
        userId: user.id,
        name,
        url,
        method,
        intervalSeconds,
        timeoutMs,
        expectedStatusCode,
        failureThreshold,
        recoveryThreshold,
        isActive,
      },
    });

    // Schedule background recurring job in BullMQ
    try {
      await scheduleMonitorCheck({
        id: monitor.id,
        intervalSeconds: monitor.intervalSeconds,
        isActive: monitor.isActive,
      });
    } catch (queueErr) {
      console.warn("Failed scheduling BullMQ job during monitor creation:", queueErr);
    }

    return NextResponse.json({ monitor }, { status: 201 });
  } catch (err: unknown) {
    console.error("Create monitor error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
