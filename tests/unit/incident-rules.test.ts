import { describe, it, expect } from "vitest";

describe("Incident Transition State Logic", () => {
  interface State {
    consecutiveFailures: number;
    consecutiveSuccesses: number;
    hasOpenIncident: boolean;
    failureThreshold: number;
    recoveryThreshold: number;
  }

  function evaluateTransition(
    state: State,
    isSuccess: boolean
  ): { action: "INCIDENT_OPENED" | "INCIDENT_RESOLVED" | "NO_CHANGE"; nextState: State } {
    const next = { ...state };

    if (!isSuccess) {
      next.consecutiveFailures += 1;
      next.consecutiveSuccesses = 0;

      if (next.consecutiveFailures >= next.failureThreshold && !next.hasOpenIncident) {
        next.hasOpenIncident = true;
        return { action: "INCIDENT_OPENED", nextState: next };
      }

      return { action: "NO_CHANGE", nextState: next };
    } else {
      next.consecutiveSuccesses += 1;
      next.consecutiveFailures = 0;

      if (next.hasOpenIncident && next.consecutiveSuccesses >= next.recoveryThreshold) {
        next.hasOpenIncident = false;
        return { action: "INCIDENT_RESOLVED", nextState: next };
      }

      return { action: "NO_CHANGE", nextState: next };
    }
  }

  it("does not trigger an outage on transient single or double failure blips", () => {
    let state: State = {
      consecutiveFailures: 0,
      consecutiveSuccesses: 10,
      hasOpenIncident: false,
      failureThreshold: 3,
      recoveryThreshold: 3,
    };

    // First failure
    let r1 = evaluateTransition(state, false);
    expect(r1.action).toBe("NO_CHANGE");
    expect(r1.nextState.consecutiveFailures).toBe(1);

    // Second failure
    let r2 = evaluateTransition(r1.nextState, false);
    expect(r2.action).toBe("NO_CHANGE");
    expect(r2.nextState.consecutiveFailures).toBe(2);

    // Blip recovers
    let r3 = evaluateTransition(r2.nextState, true);
    expect(r3.action).toBe("NO_CHANGE");
    expect(r3.nextState.consecutiveFailures).toBe(0);
    expect(r3.nextState.hasOpenIncident).toBe(false);
  });

  it("opens an incident upon reaching the 3-failure threshold", () => {
    let state: State = {
      consecutiveFailures: 2,
      consecutiveSuccesses: 0,
      hasOpenIncident: false,
      failureThreshold: 3,
      recoveryThreshold: 3,
    };

    const res = evaluateTransition(state, false);
    expect(res.action).toBe("INCIDENT_OPENED");
    expect(res.nextState.hasOpenIncident).toBe(true);
  });

  it("is idempotent: prevents duplicate outages if failure arrives when already OPEN", () => {
    let state: State = {
      consecutiveFailures: 3,
      consecutiveSuccesses: 0,
      hasOpenIncident: true,
      failureThreshold: 3,
      recoveryThreshold: 3,
    };

    const res = evaluateTransition(state, false);
    expect(res.action).toBe("NO_CHANGE");
    expect(res.nextState.hasOpenIncident).toBe(true);
  });

  it("auto-resolves outage only after reaching consecutive success recovery threshold", () => {
    let state: State = {
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      hasOpenIncident: true,
      failureThreshold: 3,
      recoveryThreshold: 3,
    };

    // 1st recovery success
    let r1 = evaluateTransition(state, true);
    expect(r1.action).toBe("NO_CHANGE");

    // 2nd recovery success
    let r2 = evaluateTransition(r1.nextState, true);
    expect(r2.action).toBe("NO_CHANGE");

    // 3rd recovery success -> AUTO RESOLVE!
    let r3 = evaluateTransition(r2.nextState, true);
    expect(r3.action).toBe("INCIDENT_RESOLVED");
    expect(r3.nextState.hasOpenIncident).toBe(false);
  });
});
