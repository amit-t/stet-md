import type { RootContent, Heading, Paragraph } from "mdast";
import type { ReviewTarget, TargetKind } from "./types.js";
import { hashTargetText } from "./hash.js";
import { scanThreadBlocks } from "./parseThreads.js";
import { parseAst, nodeText } from "./ast.js";
import { RedlineError } from "./errors.js";

/**
 * Markdown target layer. Provides source positions for finding comment targets
 * (headings, paragraphs, document) and the byte offset at which a new thread
 * block should be inserted. The AST is used ONLY to discover positions; saves
 * are byte splices, never AST stringification.
 */

export { parseAst, nodeText };

interface Range {
  start: number;
  end: number;
}

function offsetStart(node: RootContent): number {
  return node.position?.start.offset ?? 0;
}
function offsetEnd(node: RootContent): number {
  return node.position?.end.offset ?? 0;
}

function inAnyRange(offset: number, ranges: Range[]): boolean {
  return ranges.some((r) => offset >= r.start && offset < r.end);
}

/** Index just past the next `\n` at/after `offset` (or end of source). */
function endOfLine(source: string, offset: number): number {
  const nl = source.indexOf("\n", offset);
  return nl === -1 ? source.length : nl + 1;
}

export interface ResolvedTarget {
  target: ReviewTarget;
  /** Source text of the target block, used for hashing/quote. */
  targetText: string;
  /** Offset at which a new thread block for this target is inserted. */
  insertOffset: number;
}

export interface TargetSpec {
  kind: TargetKind;
  /** Heading text, paragraph ordinal (1-based) or text, ignored for document. */
  value?: string;
}

function quoteOf(text: string): string {
  const firstLine = text.replace(/\r\n/g, "\n").split("\n")[0]!.trim();
  return firstLine.length > 120 ? firstLine.slice(0, 117) + "..." : firstLine;
}

function buildTarget(
  kind: TargetKind,
  headingPath: string[],
  blockOrdinal: number,
  hashText: string,
  quote: string,
): ReviewTarget {
  return {
    kind,
    headingPath,
    blockOrdinal,
    // Hash the semantic text of the block so anchoring is stable across
    // formatting noise and consistent with the anchor candidate hashing.
    sourceHash: hashTargetText(hashText),
    quote,
  };
}

/** Advance past any thread blocks that immediately follow `offset`. */
function skipFollowingThreadBlocks(
  source: string,
  offset: number,
  threadRanges: Range[],
): number {
  let ins = offset;
  let advanced = true;
  while (advanced) {
    advanced = false;
    for (const r of threadRanges) {
      // A thread block "immediately follows" if only blank lines separate it.
      const gap = source.slice(ins, r.start);
      if (r.start >= ins && /^\s*$/.test(gap)) {
        ins = endOfLine(source, r.end);
        advanced = true;
        break;
      }
    }
  }
  return ins;
}

/**
 * Resolve a target spec to a concrete target + insertion offset.
 * Throws RedlineError("target_not_found"/"invalid_target") when unresolvable.
 */
export function resolveTarget(
  source: string,
  spec: TargetSpec,
): ResolvedTarget {
  const tree = parseAst(source);
  const threadRanges: Range[] = scanThreadBlocks(source).blocks.map(
    (b) => b.range,
  );
  const top = tree.children;

  if (spec.kind === "document") {
    const insertOffset = source.length;
    return {
      target: buildTarget("document", [], 0, "", ""),
      targetText: "",
      insertOffset,
    };
  }

  // Track heading stack and per-section paragraph ordinals while walking.
  const headingStack: { depth: number; text: string }[] = [];
  let sectionParagraphIndex = 0;
  let headingOccurrence = 0;
  let paragraphIndex = 0; // document-wide, excluding thread blocks

  for (const node of top) {
    const startOff = offsetStart(node);
    if (inAnyRange(startOff, threadRanges)) continue;

    if (node.type === "heading") {
      const h = node as Heading;
      const text = nodeText(h).trim();
      while (
        headingStack.length > 0 &&
        headingStack[headingStack.length - 1]!.depth >= h.depth
      ) {
        headingStack.pop();
      }
      headingStack.push({ depth: h.depth, text });
      sectionParagraphIndex = 0;

      if (spec.kind === "heading" && text === spec.value) {
        const headingPath = headingStack.map((s) => s.text);
        const targetText = source.slice(offsetStart(h), offsetEnd(h));
        const insertOffset = skipFollowingThreadBlocks(
          source,
          endOfLine(source, offsetEnd(h)),
          threadRanges,
        );
        return {
          target: buildTarget(
            "heading",
            headingPath,
            headingOccurrence,
            text,
            quoteOf(text),
          ),
          targetText,
          insertOffset,
        };
      }
      headingOccurrence++;
    } else if (node.type === "paragraph") {
      const p = node as Paragraph;
      paragraphIndex++;
      const ordinalInSection = sectionParagraphIndex++;
      const text = nodeText(p);
      const matchesOrdinal =
        spec.kind === "paragraph" &&
        /^\d+$/.test(spec.value ?? "") &&
        Number(spec.value) === paragraphIndex;
      const matchesText =
        spec.kind === "paragraph" &&
        !!spec.value &&
        !/^\d+$/.test(spec.value) &&
        text.includes(spec.value);
      if (matchesOrdinal || matchesText) {
        const headingPath = headingStack.map((s) => s.text);
        const targetText = source.slice(offsetStart(p), offsetEnd(p));
        const insertOffset = skipFollowingThreadBlocks(
          source,
          endOfLine(source, offsetEnd(p)),
          threadRanges,
        );
        return {
          target: buildTarget(
            "paragraph",
            headingPath,
            ordinalInSection,
            text,
            quoteOf(text),
          ),
          targetText,
          insertOffset,
        };
      }
    }
  }

  if (spec.kind === "heading") {
    throw new RedlineError(
      "target_not_found",
      `no heading matches "${spec.value}"`,
    );
  }
  throw new RedlineError(
    "target_not_found",
    `no paragraph matches "${spec.value}"`,
  );
}

/** Parse a CLI `--target kind:value` string into a TargetSpec. */
export function parseTargetSpec(raw: string): TargetSpec {
  const idx = raw.indexOf(":");
  const kind = (idx === -1 ? raw : raw.slice(0, idx)).trim();
  const value = idx === -1 ? undefined : raw.slice(idx + 1).trim();
  if (kind === "document") return { kind: "document" };
  if (kind === "heading" || kind === "paragraph") {
    if (!value) {
      throw new RedlineError(
        "invalid_target",
        `target "${kind}" requires a value, e.g. ${kind}:"Product goals"`,
      );
    }
    return { kind, value };
  }
  throw new RedlineError(
    "invalid_target",
    `unknown target kind "${kind}" (expected document, heading, or paragraph)`,
  );
}

export { endOfLine };
