import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { ensureGitignore } from "./gitignore.js";

/**
 * Resolve and create the `.redline/` state directory that holds backups and
 * locks. It lives alongside the reviewed file. A `.redline/.gitignore`
 * containing `*` is auto-created so transient state never enters git.
 */

export interface StatePaths {
  /** `<file dir>/.redline` */
  root: string;
  /** `<file dir>/.redline/backups` */
  backups: string;
  /** `<file dir>/.redline/locks` */
  locks: string;
}

export function statePaths(targetFile: string): StatePaths {
  const dir = dirname(resolve(targetFile));
  const root = join(dir, ".redline");
  return {
    root,
    backups: join(root, "backups"),
    locks: join(root, "locks"),
  };
}

/** Create `.redline/` (and its `.gitignore`) for a target file. */
export function ensureStateDir(targetFile: string): StatePaths {
  const paths = statePaths(targetFile);
  mkdirSync(paths.root, { recursive: true });
  ensureGitignore(paths.root);
  return paths;
}
