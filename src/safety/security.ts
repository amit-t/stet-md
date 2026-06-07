import { randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Loopback-server security primitives (master PRD §15, PRD 04). These are
 * pure, server-framework-agnostic helpers so the browser-UI subsystem can wire
 * them into its request pipeline. They cover token auth, Host validation,
 * security headers, and remote-resource blocking.
 */

export const TOKEN_COOKIE_NAME = "stet_token";
export const TOKEN_HEADER_NAME = "x-stet-token";

/** Cryptographically random session token (hex). */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString("hex");
}

/**
 * Set-Cookie value carrying the session token. HttpOnly (JS cannot read it),
 * SameSite=Strict (not sent on cross-site requests), Path=/. `Secure` is
 * intentionally omitted because the server is plain-HTTP loopback. The token
 * is never placed in a URL.
 */
export function buildSessionCookie(
  token: string,
  opts: { name?: string } = {},
): string {
  const name = opts.name ?? TOKEN_COOKIE_NAME;
  return `${name}=${token}; HttpOnly; SameSite=Strict; Path=/`;
}

/** Parse a `Cookie` header into a map. */
export function parseCookies(header: string | undefined | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (k) out[k] = v;
  }
  return out;
}

/** Constant-time string comparison that tolerates differing lengths. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export interface TokenSources {
  cookieHeader?: string | null;
  headerToken?: string | null;
  cookieName?: string;
}

/**
 * Validate the request's token against the expected value. A request without a
 * token, or with the wrong token, is rejected.
 */
export function checkToken(sources: TokenSources, expected: string): boolean {
  if (!expected) return false;
  const headerToken = sources.headerToken;
  if (headerToken && safeEqual(headerToken, expected)) return true;
  const cookies = parseCookies(sources.cookieHeader);
  const cookieToken = cookies[sources.cookieName ?? TOKEN_COOKIE_NAME];
  if (cookieToken && safeEqual(cookieToken, expected)) return true;
  return false;
}

/**
 * Validate the Host header to defend against DNS-rebinding. Only loopback
 * hosts on the expected port are allowed; anything else (e.g. an attacker's
 * domain resolving to 127.0.0.1) is rejected.
 */
export function validateHost(
  hostHeader: string | undefined | null,
  port: number,
): boolean {
  if (!hostHeader) return false;
  let host = hostHeader.trim();
  let hostPort: string | undefined;

  if (host.startsWith("[")) {
    // IPv6 literal: [::1]:port
    const end = host.indexOf("]");
    if (end === -1) return false;
    const inner = host.slice(1, end);
    const rest = host.slice(end + 1);
    host = inner;
    if (rest.startsWith(":")) hostPort = rest.slice(1);
  } else {
    const colon = host.lastIndexOf(":");
    if (colon !== -1) {
      hostPort = host.slice(colon + 1);
      host = host.slice(0, colon);
    }
  }

  const allowedHosts = new Set(["127.0.0.1", "localhost", "::1"]);
  if (!allowedHosts.has(host)) return false;
  if (hostPort !== undefined && hostPort !== "" && hostPort !== String(port)) {
    return false;
  }
  return true;
}

/**
 * Restrictive Content Security Policy. `default-src 'none'` plus explicit,
 * self-only sources block all remote resource loads (no remote images,
 * scripts, fonts, or fetches), which prevents review activity from leaking.
 */
export function contentSecurityPolicy(): string {
  return [
    "default-src 'none'",
    "img-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self'",
    "font-src 'self'",
    "connect-src 'self'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

/** Default security response headers for every server response. */
export function securityHeaders(): Record<string, string> {
  return {
    "Content-Security-Policy": contentSecurityPolicy(),
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Cache-Control": "no-store",
  };
}

/**
 * True if a URL points at a remote resource that must be blocked by default
 * (so remote images in reviewed Markdown cannot leak the review via Referer or
 * a fetch). Relative URLs, `data:` and `blob:` are local and allowed.
 */
export function isRemoteResourceUrl(url: string): boolean {
  const u = url.trim();
  if (u === "") return false;
  if (u.startsWith("//")) return true; // protocol-relative -> remote
  if (/^[a-z][a-z0-9+.-]*:/i.test(u)) {
    const scheme = u.slice(0, u.indexOf(":")).toLowerCase();
    if (scheme === "data" || scheme === "blob") return false;
    if (scheme === "http" || scheme === "https") return true;
    // mailto/ftp/ws/etc -> treat as remote/unsafe by default
    return true;
  }
  return false; // relative path -> local
}

/** Replace remote image/link URLs with a blocked placeholder. */
export function blockRemoteResourcesInHtml(html: string): string {
  return html.replace(
    /\b(src|href)\s*=\s*("([^"]*)"|'([^']*)')/gi,
    (full, attr: string, _q, dq: string, sq: string) => {
      const value = dq ?? sq ?? "";
      if (isRemoteResourceUrl(value)) {
        return `${attr}="about:blank#stet-blocked-remote"`;
      }
      return full;
    },
  );
}
