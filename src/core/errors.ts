/** Stable Stet.md error hierarchy used by core, CLI, and server. */

export type StetErrorCode =
  | "malformed_marker"
  | "unknown_thread"
  | "duplicate_thread"
  | "file_changed"
  | "target_not_found"
  | "invalid_target"
  | "io_error"
  | "lock_conflict"
  | "usage"
  | "ERR_STET_CONFLICT"
  | "ERR_STET_PARSE"
  | "ERR_STET_NOT_FOUND";

export class StetError extends Error {
  readonly code: StetErrorCode | string;
  /** 1-based line number within the file when known. */
  readonly line?: number;
  /** Inclusive line range within the file when known. */
  readonly range?: { startLine: number; endLine: number };

  constructor(code: StetErrorCode | string, message: string, opts?: { line?: number; range?: { startLine: number; endLine: number } });
  constructor(message: string, code: StetErrorCode | string);
  constructor(first: StetErrorCode | string, second: string, opts?: { line?: number; range?: { startLine: number; endLine: number } }) {
    const firstLooksLikeCode = /^(?:[a-z_]+|ERR_STET_[A-Z_]+)$/.test(first) && !/\s/.test(first);
    const code = firstLooksLikeCode ? first : second;
    const message = firstLooksLikeCode ? second : first;
    super(message);
    this.name = "StetError";
    this.code = code;
    if (opts?.line !== undefined) this.line = opts.line;
    if (opts?.range !== undefined) this.range = opts.range;
  }
}

export class StetConflictError extends StetError {
  constructor(message = "Markdown file changed on disk; refusing to overwrite.") {
    super("ERR_STET_CONFLICT", message);
    this.name = "StetConflictError";
  }
}

export class StetParseError extends StetError {
  constructor(message: string) {
    super("ERR_STET_PARSE", message);
    this.name = "StetParseError";
  }
}

export class StetNotFoundError extends StetError {
  constructor(message: string) {
    super("ERR_STET_NOT_FOUND", message);
    this.name = "StetNotFoundError";
  }
}

export function isStetError(e: unknown): e is StetError {
  return e instanceof StetError;
}
