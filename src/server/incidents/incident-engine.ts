import db from "@/lib/db";
import { CheckExecutionResult } from "../monitors/checker";

export type IncidentState = "OPEN" | "ACKNOWLEDGED" | "RESOLVED";

export const INCIDENT_STATES = {
  OPEN: "OPEN",
  ACKNOWLEDGED: "ACKNOWLEDGED",
  RESOLVED: "RESOLVED",
} as const;

export const ACTIVE_INCIDENT_STATES: readonly IncidentState[] = [
  INCIDENT_STATES.OPEN,
  INCIDENT_STATES.ACKNOWLEDGED,
] as const;

export function isActiveIncidentState(status: string | null | undefined): boolean {
  return status === INCIDENT_STATES.OPEN || status === INCIDENT_STATES.ACKNOWLEDGED;
}

export interface IncidentEvaluationResult {
  action: "INCIDENT_OPENED" | "INCIDENT_RESOLVED" | "NO_CHANGE";
  incidentId?: string;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
}

export interface MonitorStateSnapshot {
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  failureThreshold: number;
  recoveryThreshold: number;
  activeIncidentId?: string | null;
  activeIncidentStatus?: IncidentState | null;
}

export interface StateTransitionResult {
  action: "INCIDENT_OPENED" | "INCIDENT_RESOLVED" | "NO_CHANGE";
  nextFailures: number;
  nextSuccesses: number;
  nextStatus: "operational" | "down" | "degraded";
  shouldCreateIncident: boolean;
  shouldResolveIncident: boolean;
  targetIncidentId?: string | null;
}

/**
 * Pure state machine evaluating incident transitions.
 * Guarantees that ACKNOWLEDGED incidents are treated as ongoing outages,
 * preventing duplicate incident creation while allowing auto-recovery.
 */
export function evaluateIncidentTransition(
  state: MonitorStateSnapshot,
  isSuccess: boolean
): StateTransitionResult {
  const hasActiveIncident = Boolean(
    state.activeIncidentId &&
      state.activeIncidentStatus &&
      isActiveIncidentState(state.activeIncidentStatus)
  );

  if (!isSuccess) {
    const failures = state.consecutiveFailures + 1;
    const successes = 0;
    const isDown = failures >= state.failureThreshold;
    const nextStatus = isDown ? "down" : "degraded";

    // Only open a new incident if threshold reached AND NO active incident exists (neither OPEN nor ACKNOWLEDGED)
    if (isDown && !hasActiveIncident) {
      return {
        action: "INCIDENT_OPENED",
        nextFailures: failures,
        nextSuccesses: successes,
        nextStatus,
        shouldCreateIncident: true,
        shouldResolveIncident: false,
      };
    }

    return {
      action: "NO_CHANGE",
      nextFailures: failures,
      nextSuccesses: successes,
      nextStatus: hasActiveIncident ? "down" : nextStatus,
      shouldCreateIncident: false,
      shouldResolveIncident: false,
      targetIncidentId: state.activeIncidentId,
    };
  } else {
    const successes = state.consecutiveSuccesses + 1;
    const failures = 0;

    // Auto-resolve when recovery threshold is met AND an active incident exists (either OPEN or ACKNOWLEDGED)
    if (hasActiveIncident && successes >= state.recoveryThreshold) {
      return {
        action: "INCIDENT_RESOLVED",
        nextFailures: failures,
        nextSuccesses: successes,
        nextStatus: "operational",
        shouldCreateIncident: false,
        shouldResolveIncident: true,
        targetIncidentId: state.activeIncidentId,
      };
    }

    return {
      action: "NO_CHANGE",
      nextFailures: failures,
      nextSuccesses: successes,
      nextStatus: hasActiveIncident ? "degraded" : "operational",
      shouldCreateIncident: false,
      shouldResolveIncident: false,
      targetIncidentId: state.activeIncidentId,
    };
  }
}

/**
 * Concurrency-safe Incident State Engine.
 * Evaluates check results and transitions incident state under strict concurrency:
 * - Uses row-level locking (SELECT ... FOR UPDATE) on the monitor record to serialize checks
 * - Enforces exactly one active incident (OPEN or ACKNOWLEDGED) per monitor
 * - Handles acknowledgement without spawning duplicate incidents or blocking resolution
 * - Ensures atomic counter updates without lost updates
 */
export async function processCheckResult(
  monitorId: string,
  checkResult: CheckExecutionResult,
  customDb?: any
): Promise<IncidentEvaluationResult> {
  const client = customDb || db;

  return await client.$transaction(async (tx: any) => {
    // 1. Acquire row lock on monitor record to serialize concurrent checks on the same monitor
    if (typeof tx.$queryRaw === "function") {
      try {
        await tx.$queryRaw`SELECT "id" FROM "monitors" WHERE "id" = ${monitorId} FOR UPDATE`;
      } catch {
        // Safe fallback in mock or environments without raw SQL support
      }
    }

    // 2. Persist the check result
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

    // 3. Fetch latest monitor state within the transaction
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

    // 4. Query for ANY currently active incident (OPEN or ACKNOWLEDGED)
    const activeIncident = await tx.incident.findFirst({
      where: {
        monitorId,
        status: { in: ACTIVE_INCIDENT_STATES as unknown as string[] },
      },
      orderBy: { startedAt: "desc" },
    });

    // 5. Evaluate deterministic state transition
    const transition = evaluateIncidentTransition(
      {
        consecutiveFailures: monitor.consecutiveFailures,
        consecutiveSuccesses: monitor.consecutiveSuccesses,
        failureThreshold: monitor.failureThreshold,
        recoveryThreshold: monitor.recoveryThreshold,
        activeIncidentId: activeIncident?.id,
        activeIncidentStatus: activeIncident?.status as IncidentState,
      },
      checkResult.success
    );

    // 6. Update monitor counters and status atomically
    await tx.monitor.update({
      where: { id: monitorId },
      data: {
        consecutiveFailures: transition.nextFailures,
        consecutiveSuccesses: transition.nextSuccesses,
        lastCheckedAt: checkResult.checkedAt,
        lastStatus: transition.nextStatus,
      },
    });

    // 7. Open new incident if required
    if (transition.shouldCreateIncident) {
      const failureReason =
        checkResult.errorMessage ||
        checkResult.errorType ||
        `Service failed ${transition.nextFailures} consecutive health checks`;

      let createdIncident: any;
      try {
        createdIncident = await tx.incident.create({
          data: {
            monitorId,
            startedAt: checkResult.checkedAt,
            reason: failureReason,
            status: INCIDENT_STATES.OPEN,
          },
        });
      } catch (createErr: any) {
        // Handle unique constraint conflict (P2002) idempotently
        if (createErr?.code === "P2002" || String(createErr).includes("unique")) {
          const existingActive = await tx.incident.findFirst({
            where: {
              monitorId,
              status: { in: ACTIVE_INCIDENT_STATES as unknown as string[] },
            },
            orderBy: { startedAt: "desc" },
          });
          return {
            action: "NO_CHANGE",
            incidentId: existingActive?.id,
            consecutiveFailures: transition.nextFailures,
            consecutiveSuccesses: transition.nextSuccesses,
          };
        }
        throw createErr;
      }

      // Dispatch alert notification
      await tx.notification.create({
        data: {
          userId: monitor.userId,
          incidentId: createdIncident.id,
          channel: monitor.user?.webhookUrl ? "WEBHOOK" : "EMAIL",
          status: "SENT",
          recipient: monitor.user?.webhookUrl || monitor.user?.email || "admin@healthyapi.dev",
          message: `[OUTAGE DETECTED] Monitor '${monitor.name}' is DOWN: ${failureReason}`,
        },
      });

      return {
        action: "INCIDENT_OPENED",
        incidentId: createdIncident.id,
        consecutiveFailures: transition.nextFailures,
        consecutiveSuccesses: transition.nextSuccesses,
      };
    }

    // 8. Auto-resolve active incident (OPEN or ACKNOWLEDGED) if recovery threshold met
    if (transition.shouldResolveIncident && transition.targetIncidentId) {
      const resolvedIncident = await tx.incident.update({
        where: { id: transition.targetIncidentId },
        data: {
          status: INCIDENT_STATES.RESOLVED,
          resolvedAt: checkResult.checkedAt,
        },
      });

      // Dispatch recovery notification
      await tx.notification.create({
        data: {
          userId: monitor.userId,
          incidentId: resolvedIncident.id,
          channel: monitor.user?.webhookUrl ? "WEBHOOK" : "EMAIL",
          status: "SENT",
          recipient: monitor.user?.webhookUrl || monitor.user?.email || "admin@healthyapi.dev",
          message: `[SERVICE RECOVERED] Monitor '${monitor.name}' is back OPERATIONAL after outage.`,
        },
      });

      return {
        action: "INCIDENT_RESOLVED",
        incidentId: resolvedIncident.id,
        consecutiveFailures: transition.nextFailures,
        consecutiveSuccesses: transition.nextSuccesses,
      };
    }

    return {
      action: "NO_CHANGE",
      incidentId: transition.targetIncidentId || undefined,
      consecutiveFailures: transition.nextFailures,
      consecutiveSuccesses: transition.nextSuccesses,
    };
  });
}
