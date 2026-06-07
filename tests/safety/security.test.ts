import { describe, it, expect } from "vitest";
import {
  generateToken,
  buildSessionCookie,
  parseCookies,
  checkToken,
  validateHost,
  contentSecurityPolicy,
  securityHeaders,
  isRemoteResourceUrl,
  blockRemoteResourcesInHtml,
  TOKEN_COOKIE_NAME,
} from "../../src/safety/security.js";

describe("session token + cookie", () => {
  it("generates distinct high-entropy tokens", () => {
    const a = generateToken();
    const b = generateToken();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });

  it("builds an HttpOnly SameSite=Strict cookie and keeps the token out of URLs", () => {
    const cookie = buildSessionCookie("abc123");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).toContain("Path=/");
    expect(cookie.startsWith(`${TOKEN_COOKIE_NAME}=abc123`)).toBe(true);
  });

  it("parses cookies", () => {
    expect(parseCookies("stet_token=xyz; other=1")).toEqual({
      stet_token: "xyz",
      other: "1",
    });
  });
});

describe("token check", () => {
  const expected = "s3cr3t";
  it("accepts a matching header token", () => {
    expect(checkToken({ headerToken: expected }, expected)).toBe(true);
  });
  it("accepts a matching cookie token", () => {
    expect(
      checkToken({ cookieHeader: `stet_token=${expected}` }, expected),
    ).toBe(true);
  });
  it("rejects a missing token", () => {
    expect(checkToken({}, expected)).toBe(false);
  });
  it("rejects a wrong token", () => {
    expect(checkToken({ headerToken: "nope" }, expected)).toBe(false);
    expect(
      checkToken({ cookieHeader: "stet_token=nope" }, expected),
    ).toBe(false);
  });
  it("rejects when no expected token configured", () => {
    expect(checkToken({ headerToken: "anything" }, "")).toBe(false);
  });
});

describe("Host validation (DNS-rebinding defense)", () => {
  const port = 43117;
  it("accepts loopback hosts on the right port", () => {
    expect(validateHost(`127.0.0.1:${port}`, port)).toBe(true);
    expect(validateHost(`localhost:${port}`, port)).toBe(true);
    expect(validateHost(`[::1]:${port}`, port)).toBe(true);
    expect(validateHost(`127.0.0.1`, port)).toBe(true);
  });
  it("rejects a hostile Host header", () => {
    expect(validateHost(`evil.com:${port}`, port)).toBe(false);
    expect(validateHost(`attacker.example`, port)).toBe(false);
    expect(validateHost(`127.0.0.1:9999`, port)).toBe(false);
    expect(validateHost(undefined, port)).toBe(false);
    expect(validateHost("", port)).toBe(false);
  });
});

describe("security headers", () => {
  it("emits a restrictive CSP that blocks remote loads", () => {
    const csp = contentSecurityPolicy();
    expect(csp).toContain("default-src 'none'");
    expect(csp).not.toContain("http://");
    expect(csp).not.toContain("https://");
    expect(csp).toContain("img-src 'self' data:");
  });
  it("includes no-referrer and nosniff in the header set", () => {
    const h = securityHeaders();
    expect(h["Referrer-Policy"]).toBe("no-referrer");
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["Content-Security-Policy"]).toBe(contentSecurityPolicy());
  });
});

describe("remote resource blocking", () => {
  it("classifies remote vs local URLs", () => {
    expect(isRemoteResourceUrl("https://example.com/a.png")).toBe(true);
    expect(isRemoteResourceUrl("http://example.com/a.png")).toBe(true);
    expect(isRemoteResourceUrl("//cdn.example.com/a.png")).toBe(true);
    expect(isRemoteResourceUrl("./local.png")).toBe(false);
    expect(isRemoteResourceUrl("img/local.png")).toBe(false);
    expect(isRemoteResourceUrl("data:image/png;base64,AAAA")).toBe(false);
  });

  it("rewrites remote image sources so they cannot leak via Referer", () => {
    const html = '<img src="https://tracker.example/pixel.png"><img src="local.png">';
    const out = blockRemoteResourcesInHtml(html);
    expect(out).not.toContain("tracker.example");
    expect(out).toContain("about:blank#stet-blocked-remote");
    expect(out).toContain('src="local.png"');
  });
});
