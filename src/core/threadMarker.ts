import yaml from "js-yaml";
import type {
  ReviewThread,
  ReviewMessage,
  ReviewTarget,
  ThreadStatus,
  TargetKind,
} from "./types.js";
import { encodeCommentBody, decodeCommentBody } from "./encode.js";
import { renderBlockquote } from "./renderThread.js";
import { RedlineError } from "./errors.js";

/**
 * Serialize / parse the structured `redline:thread` marker.
 *
 * Serialization is hand-rolled for byte-deterministic output (golden tests
 * assert exact bytes). Parsing uses js-yaml so agent hand-edits to the
 * `messages:` list stay tolerant, then validates the shape and decodes
 * comment-escaped message bodies.
 */

export const OPEN_MARKER = "<!-- redline:thread";
export const CLOSE_MARKER = "<!-- /redline:thread -->";

const VALID_STATUS: ThreadStatus[] = ["open", "resolved"];
const VALID_KIND: TargetKind[] = [
  "document",
  "heading",
  "paragraph",
  "code_block",
  "sub_block",
];

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

/** Emit a YAML scalar: plain when unambiguous, else JSON double-quoted. */
function emitScalar(value: string): string {
  const needsQuote =
    value.length === 0 ||
    value !== value.trim() ||
    /[\n\r\t]/.test(value) ||
    /: /.test(value) ||
    /:$/.test(value) ||
    / #/.test(value) ||
    /^[-?:,[\]{}#&*!|>'"%@`]/.test(value);
  return needsQuote ? JSON.stringify(value) : value;
}

/** Can the encoded body round-trip through a `|-` literal block scalar? */
function blockScalarSafe(encoded: string): boolean {
  // `|-` strips trailing newlines and `\r` is not representable cleanly.
  return encoded.length > 0 && !encoded.includes("\r") && !/\n$/.test(encoded);
}

function serializeBody(body: string, keyIndent: string): string[] {
  const encoded = encodeCommentBody(body);
  if (blockScalarSafe(encoded)) {
    const contentIndent = keyIndent + "  ";
    const lines = encoded
      .split("\n")
      .map((l) => (l === "" ? "" : contentIndent + l));
    return [`${keyIndent}body: |-`, ...lines];
  }
  // Fallback: single-line double-quoted scalar preserves every byte exactly.
  return [`${keyIndent}body: ${JSON.stringify(encoded)}`];
}

function serializeTarget(target: ReviewTarget): string[] {
  const lines: string[] = ["target:", `  kind: ${emitScalar(target.kind)}`];
  if (target.headingPath.length === 0) {
    lines.push("  heading_path: []");
  } else {
    lines.push("  heading_path:");
    for (const h of target.headingPath) lines.push(`    - ${emitScalar(h)}`);
  }
  lines.push(`  block_ordinal: ${target.blockOrdinal}`);
  lines.push(`  source_hash: ${emitScalar(target.sourceHash)}`);
  lines.push(`  quote: ${emitScalar(target.quote)}`);
  if (target.intraBlock) {
    lines.push("  intra_block:");
    lines.push(`    kind: ${emitScalar(target.intraBlock.kind)}`);
    if (target.intraBlock.ordinal !== undefined)
      lines.push(`    ordinal: ${target.intraBlock.ordinal}`);
    if (target.intraBlock.startOffset !== undefined)
      lines.push(`    start_offset: ${target.intraBlock.startOffset}`);
    if (target.intraBlock.endOffset !== undefined)
      lines.push(`    end_offset: ${target.intraBlock.endOffset}`);
  }
  return lines;
}

function serializeMessage(msg: ReviewMessage): string[] {
  const lines: string[] = [
    `  - author: ${emitScalar(msg.author)}`,
    `    created_at: ${emitScalar(msg.createdAt)}`,
  ];
  if (msg.editedAt) lines.push(`    edited_at: ${emitScalar(msg.editedAt)}`);
  lines.push(...serializeBody(msg.bodyMarkdown, "    "));
  return lines;
}

/** The inner YAML of the marker (no `<!--`/`-->`, no trailing newline). */
export function serializeMarker(thread: ReviewThread): string {
  const lines: string[] = [
    `version: ${thread.version}`,
    `id: ${emitScalar(thread.id)}`,
    `status: ${emitScalar(thread.status)}`,
    `created_at: ${emitScalar(thread.createdAt)}`,
    `updated_at: ${emitScalar(thread.updatedAt)}`,
    ...serializeTarget(thread.target),
    "messages:",
  ];
  for (const msg of thread.messages) lines.push(...serializeMessage(msg));
  return lines.join("\n");
}

/** The full thread block: marker + generated blockquote, no trailing newline. */
export function renderThreadBlock(thread: ReviewThread): string {
  return [
    OPEN_MARKER,
    serializeMarker(thread),
    "-->",
    renderBlockquote(thread),
    CLOSE_MARKER,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

function fail(message: string, baseLine: number): never {
  throw new RedlineError("malformed_marker", message, { line: baseLine });
}

function asString(v: unknown, field: string, baseLine: number): string {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  fail(`marker field "${field}" must be a scalar`, baseLine);
}

function parseTarget(raw: unknown, baseLine: number): ReviewTarget {
  if (raw === null || typeof raw !== "object")
    fail(`marker "target" is missing or not a mapping`, baseLine);
  const t = raw as Record<string, unknown>;
  const kind = asString(t.kind, "target.kind", baseLine) as TargetKind;
  if (!VALID_KIND.includes(kind))
    fail(`marker "target.kind" has invalid value "${kind}"`, baseLine);

  let headingPath: string[] = [];
  if (t.heading_path !== undefined && t.heading_path !== null) {
    if (!Array.isArray(t.heading_path))
      fail(`marker "target.heading_path" must be a list`, baseLine);
    headingPath = t.heading_path.map((h, i) =>
      asString(h, `target.heading_path[${i}]`, baseLine),
    );
  }

  const blockOrdinalRaw = t.block_ordinal ?? 0;
  const blockOrdinal = Number(blockOrdinalRaw);
  if (!Number.isInteger(blockOrdinal))
    fail(`marker "target.block_ordinal" must be an integer`, baseLine);

  const target: ReviewTarget = {
    kind,
    headingPath,
    blockOrdinal,
    sourceHash: asString(t.source_hash ?? "", "target.source_hash", baseLine),
    quote: asString(t.quote ?? "", "target.quote", baseLine),
  };

  if (t.intra_block && typeof t.intra_block === "object") {
    const ib = t.intra_block as Record<string, unknown>;
    target.intraBlock = {
      kind: asString(ib.kind, "target.intra_block.kind", baseLine) as
        | "list_item"
        | "table_row"
        | "text_range",
    };
    if (ib.ordinal !== undefined) target.intraBlock.ordinal = Number(ib.ordinal);
    if (ib.start_offset !== undefined)
      target.intraBlock.startOffset = Number(ib.start_offset);
    if (ib.end_offset !== undefined)
      target.intraBlock.endOffset = Number(ib.end_offset);
  }
  return target;
}

function parseMessage(
  raw: unknown,
  index: number,
  baseLine: number,
): ReviewMessage {
  if (raw === null || typeof raw !== "object")
    fail(`marker messages[${index}] is not a mapping`, baseLine);
  const m = raw as Record<string, unknown>;
  if (m.author === undefined)
    fail(`marker messages[${index}] is missing "author"`, baseLine);
  if (m.created_at === undefined)
    fail(`marker messages[${index}] is missing "created_at"`, baseLine);
  if (m.body === undefined)
    fail(`marker messages[${index}] is missing "body"`, baseLine);
  const msg: ReviewMessage = {
    author: asString(m.author, `messages[${index}].author`, baseLine),
    createdAt: asString(m.created_at, `messages[${index}].created_at`, baseLine),
    bodyMarkdown: decodeCommentBody(
      asString(m.body, `messages[${index}].body`, baseLine),
    ),
  };
  if (m.edited_at !== undefined)
    msg.editedAt = asString(m.edited_at, `messages[${index}].edited_at`, baseLine);
  return msg;
}

export interface ParseMarkerOptions {
  /** 1-based line in the file where the marker's inner YAML begins. */
  baseLine?: number;
}

/**
 * Parse the inner YAML of a marker into a validated ReviewThread.
 * `baseLine` lets callers report errors against the file, not the fragment.
 */
export function parseMarker(
  inner: string,
  opts: ParseMarkerOptions = {},
): ReviewThread {
  const baseLine = opts.baseLine ?? 1;
  let doc: unknown;
  try {
    doc = yaml.load(inner, { schema: yaml.JSON_SCHEMA });
  } catch (e) {
    const mark = (e as { mark?: { line?: number } }).mark;
    const line = baseLine + (mark?.line ?? 0);
    throw new RedlineError(
      "malformed_marker",
      `marker YAML is invalid: ${(e as Error).message}`,
      { line },
    );
  }
  if (doc === null || typeof doc !== "object")
    fail("marker body is empty or not a mapping", baseLine);
  const d = doc as Record<string, unknown>;

  if (String(d.version ?? "") !== "1") fail(`marker "version" must be 1`, baseLine);
  if (d.id === undefined) fail(`marker is missing "id"`, baseLine);
  const status = asString(d.status ?? "open", "status", baseLine);
  if (!VALID_STATUS.includes(status as ThreadStatus))
    fail(`marker "status" has invalid value "${status}"`, baseLine);

  if (d.messages !== undefined && !Array.isArray(d.messages))
    fail(`marker "messages" must be a list`, baseLine);
  const rawMessages = (d.messages as unknown[]) ?? [];

  const id = asString(d.id, "id", baseLine);
  const createdAt = asString(d.created_at ?? "", "created_at", baseLine);
  return {
    version: 1,
    id,
    status: status as ThreadStatus,
    createdAt,
    updatedAt: asString(d.updated_at ?? createdAt, "updated_at", baseLine),
    target: parseTarget(d.target, baseLine),
    messages: rawMessages.map((m, i) => parseMessage(m, i, baseLine)),
  };
}
