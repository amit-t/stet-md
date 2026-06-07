import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { hostname as osHostname } from "node:os";
import { join, resolve } from "node:path";
import { shortHash } from "../core/hash.js";
import { ensureStateDir } from "./state.js";

/**
 * Advisory single-writer locks under `.redline/locks/`. A second Redline
 * instance on the same file is detected and warned about; last-write-wins is
 * forbidden. A lock is considered stale (and recoverable) when its PID no
 * longer exists or its mtime is older than the staleness window.
 */

export interface LockInfo {
  pid: number;
  hostname: string;
  startedAt: string; // UTC ISO 8601
  targetFile: string; // absolute path
  loadedHash: string;
}

export interface AcquireOptions {
  now?: Date;
  pid?: number;
  hostname?: string;
  /** Age (ms) past which a lock is treated as stale. Default 1 hour. */
  staleMs?: number;
  /** Liveness probe (injectable for tests). */
  isAlive?: (pid: number) => boolean;
}

export type AcquireResult =
  | { acquired: true; lock: LockInfo; recoveredStale?: LockInfo }
  | { acquired: false; conflict: LockInfo };

const DEFAULT_STALE_MS = 60 * 60 * 1000;

export function lockPath(targetFile: string): string {
  const abs = resolve(targetFile);
  const { locks } = ensureStateDir(targetFile);
  return join(locks, `${shortHash(abs)}.json`);
}

/** Default liveness probe using signal 0. */
export function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    // EPERM means the process exists but we may not signal it.
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

function readLock(path: string): LockInfo | undefined {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as LockInfo;
  } catch {
    return undefined;
  }
}

export function inspectLock(targetFile: string): LockInfo | undefined {
  const path = lockPath(targetFile);
  if (!existsSync(path)) return undefined;
  return readLock(path);
}

function isStale(
  path: string,
  lock: LockInfo,
  now: Date,
  staleMs: number,
  isAlive: (pid: number) => boolean,
): boolean {
  if (!isAlive(lock.pid)) return true;
  try {
    const mtime = statSync(path).mtimeMs;
    return now.getTime() - mtime > staleMs;
  } catch {
    return true;
  }
}

export function acquireLock(
  targetFile: string,
  loadedHash: string,
  opts: AcquireOptions = {},
): AcquireResult {
  const now = opts.now ?? new Date();
  const pid = opts.pid ?? process.pid;
  const host = opts.hostname ?? osHostname();
  const staleMs = opts.staleMs ?? DEFAULT_STALE_MS;
  const isAlive = opts.isAlive ?? processAlive;

  const { locks } = ensureStateDir(targetFile);
  mkdirSync(locks, { recursive: true });
  const path = lockPath(targetFile);

  const next: LockInfo = {
    pid,
    hostname: host,
    startedAt: now.toISOString().replace(/\.\d{3}Z$/, "Z"),
    targetFile: resolve(targetFile),
    loadedHash,
  };

  const existing = existsSync(path) ? readLock(path) : undefined;
  if (existing) {
    // Re-entrant: same process already holds it.
    if (existing.pid === pid && existing.hostname === host) {
      writeFileSync(path, JSON.stringify(next, null, 2), "utf8");
      return { acquired: true, lock: next };
    }
    if (!isStale(path, existing, now, staleMs, isAlive)) {
      return { acquired: false, conflict: existing };
    }
    // Stale: recover by taking over the lock.
    writeFileSync(path, JSON.stringify(next, null, 2), "utf8");
    return { acquired: true, lock: next, recoveredStale: existing };
  }

  writeFileSync(path, JSON.stringify(next, null, 2), "utf8");
  return { acquired: true, lock: next };
}

/** Release a lock if it is held by this process. */
export function releaseLock(
  targetFile: string,
  opts: { pid?: number; hostname?: string } = {},
): void {
  const pid = opts.pid ?? process.pid;
  const host = opts.hostname ?? osHostname();
  const path = lockPath(targetFile);
  if (!existsSync(path)) return;
  const lock = readLock(path);
  if (lock && lock.pid === pid && lock.hostname === host) {
    try {
      unlinkSync(path);
    } catch {
      /* ignore */
    }
  }
}
