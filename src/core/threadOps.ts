import type { ReviewThread, ReviewTarget, ReviewMessage } from "./types.js";
import { generateThreadId, utcIso } from "./ids.js";

/**
 * Pure transforms over a ReviewThread. Each returns a new object; callers
 * persist the result via the splice writer.
 */

export function newThread(
  target: ReviewTarget,
  author: string,
  bodyMarkdown: string,
  now: Date = new Date(),
): ReviewThread {
  const ts = utcIso(now);
  return {
    version: 1,
    id: generateThreadId(now),
    status: "open",
    createdAt: ts,
    updatedAt: ts,
    target,
    messages: [{ author, createdAt: ts, bodyMarkdown }],
  };
}

export function appendMessage(
  thread: ReviewThread,
  author: string,
  bodyMarkdown: string,
  now: Date = new Date(),
): ReviewThread {
  const ts = utcIso(now);
  const message: ReviewMessage = { author, createdAt: ts, bodyMarkdown };
  return {
    ...thread,
    updatedAt: ts,
    messages: [...thread.messages, message],
  };
}

export function resolveThread(
  thread: ReviewThread,
  opts: { author?: string; message?: string; now?: Date } = {},
): ReviewThread {
  const now = opts.now ?? new Date();
  const ts = utcIso(now);
  const messages = [...thread.messages];
  if (opts.message && opts.message.length > 0) {
    messages.push({
      author: opts.author ?? "Agent",
      createdAt: ts,
      bodyMarkdown: opts.message,
    });
  }
  return { ...thread, status: "resolved", updatedAt: ts, messages };
}

export function reopenThread(
  thread: ReviewThread,
  now: Date = new Date(),
): ReviewThread {
  return { ...thread, status: "open", updatedAt: utcIso(now) };
}
