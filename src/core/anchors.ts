import type { Root, RootContent } from "mdast";
import { parseAst, nodeText } from "./markdown.js";
import { scanThreadBlocks } from "./parseThreads.js";
import { hashTargetText, normalizeTargetText } from "./hash.js";
import type { ReviewThread } from "./types.js";

/**
 * MVP anchor matching (master PRD §9). No fuzzy matching: surface drift and
 * orphans honestly rather than guessing.
 *
 *   1. Physically adjacent + source hash matches  -> "attached"
 *   2. Physically adjacent + source hash differs   -> "content_drifted"
 *   3. Exact source hash found elsewhere           -> "reattached"
 *   4. No plausible target                         -> "orphan"
 */

export type AnchorStatus =
  | "attached"
  | "content_drifted"
  | "reattached"
  | "orphan"
  | "document";

export interface AnchorResult {
  threadId: string;
  status: AnchorStatus;
  /** Range of the matched target block, when one was found. */
  anchorRange?: { start: number; end: number };
}

interface Candidate {
  start: number;
  end: number;
  hash: string;
}

const TARGET_TYPES = new Set(["heading", "paragraph", "code"]);

function collectCandidates(tree: Root, threadRanges: { start: number; end: number }[]): Candidate[] {
  const out: Candidate[] = [];
  for (const node of tree.children as RootContent[]) {
    if (!TARGET_TYPES.has(node.type)) continue;
    const start = node.position?.start.offset ?? 0;
    const end = node.position?.end.offset ?? 0;
    if (threadRanges.some((r) => start >= r.start && start < r.end)) continue;
    // Hash the same semantic text basis used when the target was created
    // (see markdown.ts buildTarget): node text for prose, value for code.
    const text =
      node.type === "code" && "value" in node
        ? (node.value as string)
        : nodeText(node);
    out.push({ start, end, hash: hashTargetText(text) });
  }
  return out;
}

export function resolveAnchors(source: string): AnchorResult[] {
  const tree = parseAst(source);
  const blocks = scanThreadBlocks(source).blocks;
  const threadRanges = blocks.map((b) => b.range);
  const candidates = collectCandidates(tree, threadRanges);

  const results: AnchorResult[] = [];
  for (const block of blocks) {
    const thread = block.thread;
    if (!thread) continue;
    results.push(anchorOne(source, thread, block.range, candidates));
  }
  return results;
}

function anchorOne(
  source: string,
  thread: ReviewThread,
  blockRange: { start: number; end: number },
  candidates: Candidate[],
): AnchorResult {
  if (thread.target.kind === "document") {
    return { threadId: thread.id, status: "document" };
  }

  // Nearest candidate ending before the block, separated only by blank lines.
  let adjacent: Candidate | undefined;
  for (const c of candidates) {
    if (c.end <= blockRange.start) {
      const gap = source.slice(c.end, blockRange.start);
      if (/^\s*$/.test(gap)) {
        if (!adjacent || c.end > adjacent.end) adjacent = c;
      }
    }
  }

  if (adjacent) {
    if (adjacent.hash === thread.target.sourceHash) {
      return {
        threadId: thread.id,
        status: "attached",
        anchorRange: { start: adjacent.start, end: adjacent.end },
      };
    }
    return {
      threadId: thread.id,
      status: "content_drifted",
      anchorRange: { start: adjacent.start, end: adjacent.end },
    };
  }

  const exact = candidates.find((c) => c.hash === thread.target.sourceHash);
  if (exact) {
    return {
      threadId: thread.id,
      status: "reattached",
      anchorRange: { start: exact.start, end: exact.end },
    };
  }
  return { threadId: thread.id, status: "orphan" };
}

export { normalizeTargetText };
