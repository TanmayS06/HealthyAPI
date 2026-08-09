import { describe, it, expect } from "vitest";
import {
  evaluateIncidentTransition,
  INCIDENT_STATES,
} from "../../src/server/incidents/incident-engine";

describe("Incident Transition State Logic Engine", () => {
  it("does not trigger an outage on transient single or double failure blips", () => {
    // Healthy state
    let state = {
      consecutiveFailures: 0,
      consecutiveSuccesses: 10,
      failureThreshold: 3,
      recoveryThreshold: 3,
      activeIncidentId: null,
      activeIncidentStatus: null,
    };

    // First failure
    let r1 = evaluateIncidentTransition(state, false);
    expect(r1.action).toBe("NO_CHANGE");
    expect(r1.nextFailures).toBe(1);
    expect(r1.shouldCreateIncident).toBe(false);

    // Second failure
    let r2 = evaluateIncidentTransition(
      { ...state, consecutiveFailures: r1.nextFailures, consecutiveSuccesses: r1.nextSuccesses },
      false
    );
    expect(r2.action).toBe("NO_CHANGE");
    expect(r2.nextFailures).toBe(2);
    expect(r2.shouldCreateIncident).toBe(false);

    // Blip recovers
    let r3 = evaluateIncidentTransition(
      { ...state, consecutiveFailures: r2.nextFailures, consecutiveSuccesses: r2.nextSuccesses },
      true
    );
    expect(r3.action).toBe("NO_CHANGE");
    expect(r3.nextFailures).toBe(0);
    expect(r3.nextSuccesses).toBe(1);
    expect(r3.shouldResolveIncident).toBe(false);
  });

  it("opens an incident upon reaching the 3-failure threshold", () => {
    const state = {
      consecutiveFailures: 2,
      consecutiveSuccesses: 0,
      failureThreshold: 3,
      recoveryThreshold: 3,
      activeIncidentId: null,
      activeIncidentStatus: null,
    };

    const res = evaluateIncidentTransition(state, false);
    expect(res.action).toBe("INCIDENT_OPENED");
    expect(res.shouldCreateIncident).toBe(true);
    expect(res.nextFailures).toBe(3);
    expect(res.nextStatus).toBe("down");
  });

  it("is idempotent: prevents duplicate outages if failure arrives when already OPEN", () => {
    const state = {
      consecutiveFailures: 3,
      consecutiveSuccesses: 0,
      failureThreshold: 3,
      recoveryThreshold: 3,
      activeIncidentId: "inc-1",
      activeIncidentStatus: INCIDENT_STATES.OPEN,
    };

    const res = evaluateIncidentTransition(state, false);
    expect(res.action).toBe("NO_CHANGE");
    expect(res.shouldCreateIncident).toBe(false);
    expect(res.nextFailures).toBe(4);
  });

  it("treats ACKNOWLEDGED as active outage: does NOT open duplicate incident on failure", () => {
    const state = {
      consecutiveFailures: 3,
      consecutiveSuccesses: 0,
      failureThreshold: 3,
      recoveryThreshold: 3,
      activeIncidentId: "inc-1",
      activeIncidentStatus: INCIDENT_STATES.ACKNOWLEDGED,
    };

    const res = evaluateIncidentTransition(state, false);
    expect(res.action).toBe("NO_CHANGE");
    expect(res.shouldCreateIncident).toBe(false);
    expect(res.nextFailures).toBe(4);
    expect(res.nextStatus).toBe("down");
  });

  it("auto-resolves outage after reaching consecutive success recovery threshold (from OPEN)", () => {
    let state = {
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      failureThreshold: 3,
      recoveryThreshold: 3,
      activeIncidentId: "inc-1",
      activeIncidentStatus: INCIDENT_STATES.OPEN,
    };

    // 1st recovery success
    let r1 = evaluateIncidentTransition(state, true);
    expect(r1.action).toBe("NO_CHANGE");
    expect(r1.nextSuccesses).toBe(1);

    // 2nd recovery success
    let r2 = evaluateIncidentTransition(
      { ...state, consecutiveSuccesses: r1.nextSuccesses, consecutiveFailures: r1.nextFailures },
      true
    );
    expect(r2.action).toBe("NO_CHANGE");
    expect(r2.nextSuccesses).toBe(2);

    // 3rd recovery success -> AUTO RESOLVE!
    let r3 = evaluateIncidentTransition(
      { ...state, consecutiveSuccesses: r2.nextSuccesses, consecutiveFailures: r2.nextFailures },
      true
    );
    expect(r3.action).toBe("INCIDENT_RESOLVED");
    expect(r3.shouldResolveIncident).toBe(true);
    expect(r3.targetIncidentId).toBe("inc-1");
    expect(r3.nextStatus).toBe("operational");
  });

  it("auto-resolves outage after reaching consecutive success recovery threshold (from ACKNOWLEDGED)", () => {
    let state = {
      consecutiveFailures: 0,
      consecutiveSuccesses: 2,
      failureThreshold: 3,
      recoveryThreshold: 3,
      activeIncidentId: "inc-ack-1",
      activeIncidentStatus: INCIDENT_STATES.ACKNOWLEDGED,
    };

    // 3rd recovery success while in ACKNOWLEDGED state -> AUTO RESOLVE!
    let res = evaluateIncidentTransition(state, true);
    expect(res.action).toBe("INCIDENT_RESOLVED");
    expect(res.shouldResolveIncident).toBe(true);
    expect(res.targetIncidentId).toBe("inc-ack-1");
    expect(res.nextStatus).toBe("operational");
  });
});
