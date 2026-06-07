import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync,
  readdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ensureStateDir, statePaths } from "../../src/safety/state.js";
import { ensureGitignore } from "../../src/safety/gitignore.js";
import { writeFileAtomic } from "../../src/safety/atomicWrite.js";
import { createBackup } from "../../src/safety/backups.js";
import { readAndHash, hasConflict } from "../../src/safety/conflict.js";
import {
  acquireLock,
  releaseLock,
  inspectLock,
} from "../../src/safety/locks.js";

let dir: string;
let file: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "stet-safety-"));
  file = join(dir, "doc.md");
  writeFileSync(file, "# Doc\n\nBody.\n", "utf8");
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("state dir + gitignore", () => {
  it("creates .stet/.gitignore containing '*'", () => {
    const p = ensureStateDir(file);
    expect(existsSync(p.root)).toBe(true);
    const gi = readFileSync(join(p.root, ".gitignore"), "utf8");
    expect(gi).toBe("*\n");
  });

  it("does not overwrite an existing .gitignore", () => {
    const p = statePaths(file);
    ensureStateDir(file);
    writeFileSync(join(p.root, ".gitignore"), "custom\n", "utf8");
    ensureGitignore(p.root);
    expect(readFileSync(join(p.root, ".gitignore"), "utf8")).toBe("custom\n");
  });
});

describe("atomic write", () => {
  it("replaces file content atomically and leaves no temp files", () => {
    writeFileAtomic(file, "new content\n");
    expect(readFileSync(file, "utf8")).toBe("new content\n");
    const leftovers = readdirSync(dir).filter((n) => n.startsWith(".stet-tmp-"));
    expect(leftovers).toEqual([]);
  });
});

describe("backups", () => {
  it("writes a timestamped backup with short hash under .stet/backups", () => {
    const content = readFileSync(file, "utf8");
    const now = new Date("2026-06-07T15:00:15Z");
    const path = createBackup(file, content, now);
    expect(path).toMatch(/\.stet\/backups\/doc\.md\.20260607T150015Z\.[0-9a-f]{12}\.bak$/);
    expect(readFileSync(path, "utf8")).toBe(content);
  });
});

describe("conflict detection", () => {
  it("detects no conflict when file is unchanged", () => {
    const loaded = readAndHash(file);
    expect(hasConflict(loaded.hash, loaded.content)).toBe(false);
  });

  it("detects a conflict when the file changed on disk", () => {
    const loaded = readAndHash(file);
    writeFileSync(file, "# Doc\n\nEdited externally.\n", "utf8");
    const current = readFileSync(file, "utf8");
    expect(hasConflict(loaded.hash, current)).toBe(true);
  });
});

describe("locks", () => {
  it("acquires a fresh lock", () => {
    const r = acquireLock(file, "sha256:abc", { pid: 4242, hostname: "h1" });
    expect(r.acquired).toBe(true);
    const info = inspectLock(file)!;
    expect(info.pid).toBe(4242);
    expect(info.loadedHash).toBe("sha256:abc");
    expect(info.targetFile.endsWith("doc.md")).toBe(true);
  });

  it("warns (conflict) on a second active instance", () => {
    acquireLock(file, "sha256:abc", {
      pid: 4242,
      hostname: "h1",
      isAlive: () => true,
    });
    const r = acquireLock(file, "sha256:abc", {
      pid: 9999,
      hostname: "h2",
      isAlive: () => true,
    });
    expect(r.acquired).toBe(false);
    if (!r.acquired) expect(r.conflict.pid).toBe(4242);
  });

  it("recovers a stale lock when the owning PID is gone", () => {
    acquireLock(file, "sha256:abc", {
      pid: 4242,
      hostname: "h1",
      isAlive: () => true,
    });
    const r = acquireLock(file, "sha256:def", {
      pid: 9999,
      hostname: "h2",
      isAlive: (pid) => pid === 9999, // 4242 is dead
    });
    expect(r.acquired).toBe(true);
    if (r.acquired) expect(r.recoveredStale?.pid).toBe(4242);
  });

  it("recovers a stale lock when mtime is older than the window", () => {
    acquireLock(file, "sha256:abc", {
      pid: 4242,
      hostname: "h1",
      isAlive: () => true,
    });
    // Zero staleness window forces the existing lock to read as stale.
    const r = acquireLock(file, "sha256:def", {
      pid: 9999,
      hostname: "h2",
      isAlive: () => true,
      staleMs: 0,
      now: new Date(Date.now() + 1000),
    });
    expect(r.acquired).toBe(true);
  });

  it("releases only a lock owned by this process", () => {
    acquireLock(file, "sha256:abc", { pid: 4242, hostname: "h1" });
    releaseLock(file, { pid: 1, hostname: "other" });
    expect(inspectLock(file)).toBeDefined(); // not removed
    releaseLock(file, { pid: 4242, hostname: "h1" });
    expect(inspectLock(file)).toBeUndefined();
  });
});
