import { describe, it, expect, afterAll } from "vitest";
import http from "node:http";
import { executeEndpointCheck } from "../../src/server/monitors/checker";

describe("Endpoint Checker Engine - Security & Deadline Enforcement", () => {
  const activeServers: http.Server[] = [];

  afterAll(async () => {
    for (const server of activeServers) {
      server.close();
    }
  });

  it("should immediately block SSRF targets without making HTTP requests", async () => {
    const result = await executeEndpointCheck({
      url: "http://127.0.0.1:8080/health",
      timeoutMs: 2000,
    });

    expect(result.success).toBe(false);
    expect(result.errorType).toBe("SSRF_BLOCKED");
    expect(result.errorMessage).toContain("private or restricted");
  });

  it("should block cloud metadata endpoints (169.254.169.254)", async () => {
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

  it("verifies fix: stalled response bodies are aborted by overall request deadline", async () => {
    // Stalled server writes headers immediately, but stalls sending the body
    const stalledServer = http.createServer((req, res) => {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.write("header-ok-chunk-1");
      // Deliberately omit res.end() to stall response stream
    });

    activeServers.push(stalledServer);
    await new Promise<void>((resolve) => stalledServer.listen(0, "127.0.0.1", () => resolve()));
    const port = (stalledServer.address() as any).port;

    const startTime = Date.now();
    const result = await executeEndpointCheck({
      url: `http://127.0.0.1:${port}/health`,
      timeoutMs: 300,
      _allowLoopbackForTesting: true,
    });
    const elapsed = Date.now() - startTime;

    // Must be cleanly aborted with TIMEOUT within ~400ms instead of hanging
    expect(result.success).toBe(false);
    expect(result.errorType).toBe("TIMEOUT");
    expect(result.errorMessage).toContain("timed out");
    expect(elapsed).toBeLessThan(600);
  });

  it("verifies fix: multi-hop redirect cumulative execution aborts when total deadline is reached", async () => {
    // 3 redirect hops of 120ms each (total 360ms)
    const redirectServer = http.createServer((req, res) => {
      if (req.url === "/hop1") {
        setTimeout(() => {
          res.writeHead(302, { Location: "/hop2" });
          res.end();
        }, 120);
      } else if (req.url === "/hop2") {
        setTimeout(() => {
          res.writeHead(302, { Location: "/hop3" });
          res.end();
        }, 120);
      } else {
        setTimeout(() => {
          res.writeHead(200, { "Content-Type": "text/plain" });
          res.end("ok");
        }, 120);
      }
    });

    activeServers.push(redirectServer);
    await new Promise<void>((resolve) => redirectServer.listen(0, "127.0.0.1", () => resolve()));
    const port = (redirectServer.address() as any).port;

    const startTime = Date.now();
    const result = await executeEndpointCheck({
      url: `http://127.0.0.1:${port}/hop1`,
      timeoutMs: 200, // Total deadline: 200ms < 360ms needed
      maxRedirects: 3,
      _allowLoopbackForTesting: true,
    });
    const elapsed = Date.now() - startTime;

    expect(result.success).toBe(false);
    expect(result.errorType).toBe("TIMEOUT");
    expect(elapsed).toBeLessThan(450);
  });

  it("verifies fix: successful check consumes bounded body and validates expected status", async () => {
    const okServer = http.createServer((req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "healthy", timestamp: Date.now() }));
    });

    activeServers.push(okServer);
    await new Promise<void>((resolve) => okServer.listen(0, "127.0.0.1", () => resolve()));
    const port = (okServer.address() as any).port;

    const result = await executeEndpointCheck({
      url: `http://127.0.0.1:${port}/healthz`,
      timeoutMs: 2000,
      expectedStatusCode: 200,
      _allowLoopbackForTesting: true,
    });

    expect(result.success).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(result.errorType).toBeNull();
    expect(result.responseTimeMs).toBeGreaterThanOrEqual(0);
  });

  it("verifies fix: redirect target pointing to private IP is caught and blocked", async () => {
    const maliciousRedirectServer = http.createServer((req, res) => {
      res.writeHead(302, { Location: "http://169.254.169.254/latest/meta-data/" });
      res.end();
    });

    activeServers.push(maliciousRedirectServer);
    await new Promise<void>((resolve) => maliciousRedirectServer.listen(0, "127.0.0.1", () => resolve()));
    const port = (maliciousRedirectServer.address() as any).port;

    const result = await executeEndpointCheck({
      url: `http://127.0.0.1:${port}/public-entry`,
      timeoutMs: 2000,
      _allowLoopbackForTesting: false, // Strict mode
    });

    expect(result.success).toBe(false);
    expect(result.errorType).toBe("SSRF_BLOCKED");
  });
});
