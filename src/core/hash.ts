import { createHash, randomBytes } from "node:crypto";

export function sha256Hex(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

export function sha256Digest(input: string | Buffer): string {
  return `sha256:${sha256Hex(input)}`;
}

export function hashBuffer(buffer: Buffer): string {
  return sha256Digest(buffer);
}

/** `sha256:<hex>` of the raw UTF-8 bytes of the whole file. */
export function hashFileContent(text: string): string {
  return sha256Digest(Buffer.from(text, "utf8"));
}

/** Normalize a target block's text for stable anchor hashing. */
export function normalizeTargetText(text: string): string {
  const lf = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = lf.split("\n");
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start]!.trim() === "") start += 1;
  while (end > start && lines[end - 1]!.trim() === "") end -= 1;
  return lines.slice(start, end).join("\n");
}

export function normalizeForSourceHash(markdownSource: string): string {
  return normalizeTargetText(markdownSource);
}

/** `sha256:<hex>` of the normalized target text. */
export function hashTargetText(text: string): string {
  return sha256Digest(normalizeTargetText(text));
}

export function sourceHash(markdownSource: string): string {
  return hashTargetText(markdownSource);
}

/** Short hex suffix used in backup filenames. */
export function shortHash(text: string): string {
  return sha256Hex(Buffer.from(text, "utf8")).slice(0, 12);
}

export function createThreadId(now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z").replace("T", "_").replace(/Z$/, "");
  return `rlt_${stamp}_${randomBytes(3).toString("hex")}`;
}
