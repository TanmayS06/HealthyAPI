import db from "@/lib/db";
import { CheckExecutionResult } from "../monitors/checker";

export interface IncidentEvaluationResult {
  action: "INCIDENT_OPENED" | "INCIDENT_RESOLVED" | "NO_CHANGE";
  incidentId?: string;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
}

/**
 * Incident State Engine
 * Evaluates consecutive check results and transitions incident state safely
 * under concurrency using ACID database transactions and idempotency checks.
 */
export async function processCheckResult(
  monitorId: string,
  checkResult: CheckExecutionResult
): Promise<IncidentEvaluationResult> {
  return await db.$transaction(async (tx) => {
    // 1. Persist the check result first
    await tx.checkResult.create({
      data: {
        monitorId,
        checkedAt: checkResult.checkedAt,
        statusCode: checkResult.statusCode,
        responseTimeMs: checkResult.responseTimeMs,
        success: checkResult.success,
        errorType: checkResult.errorType,
        errorMessage: checkResult.errorMessage,
      },
    });

    // 2. Fetch current monitor state
    const monitor = await tx.monitor.findUnique({
      where: { id: monitorId },
      include: {
        user: {
          select: { id: true, email: true, webhookUrl: true },
        },
      },
    });

    if (!monitor || !monitor.isActive) {
      return {
        action: "NO_CHANGE",
        consecutiveFailures: 0,
        consecutiveSuccesses: 0,
      };
    }

    // 3. Find any currently active OPEN incident for this monitor
    const openIncident = await tx.incident.findFirst({
      where: {
        monitorId,
        status: "OPEN",
      },
      orderBy: { startedAt: "desc" },
    });

    if (!checkResult.success) {
      // Failure branch
      const failures = monitor.consecutiveFailures + 1;
      const successes = 0;

      await tx.monitor.update({
        where: { id: monitorId },
        data: {
          consecutiveFailures: failures,
          consecutiveSuccesses: successes,
          lastCheckedAt: checkResult.checkedAt,
          lastStatus: failures >= monitor.failureThreshold ? "down" : "degraded",
        },
      });

      // Threshold reached and NO incident open yet -> CREATE INCIDENT
      if (failures >= monitor.failureThreshold && !openIncident) {
        const failureReason =
          checkResult.errorMessage ||
          checkResult.errorType ||
          `Service failed ${failures} consecutive health checks`;

        const newIncident = await tx.incident.create({
          data: {
            monitorId,
            startedAt: checkResult.checkedAt,
            reason: failureReason,
            status: "OPEN",
          },
        });

        // Record notification entry
        await tx.notification.create({
          data: {
            userId: monitor.userId,
            incidentId: newIncident.id,
            channel: monitor.user.webhookUrl ? "WEBHOOK" : "EMAIL",
            status: "SENT",
            recipient: monitor.user.webhookUrl || monitor.user.email,
            message: `[OUTAGE DETECTED] Monitor '${monitor.name}' is DOWN: ${failureReason}`,
          },
        });

        return {
          action: "INCIDENT_OPENED",
          incidentId: newIncident.id,
          consecutiveFailures: failures,
          consecutiveSuccesses: successes,
        };
      }

      return {
        action: "NO_CHANGE",
        incidentId: openIncident?.id,
        consecutiveFailures: failures,
        consecutiveSuccesses: successes,
      };
    } else {
      // Success branch
      const successes = monitor.consecutiveSuccesses + 1;
      const failures = 0;

      // Threshold reached to resolve active incident
      if (openIncident && successes >= monitor.recoveryThreshold) {
        const resolvedIncident = await tx.incident.update({
          where: { id: openIncident.id },
          data: {
            status: "RESOLVED",
            resolvedAt: checkResult.checkedAt,
          },
        });

        await tx.monitor.update({
          where: { id: monitorId },
          data: {
            consecutiveFailures: 0,
            consecutiveSuccesses: successes,
            lastCheckedAt: checkResult.checkedAt,
            lastStatus: "operational",
          },
        });

        // Record recovery notification
        await tx.notification.create({
          data: {
            userId: monitor.userId,
            incidentId: resolvedIncident.id,
            channel: monitor.user.webhookUrl ? "WEBHOOK" : "EMAIL",
            status: "SENT",
            recipient: monitor.user.webhookUrl || monitor.user.email,
            message: `[SERVICE RECOVERED] Monitor '${monitor.name}' is back OPERATIONAL after outage.`,
          },
        });

        return {
          action: "INCIDENT_RESOLVED",
          incidentId: resolvedIncident.id,
          consecutiveFailures: failures,
          consecutiveSuccesses: successes,
        };
      }

      await tx.monitor.update({
        where: { id: monitorId },
        data: {
          consecutiveFailures: 0,
          consecutiveSuccesses: successes,
          lastCheckedAt: checkResult.checkedAt,
          lastStatus: openIncident ? "degraded" : "operational",
        },
      });

      return {
        action: "NO_CHANGE",
        incidentId: openIncident?.id,
        consecutiveFailures: failures,
        consecutiveSuccesses: successes,
      };
    }
  });
}
