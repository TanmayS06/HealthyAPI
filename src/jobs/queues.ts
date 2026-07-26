import { Queue } from "bullmq";
import { getRedisConnection } from "@/lib/redis";

export const MONITOR_CHECKS_QUEUE_NAME = "monitor-checks";
export const NOTIFICATIONS_QUEUE_NAME = "notifications";

const connection = getRedisConnection();

export const monitorChecksQueue = new Queue(MONITOR_CHECKS_QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 2,
    backoff: {
      type: "exponential",
      delay: 1000,
    },
    removeOnComplete: 100,
    removeOnFail: 200,
  },
});

export const notificationsQueue = new Queue(NOTIFICATIONS_QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
    removeOnComplete: 50,
    removeOnFail: 100,
  },
});
