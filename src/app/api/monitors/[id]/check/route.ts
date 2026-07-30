import { NextResponse } from "next/server";
import db from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { assertMonitorOwner } from "@/lib/permissions";
import { executeEndpointCheck } from "@/server/monitors/checker";
import { processCheckResult } from "@/server/incidents/incident-engine";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const monitor = await assertMonitorOwner(id, user.id);

    // Run immediate check
    const checkResult = await executeEndpointCheck({
      url: monitor.url,
      method: monitor.method,
      timeoutMs: monitor.timeoutMs,
      expectedStatusCode: monitor.expectedStatusCode,
    });

    // Process result through transactional incident engine
    const incidentTransition = await processCheckResult(monitor.id, checkResult);

    // Fetch updated monitor
    const updatedMonitor = await db.monitor.findUnique({
      where: { id: monitor.id },
    });

    return NextResponse.json({
      checkResult,
      incidentTransition,
      monitor: updatedMonitor,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("not found")) {
      return NextResponse.json({ error: "Monitor not found" }, { status: 404 });
    }
    return NextResponse.json({ error: message || "Internal server error" }, { status: 500 });
  }
}
