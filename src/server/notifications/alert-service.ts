import db from "@/lib/db";

export interface AlertPayload {
  incidentId: string;
  monitorName: string;
  monitorUrl: string;
  type: "INCIDENT_OPENED" | "INCIDENT_RESOLVED";
  reason: string;
  timestamp: string;
}

/**
 * Dispatches an alert to configured notification channels (Webhook, simulated Email).
 */
export async function dispatchAlert(
  userId: string,
  incidentId: string,
  payload: AlertPayload
): Promise<void> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { email: true, webhookUrl: true },
  });

  if (!user) return;

  // 1. Email notification attempt
  console.log(
    `[ALERT DISPATCHER: EMAIL] Sent alert to ${user.email}: [${payload.type}] ${payload.monitorName} - ${payload.reason}`
  );

  // 2. Webhook notification attempt if configured
  if (user.webhookUrl) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);

      const res = await fetch(user.webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "PulseCheck-Alerts/1.0",
        },
        body: JSON.stringify({
          event: payload.type,
          data: payload,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      console.log(
        `[ALERT DISPATCHER: WEBHOOK] Delivered to ${user.webhookUrl} - status ${res.status}`
      );
    } catch (err: unknown) {
      console.warn(
        `[ALERT DISPATCHER: WEBHOOK FAILED] Failed to notify ${user.webhookUrl}:`,
        err instanceof Error ? err.message : err
      );
    }
  }
}
