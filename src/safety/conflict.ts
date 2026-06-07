import { readFileSync } from "node:fs";
import { hashFileContent } from "../core/hash.js";

/**
 * Conflict detection: compare the hash loaded at read time against the file's
 * current on-disk hash just before writing. Any mismatch means the file
 * changed underneath us and the write must be refused (no last-write-wins).
 */

export function hashContent(text: string): string {
  return hashFileContent(text);
}

export interface LoadedFile {
  content: string;
  hash: string;
}

/** Read a UTF-8 file and capture its content hash for later conflict checks. */
export function readAndHash(path: string): LoadedFile {
  const content = readFileSync(path, "utf8");
  return { content, hash: hashFileContent(content) };
}

/** True when the current on-disk content differs from the loaded hash. */
export function hasConflict(loadedHash: string, currentContent: string): boolean {
  return hashFileContent(currentContent) !== loadedHash;
}
