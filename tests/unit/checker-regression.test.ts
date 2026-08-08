import { describe, it, expect, afterAll, vi } from "vitest";
import http from "node:http";
import * as ssrfModule from "../../src/lib/ssrf";
import { executeEndpointCheck } from "../../src/server/monitors/checker";

describe("Endpoint Checker Security & Timeout Regressions - Bug Proof & Fix Verification", () => {
  const serversToClose: http.Server[] = [];

  afterAll(async () => {
    vi.restoreAllMocks();
    for (const server of serversToClose) {
      server.close();
    }
  });

  it("proves fix: stalled response body does NOT hang indefinitely, safely aborted by overall deadline", async () => {
    // Problem: In previous implementation, clearTimeout() was called before response body was consumed.
    // Solution: Keep the overall deadline active throughout stream consumption.
    const stalledServer = http.createServer((req, res) => {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.write("initial-header-chunk");
      // Intentionally do NOT call res.end() to simulate a slowloris / stalled body
    });

    serversToClose.push(stalledServer);
    await new Promise<void>((resolve) => {
      stalledServer.listen(0, "127.0.0.1", () => resolve());
    });

    const port = (stalledServer.address() as any).port;
    const startTime = Date.now();

    const result = await executeEndpointCheck({
      url: `http://127.0.0.1:${port}/health`,
      timeoutMs: 250,
      _allowLoopbackForTesting: true,
    });
    const duration = Date.now() - startTime;

    // Fix verified: Request times out cleanly without hanging worker threads
    expect(result.success).toBe(false);
    expect(result.errorType).toBe("TIMEOUT");
    expect(result.errorMessage).toContain("timed out");
    expect(duration).toBeLessThan(500);
  });

  it("proves fix: socket-level inspection blocks connection to private IPs even if pre-flight check is bypassed", async () => {
    // Problem: Pre-flight DNS check is susceptible to DNS rebinding (TOCTOU).
    // Solution: safeLookup and socket.remoteAddress validation verify the actual connected IP.
    const internalServer = http.createServer((req, res) => {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("confidential-internal-data");
    });

    serversToClose.push(internalServer);
    await new Promise<void>((resolve) => {
      internalServer.listen(0, "127.0.0.1", () => resolve());
    });
    const port = (internalServer.address() as any).port;

    // Even if an attacker's domain passed pre-flight validation by returning a public IP first:
    vi.spyOn(ssrfModule, "validateTargetUrl").mockResolvedValue({ isValid: true });

    // When connection attempt hits 127.0.0.1 without loopback testing allowance:
    const result = await executeEndpointCheck({
      url: `http://127.0.0.1:${port}/health`,
      timeoutMs: 1000,
      _allowLoopbackForTesting: false, // Strict production mode
    });

    // Fix verified: Blocked by socket-level SSRF defense
    expect(result.success).toBe(false);
    expect(result.errorType).toBe("SSRF_BLOCKED");
    expect(result.errorMessage).toMatch(/private|prohibited/i);
  });

  it("proves fix: cumulative redirects enforce overall deadline instead of resetting per-hop timer", async () => {
    // Problem: Previous implementation created a new timeout timer on each hop.
    // Solution: Single overall deadline tracks remaining time across all hops.
    const redirectServer = http.createServer((req, res) => {
      if (req.url === "/hop1") {
        setTimeout(() => {
          res.writeHead(302, { Location: "/hop2" });
          res.end();
        }, 120);
      } else if (req.url === "/hop2") {
        setTimeout(() => {
          res.writeHead(302, { Location: "/final" });
          res.end();
        }, 120);
      } else {
        setTimeout(() => {
          res.writeHead(200, { "Content-Type": "text/plain" });
          res.end("ok");
        }, 120);
      }
    });

    serversToClose.push(redirectServer);
    await new Promise<void>((resolve) => {
      redirectServer.listen(0, "127.0.0.1", () => resolve());
    });
    const port = (redirectServer.address() as any).port;

    // Total timeout is 200ms, while 3 hops take >300ms
    const startTime = Date.now();
    const result = await executeEndpointCheck({
      url: `http://127.0.0.1:${port}/hop1`,
      timeoutMs: 200,
      maxRedirects: 3,
      _allowLoopbackForTesting: true,
    });
    const totalElapsed = Date.now() - startTime;

    // Fix verified: Overall deadline aborts the cumulative chain
    expect(result.success).toBe(false);
    expect(result.errorType).toBe("TIMEOUT");
    expect(totalElapsed).toBeLessThan(400);
  });
});
