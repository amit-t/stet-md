import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { detectFileFormat, type FileFormat } from "../core/fileFormat.js";
import { hashFileContent } from "../core/hash.js";
import { StetError } from "../core/errors.js";
import { createBackup } from "../safety/backups.js";
import { writeFileAtomic } from "../safety/atomicWrite.js";
import { inspectLock } from "../safety/locks.js";

/**
 * Shared file load/save pipeline for write commands. Implements the PRD save
 * contract: re-read the file just before writing, refuse on any change since
 * load (no last-write-wins), back up the prior bytes, then write atomically.
 */

export interface LoadedDoc {
  absPath: string;
  content: string;
  hash: string;
  format: FileFormat;
}

export function loadDoc(path: string): LoadedDoc {
  const absPath = resolve(path);
  let content: string;
  try {
    content = readFileSync(absPath, "utf8");
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === "ENOENT") {
      throw new StetError("io_error", `no such file: ${path}`);
    }
    if (err.code === "EISDIR") {
      throw new StetError("io_error", `not a file: ${path}`);
    }
    throw new StetError("io_error", `cannot read ${path}: ${err.message}`);
  }
  return {
    absPath,
    content,
    hash: hashFileContent(content),
    format: detectFileFormat(content),
  };
}

export interface SaveResult {
  backupPath: string;
  lockWarning?: string;
}

/**
 * Persist new content for a document, refusing if the file changed on disk
 * since it was loaded. Creates a backup of the prior bytes first.
 */
export function saveDoc(
  doc: LoadedDoc,
  newContent: string,
  opts: { now?: Date } = {},
): SaveResult {
  const now = opts.now ?? new Date();

  // Re-read current disk bytes and refuse if they changed since load.
  let current: string;
  try {
    current = readFileSync(doc.absPath, "utf8");
  } catch (e) {
    throw new StetError(
      "io_error",
      `cannot re-read ${doc.absPath}: ${(e as Error).message}`,
    );
  }
  if (hashFileContent(current) !== doc.hash) {
    throw new StetError(
      "file_changed",
      `${doc.absPath} changed on disk since it was read; refusing to overwrite. Re-run the command.`,
    );
  }

  // Warn (do not block) if another Stet.md instance holds an active lock.
  let lockWarning: string | undefined;
  const lock = inspectLock(doc.absPath);
  if (lock && lock.pid !== process.pid) {
    lockWarning = `another Stet.md instance (pid ${lock.pid} on ${lock.hostname}) holds a lock on this file`;
  }

  const backupPath = createBackup(doc.absPath, current, now);
  writeFileAtomic(doc.absPath, newContent);

  return lockWarning ? { backupPath, lockWarning } : { backupPath };
}
