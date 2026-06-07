import { createServer, type IncomingMessage, type Server as HttpServer, type ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import {
  createThreadForTarget,
  hashBuffer,
  loadReviewDocument,
  previewThreadPatch,
  saveReviewThreads,
  type ReviewDocument,
  type ReviewThread,
} from "../core/index.js";
import { acquireLock, releaseLock, type LockStatus } from "./locks.js";
import { authCookie, hasValidToken, isAllowedHost, setSecurityHeaders } from "./security.js";
import { shellHtml, styleCss } from "./assets.js";
import { readFileSync as readFs } from "node:fs";

export type ReviewServerOptions = {
  filePath: string;
  author?: string;
  port?: number;
  openBrowser?: boolean;
  app?: string;
};

export type ReviewServer = {
  url: string;
  port: number;
  token: string;
  authCookie: string;
  close(): Promise<void>;
  lockStatus: LockStatus;
};

type SessionState = {
  filePath: string;
  author: string;
  loadedHash: string;
  staged: Map<string, ReviewThread>;
  lockStatus: LockStatus;
};

function jsonResponse(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

function textResponse(response: ServerResponse, status: number, body: string, contentType = "text/plain; charset=utf-8"): void {
  response.writeHead(status, { "Content-Type": contentType });
  response.end(body);
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolveBody, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) reject(new Error("Request body too large"));
    });
    request.on("end", () => resolveBody(body));
    request.on("error", reject);
  });
}

function currentChangedOnDisk(state: SessionState): boolean {
  return hashBuffer(readFileSync(state.filePath)) !== state.loadedHash;
}

function documentPayload(state: SessionState): ReviewDocument & { dirty: boolean; conflict: { changedOnDisk: boolean; message?: string }; lock: LockStatus } {
  const doc = loadReviewDocument(state.filePath, { allowMalformed: true });
  const stagedIds = new Set(state.staged.keys());
  const mergedThreads = [...doc.threads.filter((thread) => !stagedIds.has(thread.id)), ...state.staged.values()];
  const changed = currentChangedOnDisk(state);
  return {
    ...doc,
    threads: mergedThreads,
    dirty: state.staged.size > 0,
    conflict: changed ? { changedOnDisk: true, message: "File changed on disk. Reload before saving or save to copy." } : { changedOnDisk: false },
    lock: state.lockStatus,
  };
}

function findThread(state: SessionState, doc: ReviewDocument, threadId: string): ReviewThread | undefined {
  return state.staged.get(threadId) ?? doc.threads.find((thread) => thread.id === threadId);
}

function cloneThread(thread: ReviewThread): ReviewThread {
  return JSON.parse(JSON.stringify(thread)) as ReviewThread;
}

async function handleComment(state: SessionState, request: IncomingMessage, response: ServerResponse): Promise<void> {
  const doc = loadReviewDocument(state.filePath, { allowMalformed: true });
  const payload = JSON.parse((await readBody(request)) || "{}");
  const author = String(payload.author || state.author);
  const bodyMarkdown = String(payload.bodyMarkdown || "").trim();
  if (!bodyMarkdown) return jsonResponse(response, 400, { error: "bodyMarkdown is required" });
  const now = new Date();

  if (payload.action === "comment") {
    const target = doc.targets.find((candidate) => candidate.id === payload.targetId);
    if (!target) return jsonResponse(response, 404, { error: `Unknown target: ${payload.targetId}` });
    const thread = createThreadForTarget(target, author, bodyMarkdown, now);
    if (typeof payload.quotedText === "string" && payload.quotedText.trim()) {
      thread.target.quote = payload.quotedText.trim().slice(0, 240);
    }
    state.staged.set(thread.id, thread);
    return jsonResponse(response, 200, documentPayload(state));
  }

  if (["reply", "resolve", "reopen"].includes(payload.action)) {
    const thread = findThread(state, doc, String(payload.threadId));
    if (!thread) return jsonResponse(response, 404, { error: `Unknown thread: ${payload.threadId}` });
    const updated = cloneThread(thread);
    const timestamp = now.toISOString().replace(/\.\d{3}Z$/, "Z");
    updated.messages.push({ author, bodyMarkdown, createdAt: timestamp });
    updated.updatedAt = timestamp;
    if (payload.action === "resolve") updated.status = "resolved";
    if (payload.action === "reopen") updated.status = "open";
    state.staged.set(updated.id, updated);
    return jsonResponse(response, 200, documentPayload(state));
  }

  return jsonResponse(response, 400, { error: `Unsupported action: ${payload.action}` });
}

async function handleSave(state: SessionState, response: ServerResponse): Promise<void> {
  if (currentChangedOnDisk(state)) {
    return textResponse(response, 409, "File changed on disk; refusing to overwrite staged comments.");
  }
  const updates = [...state.staged.values()];
  const saved = saveReviewThreads(state.filePath, updates, { expectedHash: state.loadedHash });
  state.loadedHash = saved.fileHash;
  state.staged.clear();
  jsonResponse(response, 200, documentPayload(state));
}

function uiAssetPath(): string | undefined {
  const candidate = fileURLToPath(new URL("../ui/app.js", import.meta.url));
  return existsSync(candidate) ? candidate : undefined;
}

function openBrowser(url: string, app?: string): void {
  const platform = process.platform;
  if (platform === "darwin") {
    const args = app ? ["-a", app, url] : [url];
    spawn("open", args, { stdio: "ignore", detached: true }).unref();
    return;
  }
  if (platform === "win32") {
    spawn("cmd", ["/c", "start", "", url], { stdio: "ignore", detached: true }).unref();
    return;
  }
  spawn("xdg-open", [url], { stdio: "ignore", detached: true }).unref();
}

export async function createReviewServer(options: ReviewServerOptions): Promise<ReviewServer> {
  const filePath = resolve(options.filePath);
  const token = randomBytes(32).toString("base64url");
  const initial = loadReviewDocument(filePath, { allowMalformed: true });
  const state: SessionState = {
    filePath,
    author: options.author || process.env.USER || "Amit",
    loadedHash: initial.fileHash,
    staged: new Map(),
    lockStatus: acquireLock(filePath, initial.fileHash),
  };
  let port = 0;

  const server: HttpServer = createServer(async (request, response) => {
    try {
      setSecurityHeaders(response);
      if (!isAllowedHost(request.headers.host, port)) {
        return textResponse(response, 403, "Host header rejected by Redline loopback guard.");
      }
      const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
      const pathname = url.pathname;

      if (pathname === "/" && request.method === "GET") {
        response.setHeader("Set-Cookie", authCookie(token));
        return textResponse(response, 200, shellHtml(), "text/html; charset=utf-8");
      }

      if (!hasValidToken(request, token)) {
        return textResponse(response, 401, "Missing or invalid Redline session token.");
      }

      if (pathname === "/assets/style.css" && request.method === "GET") return textResponse(response, 200, styleCss, "text/css; charset=utf-8");
      if (pathname === "/assets/app.js" && request.method === "GET") {
        const asset = uiAssetPath();
        if (!asset) return textResponse(response, 500, "UI asset missing; run npm run build.");
        return textResponse(response, 200, readFs(asset, "utf8"), "text/javascript; charset=utf-8");
      }
      if (pathname === "/api/document" && request.method === "GET") return jsonResponse(response, 200, documentPayload(state));
      if (pathname === "/api/comments" && request.method === "POST") return await handleComment(state, request, response);
      if (pathname === "/api/save" && request.method === "POST") return await handleSave(state, response);
      if (pathname === "/api/patch" && request.method === "GET") return textResponse(response, 200, previewThreadPatch(state.filePath, [...state.staged.values()]));
      if (pathname === "/events" && request.method === "GET") {
        response.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache" });
        response.write(`event: status\ndata: ${JSON.stringify({ changedOnDisk: currentChangedOnDisk(state), dirty: state.staged.size > 0 })}\n\n`);
        response.end();
        return;
      }
      return textResponse(response, 404, "Not found");
    } catch (error) {
      return textResponse(response, 500, error instanceof Error ? error.message : String(error));
    }
  });

  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 0, "127.0.0.1", () => resolveListen());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Unable to determine Redline server port");
  port = address.port;
  const url = `http://127.0.0.1:${port}`;
  if (options.openBrowser !== false) openBrowser(url, options.app);

  return {
    url,
    port,
    token,
    authCookie: `redline_token=${token}`,
    lockStatus: state.lockStatus,
    close: () => new Promise<void>((resolveClose, reject) => {
      releaseLock(state.lockStatus.lockPath);
      server.close((error) => (error ? reject(error) : resolveClose()));
    }),
  };
}
