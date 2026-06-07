import { afterEach, describe, expect, test } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request } from "node:http";
import { createReviewServer, type ReviewServer } from "../../src/server/index.js";

let servers: ReviewServer[] = [];
afterEach(async () => {
  await Promise.all(servers.map((server) => server.close()));
  servers = [];
});

async function start(contents: string): Promise<ReviewServer> {
  const dir = mkdtempSync(join(tmpdir(), "stet-security-"));
  const file = join(dir, "fixture.md");
  writeFileSync(file, contents);
  const server = await createReviewServer({ filePath: file, author: "Amit", openBrowser: false, port: 0 });
  servers.push(server);
  return server;
}

function rawGet(port: number, path: string, headers: Record<string, string>): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: "127.0.0.1", port, path, method: "GET", headers }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => resolve({ status: res.statusCode || 0, body }));
    });
    req.on("error", reject);
    req.end();
  });
}

describe("server hardening", () => {
  test("missing and wrong token are rejected for API requests", async () => {
    const server = await start("# Title\n\nParagraph.\n");

    const missing = await fetch(`${server.url}/api/document`, { headers: { Host: `127.0.0.1:${server.port}` } });
    expect(missing.status).toBe(401);

    const wrong = await fetch(`${server.url}/api/document`, { headers: { Host: `127.0.0.1:${server.port}`, Cookie: "stet_token=wrong" } });
    expect(wrong.status).toBe(401);
  });

  test("host header validation rejects DNS rebinding attempts", async () => {
    const server = await start("# Title\n\nParagraph.\n");

    const response = await rawGet(server.port, "/api/document", { Host: "evil.example", Cookie: server.authCookie });

    expect(response.status).toBe(403);
    expect(response.body).toMatch(/host/i);
  });

  test("CSP and no-referrer headers are present on shell and JSON responses", async () => {
    const server = await start("# Title\n\nParagraph.\n");

    const shell = await fetch(`${server.url}/`, { headers: { Host: `127.0.0.1:${server.port}` } });
    const api = await fetch(`${server.url}/api/document`, { headers: { Host: `127.0.0.1:${server.port}`, Cookie: server.authCookie } });

    for (const response of [shell, api]) {
      expect(response.headers.get("referrer-policy")).toBe("no-referrer");
      expect(response.headers.get("content-security-policy")).toContain("default-src 'self'");
      expect(response.headers.get("content-security-policy")).toContain("img-src 'self' data:");
    }
  });

  test("remote resources and raw HTML are blocked in rendered Markdown", async () => {
    const server = await start("# Title\n\n![tracker](https://evil.example/t.png)\n\n<script>alert('x')</script>\n");

    const response = await fetch(`${server.url}/api/document`, { headers: { Host: `127.0.0.1:${server.port}`, Cookie: server.authCookie } });
    const doc = await response.json();

    expect(doc.html).not.toContain("<img");
    expect(doc.html).not.toContain("https://evil.example");
    expect(doc.html).not.toContain("<script>");
    expect(doc.html).toContain("data-stet-blocked-resource");
  });
});
