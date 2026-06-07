import { afterEach, describe, expect, test } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendReply } from "../../src/core/index.js";
import { createReviewServer, type ReviewServer } from "../../src/server/index.js";

let servers: ReviewServer[] = [];
afterEach(async () => {
  await Promise.all(servers.map((server) => server.close()));
  servers = [];
});

function tempMarkdown(contents = "# Title\n\nParagraph one.\n"): string {
  const dir = mkdtempSync(join(tmpdir(), "stet-server-"));
  const file = join(dir, "fixture.md");
  writeFileSync(file, contents);
  return file;
}

async function start(file: string): Promise<ReviewServer> {
  const server = await createReviewServer({ filePath: file, author: "Amit", openBrowser: false, port: 0 });
  servers.push(server);
  return server;
}

async function fetchWithCookie(server: ReviewServer, path: string, init: RequestInit = {}) {
  return fetch(`${server.url}${path}`, {
    ...init,
    headers: {
      Host: `127.0.0.1:${server.port}`,
      Cookie: server.authCookie,
      ...(init.headers ?? {}),
    },
  });
}

describe("local review server", () => {
  test("serves UI, stages comment, saves thread, and restores on reload", async () => {
    const file = tempMarkdown();
    const server = await start(file);

    const shell = await fetch(`${server.url}/`, { headers: { Host: `127.0.0.1:${server.port}` } });
    expect(shell.status).toBe(200);
    expect(shell.headers.get("set-cookie")).toContain("HttpOnly");
    expect(shell.headers.get("referrer-policy")).toBe("no-referrer");

    const docResponse = await fetchWithCookie(server, "/api/document");
    expect(docResponse.status).toBe(200);
    const doc = await docResponse.json();
    expect(doc.html).toContain("data-stet-target");
    expect(doc.targets.some((target: { kind: string }) => target.kind === "paragraph")).toBe(true);

    const richFileServer = await start(tempMarkdown("# Rich\n\nParagraph.\n\n- one\n- two\n\n> quoted\n\n```ts\nconst x = 1;\n```\n"));
    const rich = await (await fetchWithCookie(richFileServer, "/api/document")).json();
    expect(rich.html).toContain("<ul>");
    expect(rich.html).toContain("<blockquote>");
    expect(rich.html).toContain("<pre><code>");

    const paragraph = doc.targets.find((target: { kind: string }) => target.kind === "paragraph");
    const stage = await fetchWithCookie(server, "/api/comments", {
      method: "POST",
      body: JSON.stringify({ action: "comment", targetId: paragraph.id, bodyMarkdown: "Browser note", author: "Amit" }),
    });
    expect(stage.status).toBe(200);
    const staged = await stage.json();
    expect(staged.dirty).toBe(true);
    expect(staged.threads[0].messages[0].bodyMarkdown).toBe("Browser note");

    const selectedStage = await fetchWithCookie(server, "/api/comments", {
      method: "POST",
      body: JSON.stringify({ action: "comment", targetId: paragraph.id, bodyMarkdown: "Selected note", author: "Amit", quotedText: "selected phrase" }),
    });
    const selected = await selectedStage.json();
    expect(selected.threads.find((thread: { messages: { bodyMarkdown: string }[] }) => thread.messages[0].bodyMarkdown === "Selected note").target.quote).toBe("selected phrase");

    const save = await fetchWithCookie(server, "/api/save", { method: "POST", body: "{}" });
    expect(save.status).toBe(200);
    expect(readFileSync(file, "utf8")).toContain("Browser note");

    const reopened = await fetchWithCookie(server, "/api/document");
    const reopenedDoc = await reopened.json();
    expect(reopenedDoc.threads[0].messages[0].bodyMarkdown).toBe("Browser note");
  });

  test("agent CLI-added reply appears after browser reload", async () => {
    const file = tempMarkdown();
    const server = await start(file);
    const first = await (await fetchWithCookie(server, "/api/document")).json();
    const target = first.targets.find((candidate: { kind: string }) => candidate.kind === "paragraph");
    await fetchWithCookie(server, "/api/comments", { method: "POST", body: JSON.stringify({ action: "comment", targetId: target.id, bodyMarkdown: "Initial", author: "Amit" }) });
    const staged = await (await fetchWithCookie(server, "/api/document")).json();
    const threadId = staged.threads[0].id;
    await fetchWithCookie(server, "/api/save", { method: "POST", body: "{}" });

    appendReply(file, threadId, { author: "Claude", bodyMarkdown: "CLI reply", createdAt: "2026-06-07T10:05:00Z" });
    const reloaded = await (await fetchWithCookie(server, "/api/document")).json();

    expect(reloaded.conflict.changedOnDisk).toBe(true);
    expect(reloaded.threads[0].messages.map((message: { bodyMarkdown: string }) => message.bodyMarkdown)).toContain("CLI reply");
  });

  test("reply, resolve, and reopen actions survive save", async () => {
    const file = tempMarkdown();
    const server = await start(file);
    const first = await (await fetchWithCookie(server, "/api/document")).json();
    const target = first.targets.find((candidate: { kind: string }) => candidate.kind === "paragraph");
    await fetchWithCookie(server, "/api/comments", { method: "POST", body: JSON.stringify({ action: "comment", targetId: target.id, bodyMarkdown: "Initial", author: "Amit" }) });
    let staged = await (await fetchWithCookie(server, "/api/document")).json();
    const threadId = staged.threads[0].id;

    await fetchWithCookie(server, "/api/comments", { method: "POST", body: JSON.stringify({ action: "reply", threadId, bodyMarkdown: "Reply", author: "Claude" }) });
    await fetchWithCookie(server, "/api/comments", { method: "POST", body: JSON.stringify({ action: "resolve", threadId, bodyMarkdown: "Resolved", author: "Amit" }) });
    await fetchWithCookie(server, "/api/comments", { method: "POST", body: JSON.stringify({ action: "reopen", threadId, bodyMarkdown: "Reopened", author: "Amit" }) });
    const save = await fetchWithCookie(server, "/api/save", { method: "POST", body: "{}" });
    expect(save.status).toBe(200);

    staged = await (await fetchWithCookie(server, "/api/document")).json();
    expect(staged.threads[0].status).toBe("open");
    expect(staged.threads[0].messages.map((message: { bodyMarkdown: string }) => message.bodyMarkdown)).toEqual(["Initial", "Reply", "Resolved", "Reopened"]);
  });

  test("changed file blocks save and exposes pending patch preview", async () => {
    const file = tempMarkdown();
    const server = await start(file);
    const first = await (await fetchWithCookie(server, "/api/document")).json();
    const target = first.targets.find((candidate: { kind: string }) => candidate.kind === "paragraph");
    await fetchWithCookie(server, "/api/comments", { method: "POST", body: JSON.stringify({ action: "comment", targetId: target.id, bodyMarkdown: "Pending", author: "Amit" }) });
    writeFileSync(file, "# Title\n\nParagraph changed externally.\n");

    const docAfterChange = await (await fetchWithCookie(server, "/api/document")).json();
    expect(docAfterChange.conflict.changedOnDisk).toBe(true);

    const preview = await fetchWithCookie(server, "/api/patch");
    expect(preview.status).toBe(200);
    expect(await preview.text()).toContain("Pending");

    const save = await fetchWithCookie(server, "/api/save", { method: "POST", body: "{}" });
    expect(save.status).toBe(409);
    expect(await save.text()).toContain("changed on disk");
  });
});
