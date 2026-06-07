import type { ReviewMessage, ReviewTarget, ReviewThread } from "./types.js";
import { decodeBase64, encodeBase64, escapeHtml, needsCommentEncoding } from "./escape.js";
import { formatDisplayTime } from "./time.js";

function scalar(value: string): string {
  return value.replace(/\r?\n/g, " ").trim();
}

function readScalar(line: string, key: string): string | undefined {
  const prefix = `${key}:`;
  if (!line.startsWith(prefix)) return undefined;
  return line.slice(prefix.length).trimStart();
}

function renderBodyYaml(message: ReviewMessage): string[] {
  const lines: string[] = [];
  if (needsCommentEncoding(message.bodyMarkdown)) {
    lines.push(`    body_base64: ${encodeBase64(message.bodyMarkdown)}`);
    return lines;
  }
  lines.push("    body: |-");
  const bodyLines = message.bodyMarkdown.split(/\r?\n/);
  if (bodyLines.length === 0) {
    lines.push("      ");
  } else {
    for (const bodyLine of bodyLines) lines.push(`      ${bodyLine}`);
  }
  return lines;
}

export function serializeMarkerBody(thread: ReviewThread): string {
  const lines: string[] = [];
  lines.push("version: 1");
  lines.push(`id: ${scalar(thread.id)}`);
  lines.push(`status: ${thread.status}`);
  lines.push(`created_at: ${thread.createdAt}`);
  lines.push(`updated_at: ${thread.updatedAt}`);
  lines.push("target:");
  lines.push(`  kind: ${thread.target.kind}`);
  lines.push("  heading_path:");
  if (thread.target.headingPath.length === 0) {
    lines.push("    []");
  } else {
    for (const heading of thread.target.headingPath) lines.push(`    - ${scalar(heading)}`);
  }
  lines.push(`  block_ordinal: ${thread.target.blockOrdinal}`);
  lines.push(`  source_hash: ${thread.target.sourceHash}`);
  if (needsCommentEncoding(thread.target.quote)) {
    lines.push(`  quote_base64: ${encodeBase64(thread.target.quote)}`);
  } else {
    lines.push(`  quote: ${scalar(thread.target.quote)}`);
  }
  lines.push("messages:");
  for (const message of thread.messages) {
    lines.push(`  - author: ${scalar(message.author)}`);
    lines.push(`    created_at: ${message.createdAt}`);
    if (message.editedAt) lines.push(`    edited_at: ${message.editedAt}`);
    lines.push(...renderBodyYaml(message));
  }
  return lines.join("\n");
}

function renderVisibleBody(message: ReviewMessage): string[] {
  const lines = message.bodyMarkdown.split(/\r?\n/);
  return lines.length === 0 ? [">"] : lines.map((line) => (line.length === 0 ? ">" : `> ${line}`));
}

export function renderThreadBlock(thread: ReviewThread, lineEnding: "\n" | "\r\n" = "\n"): string {
  const lines: string[] = [];
  lines.push("<!-- redline:thread");
  lines.push(...serializeMarkerBody(thread).split("\n"));
  lines.push("-->");
  lines.push("> [!NOTE]");
  lines.push(`> **Review thread \`${thread.id}\` — ${thread.status}**`);
  for (const message of thread.messages) {
    lines.push(">");
    lines.push(`> **${message.author}** · ${formatDisplayTime(message.createdAt)}`);
    lines.push(">");
    lines.push(...renderVisibleBody(message));
  }
  lines.push("<!-- /redline:thread -->");
  return lines.join(lineEnding);
}

export type ParsedMarker = {
  thread: Omit<ReviewThread, "range" | "lineStart" | "lineEnd" | "anchor">;
};

function required(value: string | undefined, field: string): string {
  if (!value) throw new Error(`Missing required field ${field}`);
  return value;
}

export function parseMarkerBody(body: string): ParsedMarker {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const top = new Map<string, string>();
  let index = 0;
  for (; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === "target:") break;
    const colon = line.indexOf(":");
    if (colon > -1) top.set(line.slice(0, colon), line.slice(colon + 1).trimStart());
  }

  if (top.get("version") !== "1") throw new Error("Malformed redline thread marker: version must be 1");
  const id = required(top.get("id"), "id");
  const status = required(top.get("status"), "status");
  if (status !== "open" && status !== "resolved") throw new Error(`Malformed redline thread marker ${id}: invalid status ${status}`);
  const createdAt = required(top.get("created_at"), "created_at");
  const updatedAt = required(top.get("updated_at"), "updated_at");

  if (lines[index] !== "target:") throw new Error(`Malformed redline thread marker ${id}: missing target`);
  index += 1;
  const targetValues = new Map<string, string>();
  const headingPath: string[] = [];
  for (; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === "messages:") break;
    if (line === "  heading_path:") {
      index += 1;
      if (lines[index] === "    []") continue;
      for (; index < lines.length; index += 1) {
        const headingLine = lines[index];
        if (!headingLine.startsWith("    - ")) {
          index -= 1;
          break;
        }
        headingPath.push(headingLine.slice("    - ".length));
      }
      continue;
    }
    const trimmed = line.trimStart();
    const colon = trimmed.indexOf(":");
    if (colon > -1) targetValues.set(trimmed.slice(0, colon), trimmed.slice(colon + 1).trimStart());
  }

  if (lines[index] !== "messages:") throw new Error(`Malformed redline thread marker ${id}: missing messages`);
  index += 1;

  const target: ReviewTarget = {
    id: "stored",
    kind: required(targetValues.get("kind"), "target.kind") as ReviewTarget["kind"],
    headingPath,
    blockOrdinal: Number.parseInt(required(targetValues.get("block_ordinal"), "target.block_ordinal"), 10),
    sourceHash: required(targetValues.get("source_hash"), "target.source_hash"),
    quote: targetValues.get("quote_base64") ? decodeBase64(targetValues.get("quote_base64")!) : required(targetValues.get("quote"), "target.quote"),
    byteRange: { start: 0, end: 0 },
    lineStart: 0,
    lineEnd: 0,
  };
  if (!Number.isFinite(target.blockOrdinal)) throw new Error(`Malformed redline thread marker ${id}: target.block_ordinal must be a number`);

  const messages: ReviewMessage[] = [];
  while (index < lines.length) {
    let line = lines[index];
    if (line.trim() === "") {
      index += 1;
      continue;
    }
    const author = readScalar(line, "  - author");
    if (author === undefined) throw new Error(`Malformed redline thread marker ${id}: expected message author`);
    index += 1;
    const created = readScalar(lines[index] ?? "", "    created_at");
    if (!created) throw new Error(`Malformed redline thread marker ${id}: expected message created_at`);
    index += 1;
    let editedAt: string | undefined;
    const maybeEdited = readScalar(lines[index] ?? "", "    edited_at");
    if (maybeEdited !== undefined) {
      editedAt = maybeEdited;
      index += 1;
    }
    let bodyMarkdown = "";
    const bodyBase64 = readScalar(lines[index] ?? "", "    body_base64");
    if (bodyBase64 !== undefined) {
      bodyMarkdown = decodeBase64(bodyBase64);
      index += 1;
    } else if ((lines[index] ?? "") === "    body: |-") {
      index += 1;
      const bodyLines: string[] = [];
      while (index < lines.length) {
        line = lines[index];
        if (line.startsWith("  - author:")) break;
        if (!line.startsWith("      ")) break;
        bodyLines.push(line.slice(6));
        index += 1;
      }
      bodyMarkdown = bodyLines.join("\n");
    } else {
      throw new Error(`Malformed redline thread marker ${id}: expected body or body_base64`);
    }
    messages.push({ author, createdAt: created, bodyMarkdown, editedAt });
  }
  if (messages.length === 0) throw new Error(`Malformed redline thread marker ${id}: messages must not be empty`);

  return { thread: { version: 1, id, status, createdAt, updatedAt, target, messages } };
}

export function visibleThreadText(thread: ReviewThread): string {
  return thread.messages.map((message) => `${message.author}: ${message.bodyMarkdown}`).join("\n\n");
}

export function escapeVisibleHtmlThread(thread: ReviewThread): string {
  return escapeHtml(visibleThreadText(thread));
}
