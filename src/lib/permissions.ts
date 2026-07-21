import db from "./db";

export class PermissionError extends Error {
  constructor(message: string = "Forbidden: You do not own this resource") {
    super(message);
    this.name = "PermissionError";
  }
}

export class NotFoundError extends Error {
  constructor(message: string = "Resource not found") {
    super(message);
    this.name = "NotFoundError";
  }
}

/**
 * Asserts that the monitor exists and belongs to the given user.
 */
export async function assertMonitorOwner(monitorId: string, userId: string) {
  const monitor = await db.monitor.findUnique({
    where: { id: monitorId },
  });

  if (!monitor) {
    throw new NotFoundError("Monitor not found");
  }

  if (monitor.userId !== userId) {
    throw new PermissionError("Unauthorized: Monitor belongs to another user");
  }

  return monitor;
}

/**
 * Asserts that the incident exists and belongs to a monitor owned by the user.
 */
export async function assertIncidentOwner(incidentId: string, userId: string) {
  const incident = await db.incident.findUnique({
    where: { id: incidentId },
    include: { monitor: true },
  });

  if (!incident) {
    throw new NotFoundError("Incident not found");
  }

  if (incident.monitor.userId !== userId) {
    throw new PermissionError("Unauthorized: Incident belongs to another user");
  }

  return incident;
}

/**
 * Asserts that the status page exists and belongs to the user.
 */
export async function assertStatusPageOwner(statusPageId: string, userId: string) {
  const statusPage = await db.statusPage.findUnique({
    where: { id: statusPageId },
  });

  if (!statusPage) {
    throw new NotFoundError("Status page not found");
  }

  if (statusPage.userId !== userId) {
    throw new PermissionError("Unauthorized: Status page belongs to another user");
  }

  return statusPage;
}
