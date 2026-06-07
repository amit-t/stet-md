import type { ReviewThread } from "./types.js";
import { serializeMarker, parseMarker, renderThreadBlock as renderMarkerThreadBlock } from "./threadMarker.js";
import { renderBlockquote } from "./renderThread.js";

export function serializeMarkerBody(thread: ReviewThread): string {
  return serializeMarker(thread);
}

export function renderThreadBlock(thread: ReviewThread, lineEnding: "\n" | "\r\n" = "\n"): string {
  return renderMarkerThreadBlock(thread).replace(/\n/g, lineEnding);
}

export type ParsedMarker = {
  thread: ReviewThread;
};

export function parseMarkerBody(body: string): ParsedMarker {
  return { thread: parseMarker(body) };
}

export function visibleThreadText(thread: ReviewThread): string {
  return thread.messages.map((message) => `${message.author}: ${message.bodyMarkdown}`).join("\n\n");
}

export function escapeVisibleHtmlThread(thread: ReviewThread): string {
  return visibleThreadText(thread)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");
}

export { renderBlockquote };
