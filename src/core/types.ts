/**
 * Core Stet.md data model. The structured `stet:thread` marker is the
 * source of truth; visible blockquotes, browser cards, and CLI JSON are derived.
 */

export type ThreadStatus = "open" | "resolved";
export type ReviewStatus = ThreadStatus;

export type TargetKind = "document" | "heading" | "paragraph" | "code_block" | "sub_block";
export type ReviewTargetKind = TargetKind;

export type ByteRange = {
  start: number;
  end: number;
};

export interface IntraBlockLocator {
  kind: "list_item" | "table_row" | "text_range";
  ordinal?: number;
  startOffset?: number;
  endOffset?: number;
}

export interface ReviewTarget {
  /** Browser/server target id. Present for rendered targets, absent in stored markers. */
  id?: string;
  kind: TargetKind;
  headingPath: string[];
  blockOrdinal: number;
  sourceHash: string;
  quote: string;
  intraBlock?: IntraBlockLocator;
  /** Source location. Present for rendered targets, absent in stored markers. */
  byteRange?: ByteRange;
  lineStart?: number;
  lineEnd?: number;
}

export interface ReviewMessage {
  author: string;
  /** UTC ISO 8601, e.g. `2026-06-07T15:00:15Z`. */
  createdAt: string;
  /** Raw Markdown body, decoded from the marker encoding. */
  bodyMarkdown: string;
  editedAt?: string;
}

export type ThreadAnchor = {
  state: "attached" | "content_drifted" | "orphan";
  targetId?: string;
  message?: string;
};

export interface ReviewThread {
  version: 1;
  id: string;
  status: ThreadStatus;
  createdAt: string;
  updatedAt: string;
  target: ReviewTarget;
  messages: ReviewMessage[];
  /** Source location of the whole persisted thread block, when parsed from disk. */
  range?: ByteRange;
  lineStart?: number;
  lineEnd?: number;
  anchor?: ThreadAnchor;
}

export type RawThreadBlock = {
  raw: string;
  range: ByteRange;
  lineStart: number;
  lineEnd: number;
  id?: string;
};

export type ReviewWarning = {
  kind: "divergent_generated_blockquote" | "content_drifted" | "orphaned_thread" | "unsafe_html_escaped" | "remote_resource_blocked";
  threadId?: string;
  message: string;
};

export type ReviewParseError = {
  kind: "malformed_marker";
  message: string;
  threadId?: string;
  range: ByteRange;
  lineStart: number;
  lineEnd: number;
  raw: string;
};

export type RenderedBlock = {
  type: "heading" | "paragraph" | "list" | "blockquote" | "code";
  html: string;
  range: ByteRange;
  lineStart: number;
  lineEnd: number;
  targetId?: string;
};

export type ReviewDocument = {
  filePath: string;
  fileName: string;
  fileHash: string;
  lineEnding: "\n" | "\r\n";
  hasBom: boolean;
  finalNewline: boolean;
  html: string;
  targets: ReviewTarget[];
  threads: ReviewThread[];
  rawThreadBlocks: RawThreadBlock[];
  warnings: ReviewWarning[];
  errors: ReviewParseError[];
  blocks: RenderedBlock[];
};

export type SaveOptions = {
  expectedHash?: string;
  now?: Date;
  createBackup?: boolean;
};
