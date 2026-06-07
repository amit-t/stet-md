import {
  closeSync,
  fsyncSync,
  openSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";

/**
 * Atomic file replacement: write to a temp file in the SAME directory (so the
 * rename stays on one filesystem), fsync it, then rename over the target. A
 * crash mid-write leaves either the old file or the temp file, never a
 * truncated target.
 */
export function writeFileAtomic(targetPath: string, content: string): void {
  const dir = dirname(targetPath);
  const tmp = join(dir, `.redline-tmp-${randomBytes(6).toString("hex")}`);

  // Preserve the original file mode when it exists.
  let mode = 0o644;
  try {
    mode = statSync(targetPath).mode;
  } catch {
    /* new file: keep default mode */
  }

  const buf = Buffer.from(content, "utf8");
  const fd = openSync(tmp, "w", mode);
  try {
    writeSync(fd, buf, 0, buf.length, 0);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  try {
    renameSync(tmp, targetPath);
  } catch (err) {
    // Best-effort cleanup of the temp file on failure.
    try {
      unlinkSync(tmp);
    } catch {
      /* ignore */
    }
    throw err;
  }
}
