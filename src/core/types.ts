/**
 * Core Redline data model. The structured `redline:thread` marker is the
 * single source of truth; everything else (the visible blockquote, the JSON
 * the CLI emits) is derived from these shapes.
 */

export type ThreadStatus = "open" | "resolved";

export type TargetKind =
  | "document"
  | "heading"
  | "paragraph"
  | "code_block"
  | "sub_block";

export interface IntraBlockLocator {
  kind: "list_item" | "table_row" | "text_range";
  ordinal?: number;
  startOffset?: number;
  endOffset?: number;
}

export interface ReviewTarget {
  kind: TargetKind;
  /** Heading hierarchy that contains the target, outermost first. */
  headingPath: string[];
  /** Ordinal among comparable blocks within the section (0-based). */
  blockOrdinal: number;
  /** `sha256:<hex>` of the normalized target text at creation time. */
  sourceHash: string;
  /** Short quoted context shown to agents / used for later matching. */
  quote: string;
  /** Post-MVP sub-block locator. Absent for MVP targets. */
  intraBlock?: IntraBlockLocator;
}

export interface ReviewMessage {
  author: string;
  /** UTC ISO 8601, e.g. `2026-06-07T15:00:15Z`. */
  createdAt: string;
  /** Raw Markdown body, decoded (the on-disk form is comment-escaped). */
  bodyMarkdown: string;
  /** UTC ISO 8601, present only if the message was edited. */
  editedAt?: string;
}

export interface ReviewThread {
  version: 1;
  id: string;
  status: ThreadStatus;
  /** UTC ISO 8601. */
  createdAt: string;
  /** UTC ISO 8601. */
  updatedAt: string;
  target: ReviewTarget;
  messages: ReviewMessage[];
}
