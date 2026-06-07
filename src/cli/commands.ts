import type { ReviewThread } from "../core/types.js";
import { scanThreadBlocks } from "../core/parseThreads.js";
import { replaceThreadBlock, insertThreadBlock } from "../core/spliceWriter.js";
import { appendMessage, resolveThread, newThread } from "../core/threadOps.js";
import { resolveTarget, parseTargetSpec } from "../core/markdown.js";
import { RedlineError } from "../core/errors.js";
import { loadDoc, saveDoc, type LoadedDoc } from "./io.js";
import { requireFlag, optionalFlag, type ParsedArgs } from "./args.js";

/** Output sink so commands are testable in-process. */
export interface CliContext {
  out: (line: string) => void;
  err: (line: string) => void;
  now: () => Date;
  defaultAuthor: () => string;
}

function requireFile(args: ParsedArgs, command: string): string {
  const file = args.positionals[0];
  if (!file) {
    throw new RedlineError("usage", `${command} requires a FILE.md argument`);
  }
  return file;
}

/** Throw the first malformed-marker error in a document, if any. */
function assertNoMarkerErrors(doc: LoadedDoc): void {
  const { errors } = scanThreadBlocks(doc.content);
  if (errors.length > 0) throw errors[0]!;
}

function findBlockByThreadId(content: string, threadId: string) {
  const { blocks, errors } = scanThreadBlocks(content);
  if (errors.length > 0) throw errors[0]!;
  const block = blocks.find((b) => b.thread?.id === threadId);
  if (!block || !block.thread) {
    throw new RedlineError("unknown_thread", `no thread with id "${threadId}"`);
  }
  return block;
}

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------

interface ListJson {
  file: string;
  threads: Array<{
    id: string;
    status: string;
    createdAt: string;
    updatedAt: string;
    target: {
      kind: string;
      headingPath: string[];
      blockOrdinal: number;
      sourceHash: string;
      quote: string;
    };
    messages: Array<{ author: string; createdAt: string; bodyMarkdown: string }>;
  }>;
}

function toListJson(absPath: string, threads: ReviewThread[]): ListJson {
  return {
    file: absPath,
    threads: threads.map((t) => ({
      id: t.id,
      status: t.status,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      target: {
        kind: t.target.kind,
        headingPath: t.target.headingPath,
        blockOrdinal: t.target.blockOrdinal,
        sourceHash: t.target.sourceHash,
        quote: t.target.quote,
      },
      messages: t.messages.map((m) => ({
        author: m.author,
        createdAt: m.createdAt,
        bodyMarkdown: m.bodyMarkdown,
      })),
    })),
  };
}

export function cmdList(args: ParsedArgs, ctx: CliContext): number {
  const file = requireFile(args, "list");
  const doc = loadDoc(file);
  const { blocks, errors } = scanThreadBlocks(doc.content);
  if (errors.length > 0) throw errors[0]!;
  const threads = blocks
    .map((b) => b.thread)
    .filter((t): t is ReviewThread => t !== undefined);

  if (args.flags["json"]) {
    ctx.out(JSON.stringify(toListJson(doc.absPath, threads), null, 2));
    return 0;
  }

  // Human-readable summary.
  if (threads.length === 0) {
    ctx.out(`No review threads in ${doc.absPath}`);
    return 0;
  }
  ctx.out(`${threads.length} thread(s) in ${doc.absPath}:`);
  for (const t of threads) {
    const last = t.messages[t.messages.length - 1];
    ctx.out(
      `  ${t.id}  [${t.status}]  ${t.target.kind}:${t.target.quote}` +
        (last ? `  — ${last.author}: ${last.bodyMarkdown.split("\n")[0]}` : ""),
    );
  }
  return 0;
}

// ---------------------------------------------------------------------------
// reply
// ---------------------------------------------------------------------------

export function cmdReply(args: ParsedArgs, ctx: CliContext): number {
  const file = requireFile(args, "reply");
  const threadId = requireFlag(args.flags, "thread");
  const message = requireFlag(args.flags, "message");
  const author = optionalFlag(args.flags, "author") ?? ctx.defaultAuthor();

  const doc = loadDoc(file);
  const block = findBlockByThreadId(doc.content, threadId);
  const updated = appendMessage(block.thread!, author, message, ctx.now());
  const newContent = replaceThreadBlock(doc.content, block, updated, doc.format);
  const result = saveDoc(doc, newContent, { now: ctx.now() });

  if (result.lockWarning) ctx.err(`warning: ${result.lockWarning}`);
  ctx.out(`Replied to ${updated.id} (status: ${updated.status})`);
  return 0;
}

// ---------------------------------------------------------------------------
// resolve
// ---------------------------------------------------------------------------

export function cmdResolve(args: ParsedArgs, ctx: CliContext): number {
  const file = requireFile(args, "resolve");
  const threadId = requireFlag(args.flags, "thread");
  const message = optionalFlag(args.flags, "message");
  const author = optionalFlag(args.flags, "author") ?? ctx.defaultAuthor();

  const doc = loadDoc(file);
  const block = findBlockByThreadId(doc.content, threadId);
  const updated = resolveThread(block.thread!, {
    author,
    ...(message !== undefined ? { message } : {}),
    now: ctx.now(),
  });
  const newContent = replaceThreadBlock(doc.content, block, updated, doc.format);
  const result = saveDoc(doc, newContent, { now: ctx.now() });

  if (result.lockWarning) ctx.err(`warning: ${result.lockWarning}`);
  ctx.out(`Resolved ${updated.id} (status: ${updated.status})`);
  return 0;
}

// ---------------------------------------------------------------------------
// comment (create a new thread; post-MVP, exercises the insert path)
// ---------------------------------------------------------------------------

export function cmdComment(args: ParsedArgs, ctx: CliContext): number {
  const file = requireFile(args, "comment");
  const targetRaw = requireFlag(args.flags, "target");
  const message = requireFlag(args.flags, "message");
  const author = optionalFlag(args.flags, "author") ?? ctx.defaultAuthor();

  const doc = loadDoc(file);
  assertNoMarkerErrors(doc);
  const resolved = resolveTarget(doc.content, parseTargetSpec(targetRaw));
  const thread = newThread(resolved.target, author, message, ctx.now());
  const newContent = insertThreadBlock(
    doc.content,
    resolved.insertOffset,
    thread,
    doc.format,
  );
  const result = saveDoc(doc, newContent, { now: ctx.now() });

  if (result.lockWarning) ctx.err(`warning: ${result.lockWarning}`);
  ctx.out(`Created ${thread.id} (status: ${thread.status})`);
  return 0;
}
