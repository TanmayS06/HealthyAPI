import { describe, it, expect } from "vitest";
import { executeEndpointCheck } from "../../src/server/monitors/checker";

describe("Endpoint Checker Engine", () => {
  it("should immediately block SSRF targets without making HTTP requests", async () => {
    const result = await executeEndpointCheck({
      url: "http://127.0.0.1:8080/health",
      timeoutMs: 2000,
    });

    expect(result.success).toBe(false);
    expect(result.errorType).toBe("SSRF_BLOCKED");
    expect(result.errorMessage).toContain("private or restricted");
  });

  it("should block cloud metadata endpoints", async () => {
    const result = await executeEndpointCheck({
      url: "http://169.254.169.254/latest/meta-data/",
      timeoutMs: 2000,
    });

    expect(result.success).toBe(false);
    expect(result.errorType).toBe("SSRF_BLOCKED");
  });

  it("should handle invalid protocols", async () => {
    const result = await executeEndpointCheck({
      url: "ftp://example.com/health",
      timeoutMs: 2000,
    });

    expect(result.success).toBe(false);
    expect(result.errorType).toBe("SSRF_BLOCKED");
  });
});
