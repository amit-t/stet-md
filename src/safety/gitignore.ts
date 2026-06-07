import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Ensure `<root>/.gitignore` exists and ignores everything beneath it, so
 * backups and lock files cannot leak into a commit. Idempotent: an existing
 * file is left untouched.
 */
export function ensureGitignore(root: string): string {
  const path = join(root, ".gitignore");
  if (!existsSync(path)) {
    writeFileSync(path, "*\n", "utf8");
  }
  return path;
}
