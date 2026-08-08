import { validateTargetUrl } from "@/lib/ssrf";

export interface CheckExecutionOptions {
  url: string;
  method?: string;
  timeoutMs?: number;
  expectedStatusCode?: number;
  maxRedirects?: number;
}

export interface CheckExecutionResult {
  success: boolean;
  statusCode: number | null;
  responseTimeMs: number;
  checkedAt: Date;
  errorType: string | null;
  errorMessage: string | null;
}

/**
 * Executes a secure, bounded HTTP health check against a target URL.
 * Enforces SSRF defense, redirect boundary inspection, strict timeout, and bounded payload reading.
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
  } = options;

  const checkedAt = new Date();
  const startTime = performance.now();

  // 1. SSRF check on initial URL
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

  let currentUrl = url;
  let redirectsFollowed = 0;

  while (redirectsFollowed <= maxRedirects) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(currentUrl, {
        method,
        signal: controller.signal,
        redirect: "manual",
        headers: {
          "User-Agent": "HealthyAPI-Monitor/1.0 (+https://healthyapi.dev)",
          Accept: "*/*",
          Connection: "close",
        },
      });

      clearTimeout(timeoutId);

      // Handle Redirects safely
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const locationHeader = response.headers.get("location");
        if (!locationHeader) {
          const elapsed = Math.round(performance.now() - startTime);
          return {
            success: false,
            statusCode: response.status,
            responseTimeMs: elapsed,
            checkedAt,
            errorType: "HTTP_REDIRECT_ERROR",
            errorMessage: `Received ${response.status} redirect without Location header`,
          };
        }

        const nextUrl = new URL(locationHeader, currentUrl).toString();
        redirectsFollowed++;

        if (redirectsFollowed > maxRedirects) {
          const elapsed = Math.round(performance.now() - startTime);
          return {
            success: false,
            statusCode: response.status,
            responseTimeMs: elapsed,
            checkedAt,
            errorType: "TOO_MANY_REDIRECTS",
            errorMessage: `Exceeded maximum redirect depth of ${maxRedirects}`,
          };
        }

        // Validate redirect target against SSRF
        const redirectSsrf = await validateTargetUrl(nextUrl);
        if (!redirectSsrf.isValid) {
          const elapsed = Math.round(performance.now() - startTime);
          return {
            success: false,
            statusCode: null,
            responseTimeMs: elapsed,
            checkedAt,
            errorType: "SSRF_BLOCKED",
            errorMessage: `Redirect to ${nextUrl} blocked: ${redirectSsrf.reason}`,
          };
        }

        currentUrl = nextUrl;
        continue;
      }

      // Read a bounded chunk of the body to prevent connection hangs or memory blowouts
      const reader = response.body?.getReader();
      if (reader) {
        let bytesRead = 0;
        const maxBytes = 64 * 1024; // 64 KB limit
        try {
          while (bytesRead < maxBytes) {
            const { done, value } = await reader.read();
            if (done) break;
            bytesRead += value ? value.length : 0;
          }
        } finally {
          reader.cancel().catch(() => {});
        }
      }

      const elapsed = Math.round(performance.now() - startTime);
      const isSuccess = response.status === expectedStatusCode;

      let errorType: string | null = null;
      let errorMessage: string | null = null;

      if (!isSuccess) {
        if (response.status >= 500) {
          errorType = "HTTP_5XX";
          errorMessage = `HTTP server returned ${response.status} (expected ${expectedStatusCode})`;
        } else if (response.status >= 400) {
          errorType = "HTTP_4XX";
          errorMessage = `HTTP client error ${response.status} (expected ${expectedStatusCode})`;
        } else {
          errorType = "UNEXPECTED_STATUS";
          errorMessage = `Received status ${response.status} (expected ${expectedStatusCode})`;
        }
      }

      return {
        success: isSuccess,
        statusCode: response.status,
        responseTimeMs: elapsed,
        checkedAt,
        errorType,
        errorMessage,
      };
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      const elapsed = Math.round(performance.now() - startTime);

      const error = err as Error;
      if (error.name === "AbortError") {
        return {
          success: false,
          statusCode: null,
          responseTimeMs: elapsed,
          checkedAt,
          errorType: "TIMEOUT",
          errorMessage: `Request timed out after ${timeoutMs}ms`,
        };
      }

      const message = error.message || String(error);
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
