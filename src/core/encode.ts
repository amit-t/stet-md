/**
 * Comment-body escaping for the structured `stet:thread` marker.
 *
 * The marker body lives inside an HTML comment (`<!-- ... -->`). A literal
 * `-->` in a message body would close the comment early, and per the HTML
 * spec a comment should not contain `--` at all. We therefore encode message
 * bodies so the encoded form can never contain a `--` sequence, while the
 * decode is a lossless inverse.
 *
 * Scheme (single escape introducer `\`):
 *   encode: double every backslash, then insert a backslash after any dash
 *           that is immediately followed by another dash. This breaks every
 *           run of dashes so no `--` survives.
 *   decode: remove backslashes that sit between two dashes (the inserted
 *           escapes), then collapse doubled backslashes.
 *
 * The inserted escape is always positioned as `-\-` (dash, backslash,
 * lookahead-dash), which is distinguishable from a literal `\\` produced by
 * the doubling step, so the two phases never collide.
 */

export function encodeCommentBody(body: string): string {
  return body
    .replace(/\\/g, "\\\\") // 1. literal backslashes -> doubled
    .replace(/-(?=-)/g, "-\\"); // 2. break dash-runs: insert escape after a dash that precedes a dash
}

export function decodeCommentBody(encoded: string): string {
  return encoded
    .replace(/-\\(?=-)/g, "-") // reverse step 2: drop the inserted escape between dashes
    .replace(/\\\\/g, "\\"); // reverse step 1: collapse doubled backslashes
}
