import { Worker, Job } from "bullmq";
import db from "../src/lib/db";
import { getRedisConnection } from "../src/lib/redis";
import { executeEndpointCheck } from "../src/server/monitors/checker";
import { processCheckResult } from "../src/server/incidents/incident-engine";
import { MONITOR_CHECKS_QUEUE_NAME, notificationsQueue } from "../src/jobs/queues";

export interface MonitorCheckJobData {
  monitorId: string;
}

export function createMonitorWorker(concurrency: number = 10) {
  const worker = new Worker<MonitorCheckJobData>(
    MONITOR_CHECKS_QUEUE_NAME,
    async (job: Job<MonitorCheckJobData>) => {
      const { monitorId } = job.data;

      // 1. Load latest monitor state from PostgreSQL
      const monitor = await db.monitor.findUnique({
        where: { id: monitorId },
        include: { user: true },
      });

      if (!monitor) {
        console.log(`[WORKER] Monitor ${monitorId} not found, skipping.`);
        return;
      }

      if (!monitor.isActive) {
        console.log(`[WORKER] Monitor ${monitor.name} (${monitorId}) is paused/inactive, skipping.`);
        return;
      }

      // 2. Perform bounded secure health check
      const checkResult = await executeEndpointCheck({
        url: monitor.url,
        method: monitor.method,
        timeoutMs: monitor.timeoutMs,
        expectedStatusCode: monitor.expectedStatusCode,
      });

      console.log(
        `[CHECK] ${monitor.name} (${monitor.url}) -> ` +
          (checkResult.success
            ? `SUCCESS (${checkResult.statusCode}, ${checkResult.responseTimeMs}ms)`
            : `FAIL (${checkResult.errorType || checkResult.statusCode}: ${checkResult.errorMessage})`)
      );

      // 3. Process check result inside transactional incident state engine
      const incidentEval = await processCheckResult(monitor.id, checkResult);

      // 4. Enqueue notification if an incident was opened or resolved
      if (incidentEval.action === "INCIDENT_OPENED" && incidentEval.incidentId) {
        console.log(`[INCIDENT OPENED] Monitor ${monitor.name} outage triggered!`);
        await notificationsQueue.add("incident-alert", {
          userId: monitor.userId,
          incidentId: incidentEval.incidentId,
          type: "INCIDENT_OPENED",
          monitorName: monitor.name,
          monitorUrl: monitor.url,
          reason: checkResult.errorMessage || checkResult.errorType || "Health check failed threshold",
          timestamp: new Date().toISOString(),
        });
      } else if (incidentEval.action === "INCIDENT_RESOLVED" && incidentEval.incidentId) {
        console.log(`[INCIDENT RESOLVED] Monitor ${monitor.name} has recovered!`);
        await notificationsQueue.add("recovery-alert", {
          userId: monitor.userId,
          incidentId: incidentEval.incidentId,
          type: "INCIDENT_RESOLVED",
          monitorName: monitor.name,
          monitorUrl: monitor.url,
          reason: "Health checks restored to operational status",
          timestamp: new Date().toISOString(),
        });
      }
    },
    {
      connection: getRedisConnection(),
      concurrency,
    }
  );

  worker.on("completed", (job) => {
    // console.log(`Job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[WORKER ERROR] Job ${job?.id} failed:`, err);
  });

  return worker;
}
