import { Worker, Job } from "bullmq";
import { getRedisConnection } from "../src/lib/redis";
import { dispatchAlert, AlertPayload } from "../src/server/notifications/alert-service";
import { NOTIFICATIONS_QUEUE_NAME } from "../src/jobs/queues";

export interface NotificationJobData extends AlertPayload {
  userId: string;
}

export function createNotificationWorker() {
  const worker = new Worker<NotificationJobData>(
    NOTIFICATIONS_QUEUE_NAME,
    async (job: Job<NotificationJobData>) => {
      const { userId, incidentId, monitorName, monitorUrl, type, reason, timestamp } = job.data;
      await dispatchAlert(userId, incidentId, {
        incidentId,
        monitorName,
        monitorUrl,
        type,
        reason,
        timestamp,
      });
    },
    {
      connection: getRedisConnection(),
      concurrency: 5,
    }
  );

  worker.on("failed", (job, err) => {
    console.error(`[NOTIFICATION WORKER ERROR] Job ${job?.id} failed:`, err);
  });

  return worker;
}
