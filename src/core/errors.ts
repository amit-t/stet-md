export class RedlineError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = "RedlineError";
  }
}

export class RedlineConflictError extends RedlineError {
  constructor(message = "Markdown file changed on disk; refusing to overwrite.") {
    super(message, "ERR_REDLINE_CONFLICT");
    this.name = "RedlineConflictError";
  }
}

export class RedlineParseError extends RedlineError {
  constructor(message: string) {
    super(message, "ERR_REDLINE_PARSE");
    this.name = "RedlineParseError";
  }
}

export class RedlineNotFoundError extends RedlineError {
  constructor(message: string) {
    super(message, "ERR_REDLINE_NOT_FOUND");
    this.name = "RedlineNotFoundError";
  }
}
