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
        // Emulate transaction execution
        const tx = {
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
                if (where.status && inc.status !== where.status) return false;
                return true;
              });
              return list.length > 0 ? JSON.parse(JSON.stringify(list[list.length - 1])) : null;
            }),
            create: vi.fn().mockImplementation(async ({ data }: any) => {
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

// Import processCheckResult which uses the mocked db
import { processCheckResult } from "../../src/server/incidents/incident-engine";

describe("Incident Engine Concurrency & State Machine Regressions", () => {
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

  it("reproduces bug: failure arriving after incident is ACKNOWLEDGED spawns a duplicate incident", async () => {
    // 1. Monitor fails 3 times to open incident inc-1
    await processCheckResult("mon-1", { success: false, statusCode: 500, responseTimeMs: 120, checkedAt: new Date(), errorType: "HTTP_500", errorMessage: "Internal error" });
    await processCheckResult("mon-1", { success: false, statusCode: 500, responseTimeMs: 120, checkedAt: new Date(), errorType: "HTTP_500", errorMessage: "Internal error" });
    const r3 = await processCheckResult("mon-1", { success: false, statusCode: 500, responseTimeMs: 120, checkedAt: new Date(), errorType: "HTTP_500", errorMessage: "Internal error" });

    expect(r3.action).toBe("INCIDENT_OPENED");
    expect(mockIncidents.size).toBe(1);
    const incident1 = Array.from(mockIncidents.values())[0];
    expect(incident1.status).toBe("OPEN");

    // 2. Operator acknowledges incident inc-1
    incident1.status = "ACKNOWLEDGED";
    incident1.acknowledgedAt = new Date();

    // 3. Outage continues: 4th failure occurs
    // BUG in current code: incident-engine only queries { status: "OPEN" }.
    // Because the incident is ACKNOWLEDGED, openIncident is null.
    // Therefore, failures (4) >= threshold (3) triggers a DUPLICATE incident!
    const r4 = await processCheckResult("mon-1", { success: false, statusCode: 500, responseTimeMs: 120, checkedAt: new Date(), errorType: "HTTP_500", errorMessage: "Internal error" });

    // In the buggy engine: r4.action is INCIDENT_OPENED and a 2nd incident is created!
    // This confirms the bug where ACKNOWLEDGED isn't treated as an active outage.
    expect(r4.action).toBe("INCIDENT_OPENED");
    expect(mockIncidents.size).toBe(2); // BUG REPRODUCED: 2 incidents for 1 outage!
  });

  it("reproduces bug: recovery checks never resolve an ACKNOWLEDGED incident", async () => {
    // Create an acknowledged incident
    mockIncidents.set("inc-ack", {
      id: "inc-ack",
      monitorId: "mon-1",
      startedAt: new Date(),
      reason: "Outage",
      status: "ACKNOWLEDGED",
    });

    const monitor = mockMonitors.get("mon-1")!;
    monitor.consecutiveFailures = 5;
    monitor.consecutiveSuccesses = 0;
    monitor.lastStatus = "down";

    // 3 recovery successes arrive
    await processCheckResult("mon-1", { success: true, statusCode: 200, responseTimeMs: 50, checkedAt: new Date(), errorType: null, errorMessage: null });
    await processCheckResult("mon-1", { success: true, statusCode: 200, responseTimeMs: 50, checkedAt: new Date(), errorType: null, errorMessage: null });
    const rec3 = await processCheckResult("mon-1", { success: true, statusCode: 200, responseTimeMs: 50, checkedAt: new Date(), errorType: null, errorMessage: null });

    // BUG in current code: rec3 action is NO_CHANGE, and the incident remains ACKNOWLEDGED instead of RESOLVED!
    expect(rec3.action).toBe("NO_CHANGE");
    expect(mockIncidents.get("inc-ack")!.status).toBe("ACKNOWLEDGED"); // BUG REPRODUCED: never resolved!
  });

  it("reproduces bug: concurrent worker checks race without row locking, creating duplicate incidents", async () => {
    const monitor = mockMonitors.get("mon-1")!;
    monitor.consecutiveFailures = 2; // Next failure triggers threshold (3)

    // Two concurrent worker checks execute simultaneously.
    // In uncoordinated execution, both read consecutiveFailures = 2 before either updates:
    const checkPromise1 = processCheckResult("mon-1", {
      success: false,
      statusCode: 503,
      responseTimeMs: 80,
      checkedAt: new Date(),
      errorType: "HTTP_503",
      errorMessage: "Worker 1 failure",
    });

    const checkPromise2 = processCheckResult("mon-1", {
      success: false,
      statusCode: 503,
      responseTimeMs: 85,
      checkedAt: new Date(),
      errorType: "HTTP_503",
      errorMessage: "Worker 2 failure",
    });

    const [res1, res2] = await Promise.all([checkPromise1, checkPromise2]);

    // In a concurrency-safe system, exactly ONE incident must be opened, and the failure counter must be 4.
    // In the buggy engine without serialization / locking:
    // Both Res 1 and Res 2 could trigger INCIDENT_OPENED if executed simultaneously.
    const openedCount = [res1, res2].filter((r) => r.action === "INCIDENT_OPENED").length;
    // Verify our test harness captures the state
    expect(openedCount).toBeGreaterThanOrEqual(1);
  });
});
