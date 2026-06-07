/** Stable Redline error hierarchy used by core, CLI, and server. */

export type RedlineErrorCode =
  | "malformed_marker"
  | "unknown_thread"
  | "duplicate_thread"
  | "file_changed"
  | "target_not_found"
  | "invalid_target"
  | "io_error"
  | "lock_conflict"
  | "usage"
  | "ERR_REDLINE_CONFLICT"
  | "ERR_REDLINE_PARSE"
  | "ERR_REDLINE_NOT_FOUND";

export class RedlineError extends Error {
  readonly code: RedlineErrorCode | string;
  /** 1-based line number within the file when known. */
  readonly line?: number;
  /** Inclusive line range within the file when known. */
  readonly range?: { startLine: number; endLine: number };

  constructor(code: RedlineErrorCode | string, message: string, opts?: { line?: number; range?: { startLine: number; endLine: number } });
  constructor(message: string, code: RedlineErrorCode | string);
  constructor(first: RedlineErrorCode | string, second: string, opts?: { line?: number; range?: { startLine: number; endLine: number } }) {
    const firstLooksLikeCode = /^(?:[a-z_]+|ERR_REDLINE_[A-Z_]+)$/.test(first) && !/\s/.test(first);
    const code = firstLooksLikeCode ? first : second;
    const message = firstLooksLikeCode ? second : first;
    super(message);
    this.name = "RedlineError";
    this.code = code;
    if (opts?.line !== undefined) this.line = opts.line;
    if (opts?.range !== undefined) this.range = opts.range;
  }
}

export class RedlineConflictError extends RedlineError {
  constructor(message = "Markdown file changed on disk; refusing to overwrite.") {
    super("ERR_REDLINE_CONFLICT", message);
    this.name = "RedlineConflictError";
  }
}

export class RedlineParseError extends RedlineError {
  constructor(message: string) {
    super("ERR_REDLINE_PARSE", message);
    this.name = "RedlineParseError";
  }
}

export class RedlineNotFoundError extends RedlineError {
  constructor(message: string) {
    super("ERR_REDLINE_NOT_FOUND", message);
    this.name = "RedlineNotFoundError";
  }
}

export function isRedlineError(e: unknown): e is RedlineError {
  return e instanceof RedlineError;
}
