/**
 * Typed errors. Each carries a stable `code` the CLI maps to a nonzero exit
 * status and a human-readable message.
 */

export type RedlineErrorCode =
  | "malformed_marker"
  | "unknown_thread"
  | "duplicate_thread"
  | "file_changed"
  | "target_not_found"
  | "invalid_target"
  | "io_error"
  | "lock_conflict"
  | "usage";

export class RedlineError extends Error {
  readonly code: RedlineErrorCode;
  /** 1-based line number within the file when known. */
  readonly line?: number;
  /** Inclusive line range within the file when known. */
  readonly range?: { startLine: number; endLine: number };

  constructor(
    code: RedlineErrorCode,
    message: string,
    opts?: { line?: number; range?: { startLine: number; endLine: number } },
  ) {
    super(message);
    this.name = "RedlineError";
    this.code = code;
    if (opts?.line !== undefined) this.line = opts.line;
    if (opts?.range !== undefined) this.range = opts.range;
  }
}

export function isRedlineError(e: unknown): e is RedlineError {
  return e instanceof RedlineError;
}
