import { monitorChecksQueue } from "./queues";

export interface MonitorScheduleConfig {
  id: string;
  intervalSeconds: number;
  isActive: boolean;
}

/**
 * Removes any existing BullMQ job scheduler for a monitor.
 */
export async function removeMonitorSchedule(monitorId: string): Promise<void> {
  try {
    const schedulerId = `monitor-${monitorId}`;
    await monitorChecksQueue.removeJobScheduler(schedulerId);
  } catch (err) {
    console.warn(`Failed removing schedule for monitor ${monitorId}:`, err);
  }
}

/**
 * Idempotently schedules or updates a repeatable check in BullMQ using upsertJobScheduler.
 */
export async function scheduleMonitorCheck(
  config: MonitorScheduleConfig
): Promise<void> {
  const schedulerId = `monitor-${config.id}`;

  if (!config.isActive) {
    await removeMonitorSchedule(config.id);
    return;
  }

  const intervalMs = Math.max(10, config.intervalSeconds) * 1000;

  // Use BullMQ modern job scheduler
  await monitorChecksQueue.upsertJobScheduler(
    schedulerId,
    {
      every: intervalMs,
    },
    {
      name: "scheduled-check",
      data: { monitorId: config.id },
    }
  );

  // Trigger an initial check right away so user sees instant feedback
  await monitorChecksQueue.add(
    "initial-check",
    { monitorId: config.id },
    {
      jobId: `${config.id}-initial-${Date.now()}`,
    }
  );
}

/**
 * Enqueues an immediate on-demand check for a monitor.
 */
export async function triggerImmediateCheck(monitorId: string): Promise<void> {
  await monitorChecksQueue.add(
    "manual-check",
    { monitorId },
    {
      jobId: `${monitorId}-manual-${Date.now()}`,
    }
  );
}
