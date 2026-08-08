import http from "node:http";
import https from "node:https";
import dns from "node:dns";
import net from "node:net";
import { isPrivateIP, validateTargetUrl } from "@/lib/ssrf";

export interface CheckExecutionOptions {
  url: string;
  method?: string;
  timeoutMs?: number;
  expectedStatusCode?: number;
  maxRedirects?: number;
  headers?: Record<string, string>;
  _allowLoopbackForTesting?: boolean;
}

export interface CheckExecutionResult {
  success: boolean;
  statusCode: number | null;
  responseTimeMs: number;
  checkedAt: Date;
  errorType: string | null;
  errorMessage: string | null;
}

function isRestrictedIP(ip: string, allowLoopback: boolean = false): boolean {
  if (allowLoopback && (ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1")) {
    return false;
  }
  return isPrivateIP(ip);
}

/**
 * Custom DNS lookup hook for Node http/https agents.
 * Validates all returned IP records against SSRF blacklist and pins connection
 * to the first validated IP, preventing DNS rebinding (TOCTOU) attacks.
 */
function createSafeLookup(allowLoopback: boolean = false) {
  return function safeLookup(
    hostname: string,
    options: any,
    callback: (err: Error | null, address?: any, family?: number) => void
  ) {
    if (typeof options === "function") {
      callback = options;
      options = {};
    }

    // Direct IP address validation
    if (net.isIP(hostname)) {
      if (isRestrictedIP(hostname, allowLoopback)) {
        return callback(new Error(`SSRF_BLOCKED: Prohibited private IP address '${hostname}'`));
      }
      const family = net.isIPv4(hostname) ? 4 : 6;
      if (options && options.all) {
        return callback(null, [{ address: hostname, family }]);
      }
      return callback(null, hostname, family);
    }

    // Hostname string blacklist
    const lower = hostname.toLowerCase();
    const isLocalhost =
      lower === "localhost" ||
      lower.endsWith(".localhost") ||
      lower.endsWith(".local") ||
      lower.endsWith(".internal");

    if (isLocalhost && !allowLoopback) {
      return callback(new Error(`SSRF_BLOCKED: Prohibited local hostname '${hostname}'`));
    }

    // Resolve via DNS and inspect every IP
    dns.lookup(hostname, { all: true }, (err, addresses) => {
      if (err) return callback(err);
      if (!addresses || addresses.length === 0) {
        return callback(new Error(`ENOTFOUND: No DNS addresses found for '${hostname}'`));
      }

      for (const addr of addresses) {
        if (isRestrictedIP(addr.address, allowLoopback)) {
          return callback(
            new Error(`SSRF_BLOCKED: Host '${hostname}' resolved to prohibited address '${addr.address}'`)
          );
        }
      }

      // Pin connection: return validated address
      if (options && options.all) {
        callback(null, [addresses[0]]);
      } else {
        callback(null, addresses[0].address, addresses[0].family);
      }
    });
  };
}

interface SingleHopResult {
  statusCode: number;
  headers: http.IncomingHttpHeaders;
  bytesRead: number;
}

/**
 * Performs a single secure HTTP/HTTPS request hop with:
 * - Deadline enforcement across headers AND response body consumption
 * - Safe DNS lookup and socket remote IP verification
 * - Bounded payload reading (up to 64 KB)
 */
function executeSecureHop(
  targetUrl: string,
  method: string,
  deadlineMs: number,
  customHeaders?: Record<string, string>,
  allowLoopback: boolean = false
): Promise<SingleHopResult> {
  return new Promise((resolve, reject) => {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(targetUrl);
    } catch (err) {
      return reject(new Error(`Malformed URL: ${(err as Error).message}`));
    }

    const remainingTimeout = deadlineMs - performance.now();
    if (remainingTimeout <= 0) {
      const err = new Error("Request deadline exceeded");
      err.name = "TimeoutError";
      return reject(err);
    }

    const isHttps = parsedUrl.protocol === "https:";
    const client = isHttps ? https : http;
    const safeLookup = createSafeLookup(allowLoopback);

    let isSettled = false;
    let deadlineTimer: NodeJS.Timeout | null = null;
    let currentSocket: net.Socket | null = null;

    const cleanup = () => {
      if (deadlineTimer) {
        clearTimeout(deadlineTimer);
        deadlineTimer = null;
      }
    };

    const fail = (err: Error) => {
      if (isSettled) return;
      isSettled = true;
      cleanup();
      if (currentSocket) {
        currentSocket.destroy();
      }
      req.destroy();
      reject(err);
    };

    // Overall deadline timer covers connection, TLS, headers, AND entire body reading!
    deadlineTimer = setTimeout(() => {
      const err = new Error(`Request timed out after deadline`);
      err.name = "TimeoutError";
      fail(err);
    }, remainingTimeout);

    const reqOptions: http.RequestOptions = {
      protocol: parsedUrl.protocol,
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: `${parsedUrl.pathname}${parsedUrl.search}`,
      method: method.toUpperCase(),
      headers: {
        "User-Agent": "HealthyAPI-Monitor/1.0 (+https://healthyapi.dev)",
        Accept: "*/*",
        Connection: "close",
        ...customHeaders,
      },
      lookup: safeLookup as any,
    };

    const req = client.request(reqOptions, (res) => {
      const statusCode = res.statusCode || 0;
      let bytesRead = 0;
      const maxBytes = 64 * 1024; // 64 KB limit

      res.on("data", (chunk: Buffer) => {
        bytesRead += chunk.length;
        if (bytesRead >= maxBytes) {
          // Bounded reading reached: cancel remaining body cleanly
          res.destroy();
          if (!isSettled) {
            isSettled = true;
            cleanup();
            resolve({ statusCode, headers: res.headers, bytesRead });
          }
        }
      });

      res.on("end", () => {
        if (!isSettled) {
          isSettled = true;
          cleanup();
          resolve({ statusCode, headers: res.headers, bytesRead });
        }
      });

      res.on("error", (err) => {
        fail(err);
      });
    });

    // Inspect the underlying socket connection for DNS rebinding protection
    req.on("socket", (socket: net.Socket) => {
      currentSocket = socket;

      const checkRemote = () => {
        const remote = socket.remoteAddress;
        if (remote && isRestrictedIP(remote, allowLoopback)) {
          fail(new Error(`SSRF_BLOCKED: Connected socket remote address is private: ${remote}`));
        }
      };

      if (socket.connecting) {
        socket.once("connect", checkRemote);
      } else {
        checkRemote();
      }

      socket.on("error", (err) => {
        fail(err);
      });
    });

    req.on("error", (err) => {
      fail(err);
    });

    req.end();
  });
}

/**
 * Executes a secure, bounded HTTP health check against a target URL.
 * Enforces SSRF defense, DNS rebinding mitigation, strict overall request deadline,
 * bounded payload consumption, and safe redirect recursion.
 */
export async function executeEndpointCheck(
  options: CheckExecutionOptions
): Promise<CheckExecutionResult> {
  const {
    url,
    method = "GET",
    timeoutMs = 5000,
    expectedStatusCode = 200,
    maxRedirects = 3,
    headers,
    _allowLoopbackForTesting = false,
  } = options;

  const checkedAt = new Date();
  const startTime = performance.now();
  const overallDeadline = startTime + timeoutMs;

  // 1. SSRF check on initial target URL
  if (!_allowLoopbackForTesting) {
    const ssrfCheck = await validateTargetUrl(url);
    if (!ssrfCheck.isValid) {
      return {
        success: false,
        statusCode: null,
        responseTimeMs: Math.round(performance.now() - startTime),
        checkedAt,
        errorType: "SSRF_BLOCKED",
        errorMessage: ssrfCheck.reason || "Request blocked by SSRF defense system",
      };
    }
  }

  let currentUrl = url;
  let redirectsFollowed = 0;

  while (redirectsFollowed <= maxRedirects) {
    // Verify overall deadline before each hop
    const remainingTime = overallDeadline - performance.now();
    if (remainingTime <= 0) {
      return {
        success: false,
        statusCode: null,
        responseTimeMs: Math.round(performance.now() - startTime),
        checkedAt,
        errorType: "TIMEOUT",
        errorMessage: `Request timed out after ${timeoutMs}ms deadline`,
      };
    }

    try {
      const hopResult = await executeSecureHop(
        currentUrl,
        method,
        overallDeadline,
        headers,
        _allowLoopbackForTesting
      );

      // Handle HTTP redirects (301, 302, 303, 307, 308)
      if ([301, 302, 303, 307, 308].includes(hopResult.statusCode)) {
        const locationHeader = hopResult.headers["location"];
        if (!locationHeader || Array.isArray(locationHeader)) {
          return {
            success: false,
            statusCode: hopResult.statusCode,
            responseTimeMs: Math.round(performance.now() - startTime),
            checkedAt,
            errorType: "HTTP_REDIRECT_ERROR",
            errorMessage: `Received ${hopResult.statusCode} redirect without valid Location header`,
          };
        }

        redirectsFollowed++;
        if (redirectsFollowed > maxRedirects) {
          return {
            success: false,
            statusCode: hopResult.statusCode,
            responseTimeMs: Math.round(performance.now() - startTime),
            checkedAt,
            errorType: "TOO_MANY_REDIRECTS",
            errorMessage: `Exceeded maximum redirect depth of ${maxRedirects}`,
          };
        }

        let nextUrl: string;
        try {
          nextUrl = new URL(locationHeader, currentUrl).toString();
        } catch {
          return {
            success: false,
            statusCode: hopResult.statusCode,
            responseTimeMs: Math.round(performance.now() - startTime),
            checkedAt,
            errorType: "HTTP_REDIRECT_ERROR",
            errorMessage: `Malformed redirect location '${locationHeader}'`,
          };
        }

        // Validate redirect target URL against SSRF
        if (!_allowLoopbackForTesting) {
          const redirectSsrf = await validateTargetUrl(nextUrl);
          if (!redirectSsrf.isValid) {
            return {
              success: false,
              statusCode: null,
              responseTimeMs: Math.round(performance.now() - startTime),
              checkedAt,
              errorType: "SSRF_BLOCKED",
              errorMessage: `Redirect to ${nextUrl} blocked: ${redirectSsrf.reason}`,
            };
          }
        }

        currentUrl = nextUrl;
        continue;
      }

      // Response received and body consumed within overall deadline
      const elapsed = Math.round(performance.now() - startTime);
      const isSuccess = hopResult.statusCode === expectedStatusCode;

      let errorType: string | null = null;
      let errorMessage: string | null = null;

      if (!isSuccess) {
        if (hopResult.statusCode >= 500) {
          errorType = "HTTP_5XX";
          errorMessage = `HTTP server returned ${hopResult.statusCode} (expected ${expectedStatusCode})`;
        } else if (hopResult.statusCode >= 400) {
          errorType = "HTTP_4XX";
          errorMessage = `HTTP client error ${hopResult.statusCode} (expected ${expectedStatusCode})`;
        } else {
          errorType = "UNEXPECTED_STATUS";
          errorMessage = `Received status ${hopResult.statusCode} (expected ${expectedStatusCode})`;
        }
      }

      return {
        success: isSuccess,
        statusCode: hopResult.statusCode,
        responseTimeMs: elapsed,
        checkedAt,
        errorType,
        errorMessage,
      };
    } catch (err: unknown) {
      const elapsed = Math.round(performance.now() - startTime);
      const error = err as Error;
      const message = error.message || String(error);

      if (error.name === "TimeoutError" || message.includes("deadline") || message.includes("timed out")) {
        return {
          success: false,
          statusCode: null,
          responseTimeMs: elapsed,
          checkedAt,
          errorType: "TIMEOUT",
          errorMessage: `Request timed out after ${timeoutMs}ms`,
        };
      }

      if (message.includes("SSRF_BLOCKED") || message.includes("private") || message.includes("prohibited")) {
        return {
          success: false,
          statusCode: null,
          responseTimeMs: elapsed,
          checkedAt,
          errorType: "SSRF_BLOCKED",
          errorMessage: message,
        };
      }

      const isDns = message.toLowerCase().includes("enotfound") || message.toLowerCase().includes("dns");
      return {
        success: false,
        statusCode: null,
        responseTimeMs: elapsed,
        checkedAt,
        errorType: isDns ? "DNS_ERROR" : "CONNECTION_FAILED",
        errorMessage: message,
      };
    }
  }

  return {
    success: false,
    statusCode: null,
    responseTimeMs: Math.round(performance.now() - startTime),
    checkedAt,
    errorType: "TOO_MANY_REDIRECTS",
    errorMessage: `Maximum redirects exceeded`,
  };
}
