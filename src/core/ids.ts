import { randomBytes } from "node:crypto";

/**
 * Thread IDs: `stt_<YYYYMMDD>_<HHMMSS>_<6 hex>` in UTC.
 * The timestamp is human-scannable; the random suffix guarantees uniqueness
 * within the same second.
 */

export function generateThreadId(now: Date = new Date()): string {
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  const date =
    `${now.getUTCFullYear()}${p(now.getUTCMonth() + 1)}${p(now.getUTCDate())}`;
  const time =
    `${p(now.getUTCHours())}${p(now.getUTCMinutes())}${p(now.getUTCSeconds())}`;
  const rand = randomBytes(3).toString("hex");
  return `stt_${date}_${time}_${rand}`;
}

const ID_RE = /^stt_\d{8}_\d{6}_[0-9a-f]{6}$/;

export function isThreadId(value: string): boolean {
  return ID_RE.test(value);
}

/** UTC ISO 8601 with seconds precision and a `Z` suffix. */
export function utcIso(now: Date = new Date()): string {
  return now.toISOString().replace(/\.\d{3}Z$/, "Z");
}
