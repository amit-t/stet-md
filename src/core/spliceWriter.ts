import type { ReviewThread } from "./types.js";
import { renderThreadBlock } from "./threadMarker.js";
import { applyEol, type FileFormat } from "./fileFormat.js";
import type { ThreadBlock } from "./parseThreads.js";
import { RedlineError } from "./errors.js";

/**
 * Byte-splice persistence. Edits are expressed as half-open char ranges with
 * replacement text and applied from the end of the file toward the start so
 * earlier offsets stay valid. Every byte outside a splice range is preserved
 * exactly — this is the product's core safety guarantee.
 */

export interface Splice {
  /** Half-open range `[start, end)` to replace. start === end inserts. */
  start: number;
  end: number;
  replacement: string;
}

/** Apply splices to `source`, preserving all bytes outside the ranges. */
export function applySplices(source: string, splices: Splice[]): string {
  const sorted = [...splices].sort((a, b) => a.start - b.start);
  for (let i = 0; i < sorted.length; i++) {
    const s = sorted[i]!;
    if (s.start < 0 || s.end > source.length || s.start > s.end) {
      throw new RedlineError(
        "io_error",
        `splice [${s.start}, ${s.end}) is out of bounds for length ${source.length}`,
      );
    }
    if (i > 0 && s.start < sorted[i - 1]!.end) {
      throw new RedlineError("io_error", "overlapping splices are not allowed");
    }
  }
  // Apply descending so earlier offsets remain valid.
  let out = source;
  for (let i = sorted.length - 1; i >= 0; i--) {
    const s = sorted[i]!;
    out = out.slice(0, s.start) + s.replacement + out.slice(s.end);
  }
  return out;
}

/**
 * Build the replacement text for inserting a block at `offset`, ensuring a
 * single blank line separates it from neighbouring content, in the file's EOL.
 */
function insertionReplacement(
  source: string,
  offset: number,
  blockLf: string,
  format: FileFormat,
): string {
  let lead: string;
  if (offset === 0) {
    lead = "";
  } else if (source[offset - 1] !== "\n") {
    lead = "\n\n";
  } else if (offset >= 2 && source[offset - 2] === "\n") {
    lead = ""; // already a blank line above
  } else {
    lead = "\n";
  }

  let trail: string;
  if (offset >= source.length) {
    trail = format.hasFinalNewline ? "\n" : "\n";
  } else if (source[offset] === "\n") {
    trail = "\n";
  } else {
    trail = "\n\n";
  }

  return applyEol(lead + blockLf + trail, format.eol);
}

/** Splice that inserts a new thread block at `insertOffset`. */
export function insertThreadSplice(
  source: string,
  insertOffset: number,
  thread: ReviewThread,
  format: FileFormat,
): Splice {
  const blockLf = renderThreadBlock(thread);
  return {
    start: insertOffset,
    end: insertOffset,
    replacement: insertionReplacement(source, insertOffset, blockLf, format),
  };
}

/** Splice that replaces an existing thread block in place (e.g. reply/resolve). */
export function replaceThreadSplice(
  block: ThreadBlock,
  thread: ReviewThread,
  format: FileFormat,
): Splice {
  return {
    start: block.range.start,
    end: block.range.end,
    replacement: applyEol(renderThreadBlock(thread), format.eol),
  };
}

/** Convenience: insert and return the new source. */
export function insertThreadBlock(
  source: string,
  insertOffset: number,
  thread: ReviewThread,
  format: FileFormat,
): string {
  return applySplices(source, [
    insertThreadSplice(source, insertOffset, thread, format),
  ]);
}

/** Convenience: replace and return the new source. */
export function replaceThreadBlock(
  source: string,
  block: ThreadBlock,
  thread: ReviewThread,
  format: FileFormat,
): string {
  return applySplices(source, [replaceThreadSplice(block, thread, format)]);
}
