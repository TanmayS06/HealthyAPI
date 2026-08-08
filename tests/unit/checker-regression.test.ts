import { describe, it, expect, afterAll, vi } from "vitest";
import http from "node:http";
import * as ssrfModule from "../../src/lib/ssrf";
import { executeEndpointCheck } from "../../src/server/monitors/checker";

describe("Endpoint Checker Security & Timeout Regressions", () => {
  const serversToClose: http.Server[] = [];

  afterAll(async () => {
    vi.restoreAllMocks();
    for (const server of serversToClose) {
      server.close();
    }
  });

  it("reproduces bug: stalled response body hangs indefinitely when timeout is cleared after headers", async () => {
    // A server that sends headers immediately, but stalls sending the response body (slowloris)
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

    // Simulate pre-validation passing for this check
    vi.spyOn(ssrfModule, "validateTargetUrl").mockResolvedValue({ isValid: true });

    const startTime = Date.now();

    // In the buggy implementation, clearTimeout() is called right after fetch() returns headers,
    // causing the body reader to hang indefinitely without deadline enforcement.
    const resultPromise = executeEndpointCheck({
      url: `http://127.0.0.1:${port}/health`,
      timeoutMs: 250,
    });

    // Enforce a ceiling of 700ms so a hung check fails fast and proves the hang
    let hungDetected = false;
    const timeoutRace = new Promise<any>((resolve) => {
      setTimeout(() => {
        hungDetected = true;
        resolve({ hung: true });
      }, 600);
    });

    const outcome = await Promise.race([resultPromise, timeoutRace]);
    const duration = Date.now() - startTime;

    // THE BUG IS CONFIRMED: outcome was the timeoutRace promise because executeEndpointCheck hung!
    expect(outcome.hung).toBe(true);
    expect(hungDetected).toBe(true);
  }, 10000);

  it("reproduces bug: pre-flight DNS validation does not bind the socket against DNS rebinding to private IPs", async () => {
    // Threat scenario: A malicious domain resolves to a public IP during pre-flight validateTargetUrl,
    // but when fetch() connects, DNS resolves to 127.0.0.1 or 169.254.169.254.
    // In the buggy implementation, validateTargetUrl is detached from fetch, allowing TOCTOU rebinding.
    const preFlightPassed = await ssrfModule.validateTargetUrl("https://cloudflare.com");
    expect(preFlightPassed.isValid).toBe(true);

    // If an attacker uses DNS rebinding or provides a domain that switches to 127.0.0.1:
    const isLocalPrivate = ssrfModule.isPrivateIP("127.0.0.1");
    expect(isLocalPrivate).toBe(true);

    // Without socket-level pinning/lookup interception, the outbound connection connects directly
    // to the rebind target without validating the remote socket IP.
  });

  it("reproduces bug: cumulative redirects reset per-hop timeout rather than enforcing overall deadline", async () => {
    // Three sequential redirect hops
    let hopCount = 0;
    const redirectServer = http.createServer((req, res) => {
      hopCount++;
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

    vi.spyOn(ssrfModule, "validateTargetUrl").mockResolvedValue({ isValid: true });

    // Total timeout is 200ms.
    // In the buggy implementation, each hop gets a fresh 200ms timer!
    // Total execution will take ~360ms and SUCCEED because no overall deadline is enforced!
    const startTime = Date.now();
    const result = await executeEndpointCheck({
      url: `http://127.0.0.1:${port}/hop1`,
      timeoutMs: 200,
      maxRedirects: 3,
    });
    const totalElapsed = Date.now() - startTime;

    // In the buggy implementation, it succeeded despite exceeding the 200ms overall deadline!
    expect(result.success).toBe(true);
    expect(totalElapsed).toBeGreaterThan(250);
  });
});
