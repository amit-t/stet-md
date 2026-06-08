/**
 * Detect the byte-level shape of a Markdown file so saves can regenerate
 * inserted blocks in the file's own style without disturbing the rest.
 *
 * Stet.md operates on the file as a UTF-8 string. Node's UTF-8 decoder
 * preserves a leading BOM as U+FEFF and re-encodes every unchanged substring
 * to byte-identical UTF-8, so string-space splicing is byte-exact for valid
 * UTF-8 input. These helpers describe the conventions an inserted block must
 * follow to blend in.
 */

export type Eol = "\n" | "\r\n";

export interface FileFormat {
  /** Leading UTF-8 BOM present (U+FEFF at index 0). */
  hasBom: boolean;
  /** Dominant line ending in the file. Defaults to LF when ambiguous. */
  eol: Eol;
  /** File ends with a final newline. */
  hasFinalNewline: boolean;
}

export const BOM = "﻿";

export function detectFileFormat(text: string): FileFormat {
  const hasBom = text.charCodeAt(0) === 0xfeff;
  const crlf = (text.match(/\r\n/g) ?? []).length;
  // Bare LF = total LF minus the ones that are part of CRLF.
  const totalLf = (text.match(/\n/g) ?? []).length;
  const bareLf = totalLf - crlf;
  const eol: Eol = crlf > bareLf ? "\r\n" : "\n";
  const hasFinalNewline = text.length > 0 && /\n$/.test(text);
  return { hasBom, eol, hasFinalNewline };
}

/** Re-encode a block authored with `\n` to the file's EOL convention. */
export function applyEol(block: string, eol: Eol): string {
  if (eol === "\n") return block.replace(/\r\n/g, "\n");
  // Normalize to LF first to avoid producing `\r\r\n`.
  return block.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n");
}
