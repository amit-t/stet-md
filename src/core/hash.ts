import { createHash } from "node:crypto";

/**
 * Hashing helpers.
 *
 * `hashFileContent` hashes whole-file bytes for conflict detection (any byte
 * change must be detected, so it does NOT normalize).
 *
 * `hashTargetText` hashes a normalized view of a target block for anchor
 * matching, per master PRD §9: normalize line endings to `\n`, trim leading
 * and trailing blank lines, but preserve internal whitespace and markup.
 */

export function sha256Hex(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

/** `sha256:<hex>` of the raw UTF-8 bytes of the whole file. */
export function hashFileContent(text: string): string {
  return `sha256:${sha256Hex(Buffer.from(text, "utf8"))}`;
}

/** Normalize a target block's text for stable anchor hashing. */
export function normalizeTargetText(text: string): string {
  const lf = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = lf.split("\n");
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start]!.trim() === "") start++;
  while (end > start && lines[end - 1]!.trim() === "") end--;
  return lines.slice(start, end).join("\n");
}

/** `sha256:<hex>` of the normalized target text. */
export function hashTargetText(text: string): string {
  return `sha256:${sha256Hex(normalizeTargetText(text))}`;
}

/** Short hex suffix used in backup filenames. */
export function shortHash(text: string): string {
  return sha256Hex(Buffer.from(text, "utf8")).slice(0, 12);
}
