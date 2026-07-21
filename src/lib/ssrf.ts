import dns from "node:dns/promises";
import net from "node:net";

export interface SSRFValidationResult {
  isValid: boolean;
  reason?: string;
  resolvedIps?: string[];
}

/**
 * Checks if an IPv4 address is in a private, loopback, link-local, or reserved range.
 */
function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return true; // invalid IP format considered unsafe
  }

  const [a, b, c, d] = parts;

  // 0.0.0.0/8 (Current network)
  if (a === 0) return true;

  // 10.0.0.0/8 (Private network)
  if (a === 10) return true;

  // 100.64.0.0/10 (Carrier-grade NAT)
  if (a === 100 && b >= 64 && b <= 127) return true;

  // 127.0.0.0/8 (Loopback)
  if (a === 127) return true;

  // 169.254.0.0/16 (Link-local / Cloud Metadata like 169.254.169.254)
  if (a === 169 && b === 254) return true;

  // 172.16.0.0/12 (Private network: 172.16.0.0 – 172.31.255.255)
  if (a === 172 && b >= 16 && b <= 31) return true;

  // 192.0.0.0/24 (IETF Protocol Assignments)
  if (a === 192 && b === 0 && c === 0) return true;

  // 192.0.2.0/24 (TEST-NET-1)
  if (a === 192 && b === 0 && c === 2) return true;

  // 192.168.0.0/16 (Private network)
  if (a === 192 && b === 168) return true;

  // 198.18.0.0/15 (Benchmarking)
  if (a === 198 && (b === 18 || b === 19)) return true;

  // 198.51.100.0/24 (TEST-NET-2)
  if (a === 198 && b === 51 && c === 100) return true;

  // 203.0.113.0/24 (TEST-NET-3)
  if (a === 203 && b === 0 && c === 113) return true;

  // 224.0.0.0/4 (Multicast: 224.0.0.0 - 239.255.255.255)
  if (a >= 224 && a <= 239) return true;

  // 240.0.0.0/4 (Reserved: 240.0.0.0 - 255.255.255.254)
  // 255.255.255.255 (Broadcast)
  if (a >= 240) return true;

  return false;
}

/**
 * Checks if an IPv6 address is loopback, unique local, link-local, or IPv4-mapped private.
 */
function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();

  // Unspecified ::
  if (normalized === "::" || normalized === "0000:0000:0000:0000:0000:0000:0000:0000") {
    return true;
  }

  // Loopback ::1
  if (normalized === "::1" || normalized === "0000:0000:0000:0000:0000:0000:0000:0001") {
    return true;
  }

  // IPv4-mapped IPv6 (::ffff:127.0.0.1 or ::ffff:7f00:1)
  if (normalized.startsWith("::ffff:") || normalized.startsWith("0:0:0:0:0:ffff:")) {
    const v4Part = normalized.replace(/^.*:/, "");
    if (net.isIPv4(v4Part)) {
      return isPrivateIPv4(v4Part);
    }
    return true;
  }

  // Unique local addresses (fc00::/7 -> fc.. or fd..)
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) {
    return true;
  }

  // Link-local unicast (fe80::/10 -> fe8, fe9, fea, feb)
  if (
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb")
  ) {
    return true;
  }

  // Multicast (ff00::/8)
  if (normalized.startsWith("ff")) {
    return true;
  }

  return false;
}

export function isPrivateIP(ip: string): boolean {
  const version = net.isIP(ip);
  if (version === 4) return isPrivateIPv4(ip);
  if (version === 6) return isPrivateIPv6(ip);
  return true; // Not a valid IP -> block
}

/**
 * Validates a user-provided target URL against SSRF threats.
 * Resolves all DNS entries to ensure none point to internal/reserved IP space.
 */
export async function validateTargetUrl(rawUrl: string): Promise<SSRFValidationResult> {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    return { isValid: false, reason: "Malformed URL syntax" };
  }

  // 1. Enforce HTTP/HTTPS only
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    return { isValid: false, reason: `Disallowed protocol '${parsedUrl.protocol}'. Only http: and https: are allowed.` };
  }

  // 2. Reject credentials in URLs
  if (parsedUrl.username || parsedUrl.password) {
    return { isValid: false, reason: "Embedded user credentials in target URL are prohibited." };
  }

  const hostname = parsedUrl.hostname.trim();

  // 3. Prohibit standard local identifiers
  const lowerHost = hostname.toLowerCase();
  if (
    lowerHost === "localhost" ||
    lowerHost.endsWith(".localhost") ||
    lowerHost.endsWith(".local") ||
    lowerHost.endsWith(".internal")
  ) {
    return { isValid: false, reason: `Target host '${hostname}' is a local or internal domain.` };
  }

  // 4. If hostname is directly an IP address
  const directIPVersion = net.isIP(hostname);
  if (directIPVersion !== 0) {
    if (isPrivateIP(hostname)) {
      return { isValid: false, reason: `Target IP '${hostname}' resolves to private or restricted network space.` };
    }
    return { isValid: true, resolvedIps: [hostname] };
  }

  // 5. DNS Resolution check
  try {
    const addresses = await dns.lookup(hostname, { all: true });

    if (!addresses || addresses.length === 0) {
      return { isValid: false, reason: `Failed to resolve host '${hostname}'.` };
    }

    const resolvedIps = addresses.map((a) => a.address);

    for (const addr of addresses) {
      if (isPrivateIP(addr.address)) {
        return {
          isValid: false,
          reason: `Host '${hostname}' resolved to prohibited address '${addr.address}'.`,
          resolvedIps,
        };
      }
    }

    return { isValid: true, resolvedIps };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { isValid: false, reason: `DNS resolution error for '${hostname}': ${msg}` };
  }
}
