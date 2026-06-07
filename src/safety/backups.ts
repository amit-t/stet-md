import { mkdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { shortHash } from "../core/hash.js";
import { ensureStateDir } from "./state.js";

/**
 * Write a timestamped backup of the file's current bytes into
 * `.stet/backups/` before an atomic replacement. The filename embeds a UTC
 * timestamp and a short content hash so backups are sortable and dedupable.
 */

function backupStamp(now: Date): string {
  // 2026-06-07T15:00:15.000Z -> 20260607T150015Z
  return now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

export function backupFilename(targetFile: string, content: string, now: Date): string {
  return `${basename(targetFile)}.${backupStamp(now)}.${shortHash(content)}.bak`;
}

/** Create a backup of `content` for `targetFile`; returns the backup path. */
export function createBackup(
  targetFile: string,
  content: string,
  now: Date = new Date(),
): string {
  const { backups } = ensureStateDir(targetFile);
  mkdirSync(backups, { recursive: true });
  const path = join(backups, backupFilename(targetFile, content, now));
  writeFileSync(path, content, "utf8");
  return path;
}
