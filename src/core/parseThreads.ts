import type { ReviewThread } from "./types.js";
import {
  OPEN_MARKER,
  CLOSE_MARKER,
  LEGACY_OPEN_MARKER,
  LEGACY_CLOSE_MARKER,
  parseMarker,
} from "./threadMarker.js";
import { renderBlockquote } from "./renderThread.js";
import { parseAst, codeRanges, type OffsetRange } from "./ast.js";
import { StetError, isStetError } from "./errors.js";

/**
 * Scan raw Markdown source for `stet:thread` blocks, recording exact byte
 * (character) ranges so the splice writer can replace a block without touching
 * any surrounding byte. The structured marker is the authoritative source; the
 * visible blockquote is only checked for divergence and never parsed for data.
 */

export interface ThreadBlock {
  /** Parsed thread, or undefined when the marker is malformed. */
  thread?: ReviewThread;
  /** Half-open char range `[start, end)` covering the whole block. */
  range: { start: number; end: number };
  /** Exact original text of the block. */
  raw: string;
  /** 1-based line of the block's opening marker. */
  startLine: number;
  /** Generated blockquote differs from the one on disk. */
  diverged: boolean;
  /** Set when the marker could not be parsed. */
  error?: StetError;
}

export interface ScanResult {
  blocks: ThreadBlock[];
  errors: StetError[];
}

function lineOf(source: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < source.length; i++) {
    if (source.charCodeAt(i) === 10 /* \n */) line++;
  }
  return line;
}

/** Strip one leading and one trailing newline from a `-->`-delimited region. */
function trimMarkerInner(innerRaw: string): string {
  return innerRaw.replace(/^\r?\n/, "").replace(/\r?\n[ \t]*$/, "");
}

function blockquoteText(between: string): string {
  return between.replace(/^\r?\n/, "").replace(/\r?\n$/, "");
}

export function scanThreadBlocks(source: string): ScanResult {
  const blocks: ThreadBlock[] = [];
  const errors: StetError[] = [];

  // The marker token can appear legitimately inside fenced/indented code and
  // inline code (docs, examples). Those occurrences are NOT real thread blocks.
  let code: OffsetRange[] = [];
  if (source.includes(OPEN_MARKER) || source.includes(LEGACY_OPEN_MARKER)) {
    try {
      code = codeRanges(parseAst(source));
    } catch {
      code = [];
    }
  }
  const inCode = (offset: number): boolean =>
    code.some((r) => offset >= r.start && offset < r.end);

  let cursor = 0;

  while (true) {
    const nextModern = source.indexOf(OPEN_MARKER, cursor);
    const nextLegacy = source.indexOf(LEGACY_OPEN_MARKER, cursor);
    if (nextModern === -1 && nextLegacy === -1) break;
    const useLegacy = nextModern === -1 || (nextLegacy !== -1 && nextLegacy < nextModern);
    const openMarker = useLegacy ? LEGACY_OPEN_MARKER : OPEN_MARKER;
    const closeMarker = useLegacy ? LEGACY_CLOSE_MARKER : CLOSE_MARKER;
    const openStart = useLegacy ? nextLegacy : nextModern;
    if (inCode(openStart)) {
      cursor = openStart + openMarker.length;
      continue;
    }

    const afterOpen = openStart + openMarker.length;
    // The opening comment closes at the first `-->`. Encoded marker bodies
    // never contain `-->`, so this is unambiguous.
    const arrowIdx = source.indexOf("-->", afterOpen);
    if (arrowIdx === -1) {
      const startLine = lineOf(source, openStart);
      const err = new StetError(
        "malformed_marker",
        "unterminated stet:thread marker: opening comment has no `-->`",
        { line: startLine },
      );
      errors.push(err);
      blocks.push({
        range: { start: openStart, end: source.length },
        raw: source.slice(openStart),
        startLine,
        diverged: false,
        error: err,
      });
      break; // cannot reliably resume past an unterminated comment
    }

    const innerRaw = source.slice(afterOpen, arrowIdx);
    const inner = trimMarkerInner(innerRaw);
    const afterArrow = arrowIdx + 3;
    const startLine = lineOf(source, openStart);
    // Marker inner begins on the line after the opening marker line.
    const baseLine = startLine + 1;

    const closeIdx = source.indexOf(closeMarker, afterArrow);
    if (closeIdx === -1) {
      const err = new StetError(
        "malformed_marker",
        `stet:thread block has no closing \`${closeMarker}\``,
        { line: startLine },
      );
      errors.push(err);
      blocks.push({
        range: { start: openStart, end: source.length },
        raw: source.slice(openStart),
        startLine,
        diverged: false,
        error: err,
      });
      break;
    }

    const blockEnd = closeIdx + closeMarker.length;
    const raw = source.slice(openStart, blockEnd);
    const between = blockquoteText(source.slice(afterArrow, closeIdx));

    let thread: ReviewThread | undefined;
    let error: StetError | undefined;
    try {
      thread = parseMarker(inner, { baseLine });
    } catch (e) {
      error = isStetError(e)
        ? e
        : new StetError("malformed_marker", String(e), { line: baseLine });
      errors.push(error);
    }

    const diverged =
      thread !== undefined && renderBlockquote(thread).trim() !== between.trim();

    blocks.push({
      ...(thread ? { thread } : {}),
      range: { start: openStart, end: blockEnd },
      raw,
      startLine,
      diverged,
      ...(error ? { error } : {}),
    });

    cursor = blockEnd;
  }

  return { blocks, errors };
}

/** Convenience: parsed threads only, in document order. Ignores malformed. */
export function listThreads(source: string): ReviewThread[] {
  return scanThreadBlocks(source)
    .blocks.map((b) => b.thread)
    .filter((t): t is ReviewThread => t !== undefined);
}
