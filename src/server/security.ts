import type { IncomingMessage, ServerResponse } from "node:http";

export const TOKEN_COOKIE_NAME = "stet_token";

export function securityHeaders(): Record<string, string> {
  return {
    "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "Cross-Origin-Resource-Policy": "same-origin",
  };
}

export function setSecurityHeaders(response: ServerResponse): void {
  for (const [name, value] of Object.entries(securityHeaders())) response.setHeader(name, value);
}

export function authCookie(token: string): string {
  return `${TOKEN_COOKIE_NAME}=${token}; HttpOnly; SameSite=Strict; Path=/`;
}

export function requestCookies(request: IncomingMessage): Map<string, string> {
  const header = request.headers.cookie ?? "";
  const result = new Map<string, string>();
  for (const part of header.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (!rawName) continue;
    result.set(rawName, rawValue.join("="));
  }
  return result;
}

export function hasValidToken(request: IncomingMessage, token: string): boolean {
  return requestCookies(request).get(TOKEN_COOKIE_NAME) === token;
}

export function isAllowedHost(hostHeader: string | undefined, port: number): boolean {
  if (!hostHeader) return false;
  const allowed = new Set([
    `127.0.0.1:${port}`,
    `localhost:${port}`,
    `[::1]:${port}`,
  ]);
  return allowed.has(hostHeader.toLowerCase());
}
