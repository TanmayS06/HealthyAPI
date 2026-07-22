import { describe, it, expect } from "vitest";
import { isPrivateIP, validateTargetUrl } from "../../src/lib/ssrf";

describe("SSRF Protection Engine", () => {
  it("should flag private IPv4 addresses", () => {
    expect(isPrivateIP("127.0.0.1")).toBe(true);
    expect(isPrivateIP("10.0.0.1")).toBe(true);
    expect(isPrivateIP("192.168.1.1")).toBe(true);
    expect(isPrivateIP("172.16.0.1")).toBe(true);
    expect(isPrivateIP("172.31.255.255")).toBe(true);
    expect(isPrivateIP("169.254.169.254")).toBe(true); // AWS/GCP metadata
    expect(isPrivateIP("0.0.0.0")).toBe(true);
    expect(isPrivateIP("255.255.255.255")).toBe(true);
  });

  it("should permit public IPv4 addresses", () => {
    expect(isPrivateIP("8.8.8.8")).toBe(false);
    expect(isPrivateIP("1.1.1.1")).toBe(false);
    expect(isPrivateIP("142.250.190.46")).toBe(false);
  });

  it("should flag private IPv6 addresses", () => {
    expect(isPrivateIP("::1")).toBe(true);
    expect(isPrivateIP("::")).toBe(true);
    expect(isPrivateIP("fe80::1")).toBe(true);
    expect(isPrivateIP("fc00::1")).toBe(true);
    expect(isPrivateIP("::ffff:127.0.0.1")).toBe(true);
  });

  it("should reject malicious loopback and metadata URLs", async () => {
    const r1 = await validateTargetUrl("http://127.0.0.1:8080/admin");
    expect(r1.isValid).toBe(false);

    const r2 = await validateTargetUrl("http://localhost/secret");
    expect(r2.isValid).toBe(false);

    const r3 = await validateTargetUrl("http://169.254.169.254/latest/meta-data/");
    expect(r3.isValid).toBe(false);

    const r4 = await validateTargetUrl("ftp://example.com/file");
    expect(r4.isValid).toBe(false);

    const r5 = await validateTargetUrl("file:///etc/passwd");
    expect(r5.isValid).toBe(false);
  });

  it("should validate public URLs", async () => {
    const res = await validateTargetUrl("https://cloudflare.com");
    expect(res.isValid).toBe(true);
  });
});
