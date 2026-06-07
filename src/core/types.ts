export type ReviewStatus = "open" | "resolved";
export type ReviewTargetKind = "document" | "heading" | "paragraph" | "code_block" | "sub_block";

export type ByteRange = {
  start: number;
  end: number;
};

export type ReviewTarget = {
  id: string;
  kind: ReviewTargetKind;
  headingPath: string[];
  blockOrdinal: number;
  sourceHash: string;
  quote: string;
  byteRange: ByteRange;
  lineStart: number;
  lineEnd: number;
  intraBlock?: {
    kind: "list_item" | "table_row" | "text_range";
    ordinal?: number;
    startOffset?: number;
    endOffset?: number;
  };
};

export type ReviewMessage = {
  author: string;
  createdAt: string;
  bodyMarkdown: string;
  editedAt?: string;
};

export type ThreadAnchor = {
  state: "attached" | "content_drifted" | "orphan";
  targetId?: string;
  message?: string;
};

export type ReviewThread = {
  version: 1;
  id: string;
  target: ReviewTarget;
  status: ReviewStatus;
  createdAt: string;
  updatedAt: string;
  messages: ReviewMessage[];
  range?: ByteRange;
  lineStart?: number;
  lineEnd?: number;
  anchor?: ThreadAnchor;
};

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
