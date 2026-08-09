import { describe, it, expect, beforeEach, vi } from "vitest";

// In-memory mock database state
interface MockMonitor {
  id: string;
  userId: string;
  name: string;
  url: string;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  failureThreshold: number;
  recoveryThreshold: number;
  isActive: boolean;
  lastStatus: string;
  user: { id: string; email: string; webhookUrl: string | null };
}

interface MockIncident {
  id: string;
  monitorId: string;
  startedAt: Date;
  resolvedAt?: Date | null;
  reason: string;
  status: "OPEN" | "ACKNOWLEDGED" | "RESOLVED";
  acknowledgedAt?: Date | null;
}

let mockMonitors: Map<string, MockMonitor>;
let mockIncidents: Map<string, MockIncident>;
let incidentCounter = 0;

vi.mock("@/lib/db", () => {
  return {
    default: {
      $transaction: async (cb: any) => {
        const tx = {
          $queryRaw: vi.fn().mockResolvedValue([{ id: "mon-1" }]),
          checkResult: {
            create: vi.fn().mockResolvedValue({ id: "cr-1" }),
          },
          monitor: {
            findUnique: vi.fn().mockImplementation(async ({ where }: any) => {
              const m = mockMonitors.get(where.id);
              return m ? JSON.parse(JSON.stringify(m)) : null;
            }),
            update: vi.fn().mockImplementation(async ({ where, data }: any) => {
              const m = mockMonitors.get(where.id);
              if (m) {
                Object.assign(m, data);
              }
              return m;
            }),
          },
          incident: {
            findFirst: vi.fn().mockImplementation(async ({ where }: any) => {
              const list = Array.from(mockIncidents.values()).filter((inc) => {
                if (inc.monitorId !== where.monitorId) return false;
                if (where.status) {
                  if (typeof where.status === "string" && inc.status !== where.status) {
                    return false;
                  }
                  if (where.status.in && Array.isArray(where.status.in)) {
                    if (!where.status.in.includes(inc.status)) {
                      return false;
                    }
                  }
                }
                return true;
              });
              return list.length > 0 ? JSON.parse(JSON.stringify(list[list.length - 1])) : null;
            }),
            create: vi.fn().mockImplementation(async ({ data }: any) => {
              // Enforce database-level constraint: at most one active (OPEN or ACKNOWLEDGED) incident per monitor
              const existingActive = Array.from(mockIncidents.values()).find(
                (inc) =>
                  inc.monitorId === data.monitorId &&
                  (inc.status === "OPEN" || inc.status === "ACKNOWLEDGED")
              );
              if (existingActive) {
                const err: any = new Error("Unique constraint failed on active incident");
                err.code = "P2002";
                throw err;
              }

              incidentCounter++;
              const id = `inc-${incidentCounter}`;
              const inc: MockIncident = { id, ...data };
              mockIncidents.set(id, inc);
              return inc;
            }),
            update: vi.fn().mockImplementation(async ({ where, data }: any) => {
              const inc = mockIncidents.get(where.id);
              if (inc) {
                Object.assign(inc, data);
              }
              return inc;
            }),
          },
          notification: {
            create: vi.fn().mockResolvedValue({ id: "notif-1" }),
          },
        };
        return await cb(tx);
      },
    },
  };
});

import {
  processCheckResult,
  evaluateIncidentTransition,
  INCIDENT_STATES,
  ACTIVE_INCIDENT_STATES,
} from "../../src/server/incidents/incident-engine";

describe("Incident Engine Concurrency & State Machine Verifications", () => {
  beforeEach(() => {
    incidentCounter = 0;
    mockMonitors = new Map();
    mockIncidents = new Map();

    mockMonitors.set("mon-1", {
      id: "mon-1",
      userId: "user-1",
      name: "API Gateway",
      url: "https://api.example.com",
      consecutiveFailures: 0,
      consecutiveSuccesses: 10,
      failureThreshold: 3,
      recoveryThreshold: 3,
      isActive: true,
      lastStatus: "operational",
      user: { id: "user-1", email: "dev@example.com", webhookUrl: null },
    });
  });

  it("verifies fix: failure arriving after incident is ACKNOWLEDGED does NOT spawn a duplicate incident", async () => {
    // 1. Monitor fails 3 times to open incident inc-1
    await processCheckResult("mon-1", {
      success: false,
      statusCode: 500,
      responseTimeMs: 120,
      checkedAt: new Date(),
      errorType: "HTTP_500",
      errorMessage: "Internal error",
    });
    await processCheckResult("mon-1", {
      success: false,
      statusCode: 500,
      responseTimeMs: 120,
      checkedAt: new Date(),
      errorType: "HTTP_500",
      errorMessage: "Internal error",
    });
    const r3 = await processCheckResult("mon-1", {
      success: false,
      statusCode: 500,
      responseTimeMs: 120,
      checkedAt: new Date(),
      errorType: "HTTP_500",
      errorMessage: "Internal error",
    });

    expect(r3.action).toBe("INCIDENT_OPENED");
    expect(mockIncidents.size).toBe(1);
    const incident1 = Array.from(mockIncidents.values())[0];
    expect(incident1.status).toBe(INCIDENT_STATES.OPEN);

    // 2. Operator acknowledges incident inc-1
    incident1.status = INCIDENT_STATES.ACKNOWLEDGED;
    incident1.acknowledgedAt = new Date();

    // 3. Outage continues: 4th failure occurs
    // In our fixed engine, ACKNOWLEDGED is recognized as an ongoing outage in ACTIVE_INCIDENT_STATES.
    // It must NOT open a second incident!
    const r4 = await processCheckResult("mon-1", {
      success: false,
      statusCode: 500,
      responseTimeMs: 120,
      checkedAt: new Date(),
      errorType: "HTTP_500",
      errorMessage: "Internal error",
    });

    expect(r4.action).toBe("NO_CHANGE");
    expect(r4.incidentId).toBe(incident1.id);
    expect(mockIncidents.size).toBe(1); // Fix confirmed: exactly 1 incident preserved!
    expect(mockMonitors.get("mon-1")!.consecutiveFailures).toBe(4);
    expect(mockMonitors.get("mon-1")!.lastStatus).toBe("down");
  });

  it("verifies fix: recovery checks properly auto-resolve an ACKNOWLEDGED incident", async () => {
    mockIncidents.set("inc-ack", {
      id: "inc-ack",
      monitorId: "mon-1",
      startedAt: new Date(),
      reason: "Outage",
      status: INCIDENT_STATES.ACKNOWLEDGED,
      acknowledgedAt: new Date(),
    });

    const monitor = mockMonitors.get("mon-1")!;
    monitor.consecutiveFailures = 5;
    monitor.consecutiveSuccesses = 0;
    monitor.lastStatus = "down";

    // 1st recovery success
    const rec1 = await processCheckResult("mon-1", {
      success: true,
      statusCode: 200,
      responseTimeMs: 50,
      checkedAt: new Date(),
      errorType: null,
      errorMessage: null,
    });
    expect(rec1.action).toBe("NO_CHANGE");
    expect(mockIncidents.get("inc-ack")!.status).toBe(INCIDENT_STATES.ACKNOWLEDGED);

    // 2nd recovery success
    const rec2 = await processCheckResult("mon-1", {
      success: true,
      statusCode: 200,
      responseTimeMs: 50,
      checkedAt: new Date(),
      errorType: null,
      errorMessage: null,
    });
    expect(rec2.action).toBe("NO_CHANGE");

    // 3rd recovery success (meets recoveryThreshold of 3)
    const rec3 = await processCheckResult("mon-1", {
      success: true,
      statusCode: 200,
      responseTimeMs: 50,
      checkedAt: new Date(),
      errorType: null,
      errorMessage: null,
    });

    // Fix confirmed: ACKNOWLEDGED outage is successfully transitioned to RESOLVED!
    expect(rec3.action).toBe("INCIDENT_RESOLVED");
    expect(rec3.incidentId).toBe("inc-ack");
    expect(mockIncidents.get("inc-ack")!.status).toBe(INCIDENT_STATES.RESOLVED);
    expect(mockIncidents.get("inc-ack")!.resolvedAt).toBeDefined();
    expect(mockMonitors.get("mon-1")!.lastStatus).toBe("operational");
  });

  it("verifies fix: pure evaluateIncidentTransition handles all state combinations deterministically", () => {
    // 1. Failure threshold transition from healthy
    const t1 = evaluateIncidentTransition(
      {
        consecutiveFailures: 2,
        consecutiveSuccesses: 0,
        failureThreshold: 3,
        recoveryThreshold: 3,
        activeIncidentId: null,
        activeIncidentStatus: null,
      },
      false
    );
    expect(t1.action).toBe("INCIDENT_OPENED");
    expect(t1.shouldCreateIncident).toBe(true);
    expect(t1.nextFailures).toBe(3);

    // 2. Failure when already OPEN
    const t2 = evaluateIncidentTransition(
      {
        consecutiveFailures: 3,
        consecutiveSuccesses: 0,
        failureThreshold: 3,
        recoveryThreshold: 3,
        activeIncidentId: "inc-1",
        activeIncidentStatus: "OPEN",
      },
      false
    );
    expect(t2.action).toBe("NO_CHANGE");
    expect(t2.shouldCreateIncident).toBe(false);
    expect(t2.nextFailures).toBe(4);

    // 3. Failure when ACKNOWLEDGED
    const t3 = evaluateIncidentTransition(
      {
        consecutiveFailures: 3,
        consecutiveSuccesses: 0,
        failureThreshold: 3,
        recoveryThreshold: 3,
        activeIncidentId: "inc-1",
        activeIncidentStatus: "ACKNOWLEDGED",
      },
      false
    );
    expect(t3.action).toBe("NO_CHANGE");
    expect(t3.shouldCreateIncident).toBe(false);
    expect(t3.nextFailures).toBe(4);

    // 4. Recovery when ACKNOWLEDGED
    const t4 = evaluateIncidentTransition(
      {
        consecutiveFailures: 0,
        consecutiveSuccesses: 2,
        failureThreshold: 3,
        recoveryThreshold: 3,
        activeIncidentId: "inc-1",
        activeIncidentStatus: "ACKNOWLEDGED",
      },
      true
    );
    expect(t4.action).toBe("INCIDENT_RESOLVED");
    expect(t4.shouldResolveIncident).toBe(true);
    expect(t4.nextSuccesses).toBe(3);
  });

  it("verifies fix: concurrent execution idempotently enforces at most one active incident", async () => {
    const monitor = mockMonitors.get("mon-1")!;
    monitor.consecutiveFailures = 2; // Next failure meets threshold 3

    // 5 concurrent worker checks arrive at the same time
    const concurrentChecks = Array.from({ length: 5 }).map((_, i) =>
      processCheckResult("mon-1", {
        success: false,
        statusCode: 503,
        responseTimeMs: 70 + i,
        checkedAt: new Date(),
        errorType: "HTTP_503",
        errorMessage: `Concurrent worker failure ${i}`,
      })
    );

    const results = await Promise.all(concurrentChecks);

    // Exactly ONE check opened the incident, remaining checks safely returned NO_CHANGE
    const openedActions = results.filter((r) => r.action === "INCIDENT_OPENED");
    expect(openedActions.length).toBe(1);

    // Exactly ONE incident exists in the system
    expect(mockIncidents.size).toBe(1);
    const incident = Array.from(mockIncidents.values())[0];
    expect(incident.status).toBe(INCIDENT_STATES.OPEN);

    // All checks were associated with the same incident ID
    for (const r of results) {
      expect(r.incidentId).toBe(incident.id);
    }
  });
});
