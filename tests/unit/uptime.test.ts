import { describe, it, expect } from "vitest";

describe("Uptime & Percentile Mathematical Engine", () => {
  it("calculates exact check-based uptime percentages", () => {
    // Formula: (successful / total) * 100
    const calcUptime = (success: number, total: number) =>
      total > 0 ? Number(((success / total) * 100).toFixed(2)) : 100;

    expect(calcUptime(990, 1000)).toBe(99.0);
    expect(calcUptime(100, 100)).toBe(100.0);
    expect(calcUptime(0, 10)).toBe(0.0);
    expect(calcUptime(0, 0)).toBe(100.0);
    expect(calcUptime(999, 1000)).toBe(99.9);
  });

  it("calculates p95 tail latencies accurately", () => {
    const latencies = [10, 20, 25, 30, 35, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 200, 500];
    latencies.sort((a, b) => a - b);
    const p95Idx = Math.floor(latencies.length * 0.95);
    const p95Val = latencies[p95Idx];

    expect(p95Val).toBe(500); // 95th percentile captures high spikes
  });
});
