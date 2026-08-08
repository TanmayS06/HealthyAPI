import { createMonitorWorker } from "./monitor-worker";
import { createNotificationWorker } from "./notification-worker";

console.log("=========================================");
console.log("   HEALTHYAPI BACKGROUND WORKER RUNNER   ");
console.log("=========================================");

const monitorWorker = createMonitorWorker(10);
const notificationWorker = createNotificationWorker();

console.log("🚀 Monitor Worker & Notification Worker started successfully.");
console.log("Listening for due jobs on Redis queues...");

async function shutdown() {
  console.log("\nInitiating graceful worker shutdown...");
  await Promise.all([monitorWorker.close(), notificationWorker.close()]);
  console.log("Workers gracefully terminated. Goodbye!");
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
