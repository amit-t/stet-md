import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { ensureGitignore } from "./gitignore.js";

/**
 * Resolve and create the `.stet/` state directory that holds backups and
 * locks. It lives alongside the reviewed file. A `.stet/.gitignore`
 * containing `*` is auto-created so transient state never enters git.
 */

export interface StatePaths {
  /** `<file dir>/.stet` */
  root: string;
  /** `<file dir>/.stet/backups` */
  backups: string;
  /** `<file dir>/.stet/locks` */
  locks: string;
}

export function statePaths(targetFile: string): StatePaths {
  const dir = dirname(resolve(targetFile));
  const root = join(dir, ".stet");
  return {
    root,
    backups: join(root, "backups"),
    locks: join(root, "locks"),
  };
}

/** Create `.stet/` (and its `.gitignore`) for a target file. */
export function ensureStateDir(targetFile: string): StatePaths {
  const paths = statePaths(targetFile);
  mkdirSync(paths.root, { recursive: true });
  ensureGitignore(paths.root);
  return paths;
}
