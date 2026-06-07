import { createHash, randomBytes } from "node:crypto";

export function sha256Hex(input: Buffer | string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function sha256Digest(input: Buffer | string): string {
  return `sha256:${sha256Hex(input)}`;
}

export function hashBuffer(buffer: Buffer): string {
  return sha256Digest(buffer);
}

export function normalizeForSourceHash(markdownSource: string): string {
  return markdownSource.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/^\n+|\n+$/g, "");
}

export function sourceHash(markdownSource: string): string {
  return sha256Digest(normalizeForSourceHash(markdownSource));
}

export function createThreadId(now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z").replace("T", "_").replace(/Z$/, "");
  return `rlt_${stamp}_${randomBytes(3).toString("hex")}`;
}
