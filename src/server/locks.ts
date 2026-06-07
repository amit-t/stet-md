import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import { hostname } from "node:os";

export type LockStatus = {
  state: "created" | "active_lock" | "stale_recovered";
  message?: string;
  lockPath: string;
};

function lockPathFor(filePath: string): string {
  const stateDir = join(dirname(filePath), ".redline");
  mkdirSync(join(stateDir, "locks"), { recursive: true });
  if (!existsSync(join(stateDir, ".gitignore"))) writeFileSync(join(stateDir, ".gitignore"), "*\n");
  const digest = createHash("sha256").update(filePath).digest("hex").slice(0, 20);
  return join(stateDir, "locks", `${digest}.json`);
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function acquireLock(filePath: string, loadedHash: string, staleMs = 24 * 60 * 60 * 1000): LockStatus {
  const lockPath = lockPathFor(filePath);
  if (existsSync(lockPath)) {
    try {
      const stat = statSync(lockPath);
      const data = JSON.parse(readFileSync(lockPath, "utf8"));
      const stale = Date.now() - stat.mtimeMs > staleMs || !pidAlive(Number(data.pid));
      if (!stale) {
        return { state: "active_lock", lockPath, message: `Another redline process (${data.pid}) appears to be reviewing this file.` };
      }
      rmSync(lockPath, { force: true });
      writeFileSync(lockPath, JSON.stringify(lockData(filePath, loadedHash), null, 2));
      return { state: "stale_recovered", lockPath, message: "Recovered stale redline lock." };
    } catch {
      rmSync(lockPath, { force: true });
    }
  }
  writeFileSync(lockPath, JSON.stringify(lockData(filePath, loadedHash), null, 2));
  return { state: "created", lockPath };
}

export function releaseLock(lockPath: string): void {
  rmSync(lockPath, { force: true });
}

function lockData(filePath: string, loadedHash: string) {
  return {
    pid: process.pid,
    hostname: hostname(),
    startedAt: new Date().toISOString(),
    filePath,
    loadedHash,
  };
}
