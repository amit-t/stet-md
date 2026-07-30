import { basename, dirname, join } from "node:path";
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import type { DocumentFrontmatter, RenderedBlock, ReviewDocument, ReviewParseError, ReviewTarget, ReviewThread, ReviewWarning, RawThreadBlock, SaveOptions } from "./types.js";
import { createThreadId, hashBuffer, sourceHash } from "./hash.js";
import { escapeHtml, stripMarkdownInline } from "./escape.js";
import { isHorizontalRule, normalizeLinkLabel, renderCodeBlock, renderInline, renderList, renderTable, slugify, type LinkDefinitions } from "./render.js";
import { parseMarkerBody, renderThreadBlock } from "./threadFormat.js";
import { isoNow } from "./time.js";
import { StetConflictError, StetNotFoundError, StetParseError } from "./errors.js";

const THREAD_RE = /<!-- (?:stet|redline):thread\r?\n([\s\S]*?)-->\r?\n?([\s\S]*?)<!-- \/(?:stet|redline):thread -->\r?\n?/g;

/** A frontmatter delimiter line: exactly `---`, trailing spaces tolerated. */
const FRONTMATTER_DELIMITER = /^---[ \t]*$/;

/** A flat `key: value` frontmatter entry, the shape rendered as a table. */
const FRONTMATTER_FIELD = /^([A-Za-z0-9_][A-Za-z0-9_.-]*):[ \t]+(\S.*?)[ \t]*$/;

type Line = {
  index: number;
  raw: string;
  content: string;
  eol: "\n" | "\r\n" | "";
  start: number;
  contentEnd: number;
  end: number;
};

type ThreadScan = {
  threads: ReviewThread[];
  rawThreadBlocks: RawThreadBlock[];
  errors: ReviewParseError[];
  warnings: ReviewWarning[];
  ranges: { start: number; end: number }[];
};

type MarkdownParse = {
  targets: ReviewTarget[];
  blocks: RenderedBlock[];
  html: string;
  warnings: ReviewWarning[];
};

export type LoadOptions = {
  allowMalformed?: boolean;
};

function detectLineEnding(text: string): "\n" | "\r\n" {
  const crlf = (text.match(/\r\n/g) ?? []).length;
  const lf = (text.match(/(?<!\r)\n/g) ?? []).length;
  return crlf > lf ? "\r\n" : "\n";
}

function splitLines(text: string): Line[] {
  const lines: Line[] = [];
  let charStart = 0;
  let byteStart = 0;
  let index = 0;
  while (charStart < text.length) {
    const nl = text.indexOf("\n", charStart);
    const charEnd = nl === -1 ? text.length : nl + 1;
    const raw = text.slice(charStart, charEnd);
    const eol = raw.endsWith("\r\n") ? "\r\n" : raw.endsWith("\n") ? "\n" : "";
    const content = raw.slice(0, raw.length - eol.length);
    const rawBytes = Buffer.byteLength(raw, "utf8");
    const contentBytes = Buffer.byteLength(content, "utf8");
    lines.push({ index, raw, content, eol, start: byteStart, contentEnd: byteStart + contentBytes, end: byteStart + rawBytes });
    charStart = charEnd;
    byteStart += rawBytes;
    index += 1;
  }
  if (text.length === 0) {
    lines.push({ index: 0, raw: "", content: "", eol: "", start: 0, contentEnd: 0, end: 0 });
  }
  return lines;
}

function byteOffset(text: string, charIndex: number): number {
  return Buffer.byteLength(text.slice(0, charIndex), "utf8");
}

function lineNumberForByte(lines: Line[], offset: number): number {
  const found = lines.find((line) => offset >= line.start && offset <= line.end);
  return found ? found.index + 1 : lines.length;
}

function lineText(line: Line): string {
  return line.index === 0 ? line.content.replace(/^\uFEFF/, "") : line.content;
}

function isBlank(line: Line): boolean {
  return lineText(line).trim() === "";
}

function isRangeStartInside(ranges: { start: number; end: number }[], line: Line): boolean {
  return ranges.some((range) => line.start >= range.start && line.start < range.end);
}

function scanThreadBlocks(text: string, lines: Line[], lineEnding: "\n" | "\r\n", ignoredRanges: { start: number; end: number }[] = []): ThreadScan {
  const threads: ReviewThread[] = [];
  const rawThreadBlocks: RawThreadBlock[] = [];
  const errors: ReviewParseError[] = [];
  const warnings: ReviewWarning[] = [];
  const ranges: { start: number; end: number }[] = [];
  let match: RegExpExecArray | null;
  THREAD_RE.lastIndex = 0;
  while ((match = THREAD_RE.exec(text)) !== null) {
    const raw = match[0];
    const start = byteOffset(text, match.index);
    const end = start + Buffer.byteLength(raw, "utf8");
    if (ignoredRanges.some((range) => start >= range.start && start < range.end)) continue;
    const lineStart = lineNumberForByte(lines, start);
    const lineEnd = lineNumberForByte(lines, end);
    ranges.push({ start, end });
    rawThreadBlocks.push({ raw, range: { start, end }, lineStart, lineEnd });
    try {
      const parsed = parseMarkerBody(match[1]);
      const thread: ReviewThread = { ...parsed.thread, range: { start, end }, lineStart, lineEnd };
      threads.push(thread);
      rawThreadBlocks[rawThreadBlocks.length - 1].id = thread.id;
      const expected = renderThreadBlock(thread, lineEnding);
      if (normalizeForCompare(expected) !== normalizeForCompare(raw.trimEnd())) {
        warnings.push({ kind: "divergent_generated_blockquote", threadId: thread.id, message: `Generated blockquote for ${thread.id} differs from structured marker and will be regenerated on save.` });
      }
    } catch (error) {
      const id = /id:\s*([^\s]+)/.exec(match[1])?.[1];
      errors.push({
        kind: "malformed_marker",
        message: error instanceof Error ? error.message : String(error),
        threadId: id,
        range: { start, end },
        lineStart,
        lineEnd,
        raw,
      });
    }
  }
  return { threads, rawThreadBlocks, errors, warnings, ranges };
}

function normalizeForCompare(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/[\t ]+$/gm, "").trimEnd();
}

function headingMatch(line: Line): RegExpMatchArray | null {
  return lineText(line).match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
}

function isFence(line: Line): RegExpMatchArray | null {
  return lineText(line).match(/^(```+|~~~+)/);
}

function isList(line: Line): boolean {
  return /^\s{0,3}(?:[-+*]|\d+[.)])\s+/.test(lineText(line));
}

function isBlockquote(line: Line): boolean {
  return /^\s{0,3}>/.test(lineText(line));
}

function isTable(line: Line): boolean {
  return /^\s*\|.*\|\s*$/.test(lineText(line));
}

/** Parse a link reference definition line: `[label]: url "title"`. */
function linkDefinitionMatch(text: string): { label: string; href: string } | null {
  const match = text.match(/^\s{0,3}\[([^\]]+)\]:\s+(.+)$/);
  if (!match) return null;
  const rest = match[2].trim();
  let href: string;
  if (rest.startsWith("<")) {
    const close = rest.indexOf(">");
    if (close === -1) return null;
    href = rest.slice(1, close);
  } else {
    href = rest.split(/\s+/)[0] ?? "";
  }
  return href ? { label: match[1], href } : null;
}

function detailsOpenMatch(line: Line): RegExpMatchArray | null {
  return lineText(line).trim().match(/^<details(?:\s+(open))?\s*>$/i);
}

function isDetailsClose(line: Line): boolean {
  return /^<\/details\s*>$/i.test(lineText(line).trim());
}

function summaryMatch(line: Line): RegExpMatchArray | null {
  return lineText(line).trim().match(/^<summary\s*>([\s\S]*)<\/summary\s*>$/i);
}

function findDetailsEnd(lines: Line[], start: number): number | undefined {
  let depth = 0;
  for (let index = start; index < lines.length; index += 1) {
    if (detailsOpenMatch(lines[index])) depth += 1;
    if (isDetailsClose(lines[index])) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return undefined;
}

function collectText(lines: Line[], start: number, endInclusive: number): string {
  return lines.slice(start, endInclusive + 1).map((line) => lineText(line)).join("\n").replace(/\n+$/g, "");
}

function targetId(kind: string, ordinal: number): string {
  return `t_${kind}_${ordinal}`;
}

function makeTarget(kind: "heading" | "paragraph", headingPath: string[], blockOrdinal: number, quote: string, source: string, startLine: Line, endLine: Line, globalOrdinal: number): ReviewTarget {
  return {
    id: targetId(kind, globalOrdinal),
    kind,
    headingPath: [...headingPath],
    blockOrdinal,
    sourceHash: sourceHash(source),
    quote,
    byteRange: { start: startLine.start, end: endLine.end },
    lineStart: startLine.index + 1,
    lineEnd: endLine.index + 1,
  };
}

function rawHtmlWarning(warnings: ReviewWarning[]): void {
  warnings.push({ kind: "unsafe_html_escaped", message: "Raw Markdown HTML was escaped." });
}

/** Render blockquote inner lines as paragraphs, matching browser output. */
function renderBlockquoteBody(parts: string[], warnings: ReviewWarning[], defs: LinkDefinitions): string {
  const paragraphs: string[] = [];
  let buffer: string[] = [];
  const flush = (): void => {
    if (buffer.length === 0) return;
    paragraphs.push(`<p>${renderInline(buffer.join(" "), warnings, defs)}</p>`);
    buffer = [];
  };
  for (const part of parts) {
    if (part.trim() === "") flush();
    else buffer.push(part);
  }
  flush();
  return paragraphs.join("");
}

// An actual HTML tag — not a Markdown autolink like <https://example.com> or a
// bare comparison such as `a < b`.
const RAW_HTML_TAG = /<\/?[a-zA-Z][a-zA-Z0-9-]*(?:\s[^>]*)?\/?>/;

function containsUnsafeInlineHtml(text: string): boolean {
  const withoutAllowedTags = text.replace(/<\/?(?:strong|em|code|kbd|s|sup|sub)\s*>/gi, "").replace(/<br\s*\/?>/gi, "");
  return RAW_HTML_TAG.test(withoutAllowedTags);
}

function renderInlineWithSafeHtml(text: string, warnings: ReviewWarning[], defs: LinkDefinitions): string {
  if (containsUnsafeInlineHtml(text)) rawHtmlWarning(warnings);
  return renderInline(text, warnings, defs)
    .replace(/&lt;(\/?(?:strong|em|code|kbd|s|sup|sub))&gt;/gi, "<$1>")
    .replace(/&lt;br\s*\/?&gt;/gi, "<br>");
}

function renderDetailsBlock(lines: Line[], start: number, end: number, warnings: ReviewWarning[], defs: LinkDefinitions): string {
  const open = detailsOpenMatch(lines[start])?.[1] ? " open" : "";
  let index = start + 1;
  while (index < end && isBlank(lines[index])) index += 1;

  const summary = index < end ? summaryMatch(lines[index]) : null;
  const summaryHtml = summary ? `<summary>${renderInlineWithSafeHtml(summary[1], warnings, defs)}</summary>` : "";
  if (summary) index += 1;

  const inner = renderMarkdownFragment(lines, index, end - 1, warnings, defs);
  return [`<details${open}>`, summaryHtml, inner, "</details>"].filter(Boolean).join("\n");
}

function renderMarkdownFragment(lines: Line[], startIndex: number, endIndex: number, warnings: ReviewWarning[], defs: LinkDefinitions): string {
  const html: string[] = [];
  let i = startIndex;
  while (i <= endIndex) {
    const line = lines[i];
    if (isBlank(line) || linkDefinitionMatch(lineText(line))) {
      i += 1;
      continue;
    }

    if (detailsOpenMatch(line)) {
      const nestedDetailsEnd = findDetailsEnd(lines, i);
      if (nestedDetailsEnd !== undefined && nestedDetailsEnd <= endIndex) {
        html.push(renderDetailsBlock(lines, i, nestedDetailsEnd, warnings, defs));
        i = nestedDetailsEnd + 1;
        continue;
      }
      rawHtmlWarning(warnings);
      html.push(`<p>${renderInline(lineText(line), warnings, defs)}</p>`);
      i += 1;
      continue;
    }

    const heading = headingMatch(line);
    if (heading) {
      const level = heading[1].length;
      const title = stripMarkdownInline(heading[2]);
      html.push(`<h${level} id="${slugify(title)}">${renderInline(title, warnings, defs)}</h${level}>`);
      i += 1;
      continue;
    }

    const fence = isFence(line);
    if (fence) {
      const codeStart = i;
      const lang = lineText(line).slice(fence[0].length).trim();
      i += 1;
      while (i <= endIndex && !lineText(lines[i]).startsWith(fence[1])) i += 1;
      const codeEnd = Math.min(i, endIndex);
      const codeLines = lines.slice(codeStart + 1, Math.max(codeStart + 1, codeEnd)).map((candidate) => candidate.content).join("\n");
      html.push(renderCodeBlock(codeLines, lang));
      i = codeEnd + 1;
      continue;
    }

    if (isList(line)) {
      const rawLines: string[] = [];
      while (i <= endIndex && (isList(lines[i]) || (lineText(lines[i]).startsWith("  ") && !isBlank(lines[i]) && !detailsOpenMatch(lines[i])))) {
        rawLines.push(lineText(lines[i]));
        i += 1;
      }
      html.push(renderList(rawLines, warnings, defs));
      continue;
    }

    if (isBlockquote(line)) {
      const parts: string[] = [];
      while (i <= endIndex && isBlockquote(lines[i])) {
        parts.push(lineText(lines[i]).replace(/^\s{0,3}>\s?/, ""));
        i += 1;
      }
      html.push(`<blockquote>${renderBlockquoteBody(parts, warnings, defs)}</blockquote>`);
      continue;
    }

    if (isTable(line)) {
      const tableStart = i;
      while (i <= endIndex && isTable(lines[i])) i += 1;
      const tableLines = lines.slice(tableStart, i).map((candidate) => lineText(candidate));
      html.push(renderTable(tableLines, warnings, defs));
      continue;
    }

    if (isHorizontalRule(lineText(line))) {
      html.push("<hr>");
      i += 1;
      continue;
    }

    const paragraphStart = i;
    while (
      i <= endIndex &&
      !isBlank(lines[i]) &&
      !headingMatch(lines[i]) &&
      !isFence(lines[i]) &&
      !isList(lines[i]) &&
      !isBlockquote(lines[i]) &&
      !isTable(lines[i]) &&
      !isHorizontalRule(lineText(lines[i])) &&
      !linkDefinitionMatch(lineText(lines[i])) &&
      !detailsOpenMatch(lines[i])
    ) {
      i += 1;
    }
    const paragraphSource = collectText(lines, paragraphStart, i - 1);
    if (RAW_HTML_TAG.test(paragraphSource)) rawHtmlWarning(warnings);
    html.push(`<p>${renderInline(paragraphSource.replace(/\n/g, " "), warnings, defs)}</p>`);
  }
  return html.join("\n");
}

/**
 * Detect leading YAML frontmatter: a `---` line at the very top of the file
 * closed by a later `---` line. Anything else — no opening delimiter, or an
 * opening delimiter that is never closed — is not frontmatter and keeps
 * rendering as an ordinary thematic break plus body text.
 */
function detectFrontmatter(lines: Line[]): DocumentFrontmatter | undefined {
  if (lines.length < 2 || !FRONTMATTER_DELIMITER.test(lineText(lines[0]))) return undefined;
  const close = lines.findIndex((line, index) => index > 0 && FRONTMATTER_DELIMITER.test(lineText(line)));
  if (close === -1) return undefined;
  return {
    raw: lines.slice(1, close).map((line) => lineText(line)).join("\n"),
    range: { start: lines[0].start, end: lines[close].end },
    lineStart: 1,
    lineEnd: close + 1,
  };
}

/** Strip one layer of matching YAML quotes from a scalar, when unambiguous. */
function unquoteScalar(value: string): string {
  const quote = value[0];
  if ((quote !== '"' && quote !== "'") || value.length < 2 || !value.endsWith(quote)) return value;
  const inner = value.slice(1, -1);
  return inner.includes(quote) ? value : inner;
}

/**
 * Flat `key: value` entries, or undefined when the block nests / uses any other
 * YAML construct — in which case the raw source is shown instead of a table.
 */
function frontmatterFields(raw: string): { key: string; value: string }[] | undefined {
  const fields: { key: string; value: string }[] = [];
  for (const line of raw.split("\n")) {
    if (line.trim() === "") continue;
    const match = FRONTMATTER_FIELD.exec(line);
    if (!match) return undefined;
    fields.push({ key: match[1], value: unquoteScalar(match[2]) });
  }
  return fields.length > 0 ? fields : undefined;
}

/**
 * GitHub-style collapsed metadata block. Every key and value is HTML-escaped —
 * frontmatter is data, never a raw-HTML passthrough — and nested YAML falls
 * back to a highlighted code block so nothing is lost.
 */
function renderFrontmatterBlock(frontmatter: DocumentFrontmatter): string {
  const fields = frontmatterFields(frontmatter.raw);
  const body = fields
    ? `<table><thead><tr><th>Field</th><th>Value</th></tr></thead><tbody>${fields
        .map((field) => `<tr><td>${escapeHtml(field.key)}</td><td>${escapeHtml(field.value)}</td></tr>`)
        .join("")}</tbody></table>`
    : renderCodeBlock(frontmatter.raw, "yaml");
  return ['<details class="stet-frontmatter">', "<summary>Frontmatter</summary>", body, "</details>"].join("\n");
}

function fencedCodeRanges(lines: Line[], startIndex = 0): { start: number; end: number }[] {
  const ranges: { start: number; end: number }[] = [];
  let index = startIndex;
  while (index < lines.length) {
    const fence = isFence(lines[index]);
    if (!fence) {
      index += 1;
      continue;
    }
    const start = lines[index].start;
    index += 1;
    while (index < lines.length && !lineText(lines[index]).startsWith(fence[1])) index += 1;
    const endLine = lines[Math.min(index, lines.length - 1)];
    ranges.push({ start, end: endLine.end });
    index += 1;
  }
  return ranges;
}

function parseMarkdown(text: string, lines: Line[], threadRanges: { start: number; end: number }[], fileHashValue: string, frontmatter?: DocumentFrontmatter): MarkdownParse {
  const targets: ReviewTarget[] = [{
    id: "document",
    kind: "document",
    headingPath: [],
    blockOrdinal: 0,
    sourceHash: fileHashValue,
    quote: "Document",
    byteRange: { start: 0, end: 0 },
    lineStart: 1,
    lineEnd: 1,
  }];
  const blocks: RenderedBlock[] = [];
  const warnings: ReviewWarning[] = [];
  const headingStack: string[] = [];
  const ordinals = new Map<string, number>();

  // Frontmatter is metadata, not prose: it renders as a collapsed block and is
  // never a comment target, so body parsing starts after it.
  const bodyStart = frontmatter ? frontmatter.lineEnd : 0;
  if (frontmatter) {
    blocks.push({
      type: "details",
      html: renderFrontmatterBlock(frontmatter),
      range: frontmatter.range,
      lineStart: frontmatter.lineStart,
      lineEnd: frontmatter.lineEnd,
    });
  }

  // Collect link reference definitions (outside code/thread blocks) so reference
  // links resolve and the definition lines themselves are hidden, as in a browser.
  const linkDefs: LinkDefinitions = new Map();
  const defLines = new Set<number>();
  const codeRanges = fencedCodeRanges(lines, bodyStart);
  for (let k = bodyStart; k < lines.length; k += 1) {
    const candidate = lines[k];
    if (isRangeStartInside(threadRanges, candidate) || isRangeStartInside(codeRanges, candidate)) continue;
    const def = linkDefinitionMatch(lineText(candidate));
    if (def) {
      linkDefs.set(normalizeLinkLabel(def.label), { href: escapeHtml(def.href) });
      defLines.add(k);
    }
  }

  let globalOrdinal = 0;
  let i = bodyStart;
  while (i < lines.length) {
    const line = lines[i];
    if (isRangeStartInside(threadRanges, line) || isBlank(line) || defLines.has(i)) {
      i += 1;
      continue;
    }

    const heading = headingMatch(line);
    if (heading) {
      const level = heading[1].length;
      const title = stripMarkdownInline(heading[2]);
      headingStack.splice(level - 1);
      headingStack[level - 1] = title;
      const path = headingStack.filter(Boolean);
      const key = `heading:${path.slice(0, -1).join("/")}`;
      const ordinal = ordinals.get(key) ?? 0;
      ordinals.set(key, ordinal + 1);
      const target = makeTarget("heading", path, ordinal, title, lineText(line), line, line, globalOrdinal++);
      targets.push(target);
      blocks.push({
        type: "heading",
        html: `<h${level} id="${slugify(title)}" data-stet-target="${target.id}" tabindex="0">${renderInline(title, warnings, linkDefs)}</h${level}>`,
        range: target.byteRange!,
        lineStart: target.lineStart!,
        lineEnd: target.lineEnd!,
        targetId: target.id,
      });
      i += 1;
      continue;
    }

    const fence = isFence(line);
    if (fence) {
      const start = i;
      const lang = lineText(line).slice(fence[0].length).trim();
      i += 1;
      while (i < lines.length && !lineText(lines[i]).startsWith(fence[1])) i += 1;
      if (i < lines.length) i += 1;
      const end = i - 1;
      const codeLines = lines.slice(start + 1, Math.max(start + 1, end)).map((candidate) => candidate.content).join("\n");
      blocks.push({ type: "code", html: renderCodeBlock(codeLines, lang), range: { start: lines[start].start, end: lines[end].end }, lineStart: start + 1, lineEnd: end + 1 });
      continue;
    }

    const detailsEnd = detailsOpenMatch(line) ? findDetailsEnd(lines, i) : undefined;
    if (detailsEnd !== undefined) {
      const start = i;
      const end = detailsEnd;
      blocks.push({
        type: "details",
        html: renderDetailsBlock(lines, start, end, warnings, linkDefs),
        range: { start: lines[start].start, end: lines[end].end },
        lineStart: start + 1,
        lineEnd: end + 1,
      });
      i = end + 1;
      continue;
    }

    if (isList(line)) {
      const start = i;
      const rawLines: string[] = [];
      while (i < lines.length && (isList(lines[i]) || (lineText(lines[i]).startsWith("  ") && !isBlank(lines[i])))) {
        if (isRangeStartInside(threadRanges, lines[i])) break;
        rawLines.push(lineText(lines[i]));
        i += 1;
      }
      const end = i - 1;
      blocks.push({ type: "list", html: renderList(rawLines, warnings, linkDefs), range: { start: lines[start].start, end: lines[end].end }, lineStart: start + 1, lineEnd: end + 1 });
      continue;
    }

    if (isBlockquote(line)) {
      const start = i;
      const parts: string[] = [];
      while (i < lines.length && isBlockquote(lines[i])) {
        parts.push(lineText(lines[i]).replace(/^\s{0,3}>\s?/, ""));
        i += 1;
      }
      const end = i - 1;
      blocks.push({ type: "blockquote", html: `<blockquote>${renderBlockquoteBody(parts, warnings, linkDefs)}</blockquote>`, range: { start: lines[start].start, end: lines[end].end }, lineStart: start + 1, lineEnd: end + 1 });
      continue;
    }

    if (isTable(line)) {
      const start = i;
      while (i < lines.length && isTable(lines[i])) i += 1;
      const end = i - 1;
      const tableLines = lines.slice(start, end + 1).map((candidate) => lineText(candidate));
      blocks.push({ type: "code", html: renderTable(tableLines, warnings, linkDefs), range: { start: lines[start].start, end: lines[end].end }, lineStart: start + 1, lineEnd: end + 1 });
      continue;
    }

    if (isHorizontalRule(lineText(line))) {
      blocks.push({ type: "code", html: "<hr>", range: { start: line.start, end: line.end }, lineStart: i + 1, lineEnd: i + 1 });
      i += 1;
      continue;
    }

    const start = i;
    while (i < lines.length && !isBlank(lines[i]) && !headingMatch(lines[i]) && !isFence(lines[i]) && !isList(lines[i]) && !isBlockquote(lines[i]) && !isTable(lines[i]) && !isHorizontalRule(lineText(lines[i])) && !defLines.has(i) && !isRangeStartInside(threadRanges, lines[i])) {
      i += 1;
    }
    const end = i - 1;
    const paragraphSource = collectText(lines, start, end);
    if (RAW_HTML_TAG.test(paragraphSource)) rawHtmlWarning(warnings);
    const path = headingStack.filter(Boolean);
    const key = `paragraph:${path.join("/")}`;
    const ordinal = ordinals.get(key) ?? 0;
    ordinals.set(key, ordinal + 1);
    const quote = stripMarkdownInline(paragraphSource).slice(0, 240) || "Paragraph";
    const target = makeTarget("paragraph", path, ordinal, quote, paragraphSource, lines[start], lines[end], globalOrdinal++);
    targets.push(target);
    blocks.push({
      type: "paragraph",
      html: `<p data-stet-target="${target.id}" tabindex="0">${renderInline(paragraphSource.replace(/\n/g, " "), warnings, linkDefs)}</p>`,
      range: target.byteRange!,
      lineStart: target.lineStart!,
      lineEnd: target.lineEnd!,
      targetId: target.id,
    });
  }
  return { targets, blocks, html: blocks.map((block) => block.html).join("\n"), warnings };
}

function hasRenderedRange(target: ReviewTarget): target is ReviewTarget & { id: string; byteRange: { start: number; end: number }; lineStart: number; lineEnd: number } {
  return typeof target.id === "string" && target.byteRange !== undefined && target.lineStart !== undefined && target.lineEnd !== undefined;
}

function attachThreads(threads: ReviewThread[], targets: ReviewTarget[], warnings: ReviewWarning[]): void {
  for (const thread of threads) {
    const adjacent = targets
      .filter((target): target is ReviewTarget & { id: string; byteRange: { start: number; end: number }; lineStart: number; lineEnd: number } =>
        target.kind !== "document" && thread.range !== undefined && hasRenderedRange(target) && Math.abs(target.byteRange.end - thread.range.start) <= 2,
      )
      .sort((a, b) => b.byteRange.end - a.byteRange.end)[0];
    if (adjacent) {
      if (adjacent.sourceHash === thread.target.sourceHash) {
        thread.anchor = { state: "attached", targetId: adjacent.id };
      } else {
        thread.anchor = { state: "content_drifted", targetId: adjacent.id, message: "content drifted" };
        warnings.push({ kind: "content_drifted", threadId: thread.id, message: `Thread ${thread.id} remains adjacent but target content drifted.` });
      }
      continue;
    }
    const exact = targets.find((target) => target.sourceHash === thread.target.sourceHash && target.kind === thread.target.kind);
    if (exact) {
      thread.anchor = { state: "attached", targetId: exact.id, message: "reattached by source hash" };
      continue;
    }
    if (thread.target.kind === "document") {
      thread.anchor = { state: "attached", targetId: "document" };
      continue;
    }
    thread.anchor = { state: "orphan", message: "Needs re-attach" };
    warnings.push({ kind: "orphaned_thread", threadId: thread.id, message: `Thread ${thread.id} could not be attached and is shown in Needs re-attach.` });
  }
}

export function loadReviewDocument(filePath: string, _options: LoadOptions = {}): ReviewDocument {
  if (!existsSync(filePath)) throw new StetNotFoundError(`Markdown file not found: ${filePath}`);
  const buffer = readFileSync(filePath);
  const text = buffer.toString("utf8");
  const lineEnding = detectLineEnding(text);
  const lines = splitLines(text);
  const fileHash = hashBuffer(buffer);
  const frontmatter = detectFrontmatter(lines);
  const ignoredRanges = fencedCodeRanges(lines, frontmatter ? frontmatter.lineEnd : 0);
  if (frontmatter) ignoredRanges.unshift(frontmatter.range);
  const scan = scanThreadBlocks(text, lines, lineEnding, ignoredRanges);
  const markdown = parseMarkdown(text, lines, scan.ranges, fileHash, frontmatter);
  const warnings = [...scan.warnings, ...markdown.warnings];
  attachThreads(scan.threads, markdown.targets, warnings);
  return {
    filePath,
    fileName: basename(filePath),
    fileHash,
    lineEnding,
    hasBom: buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf,
    finalNewline: text.endsWith("\n"),
    html: markdown.html,
    frontmatter,
    targets: markdown.targets,
    threads: scan.threads,
    rawThreadBlocks: scan.rawThreadBlocks,
    warnings,
    errors: scan.errors,
    blocks: markdown.blocks,
  };
}

function cloneThread(thread: ReviewThread): ReviewThread {
  return JSON.parse(JSON.stringify(thread)) as ReviewThread;
}

export function createThreadForTarget(target: ReviewTarget, author: string, bodyMarkdown: string, now = new Date()): ReviewThread {
  const stamp = isoNow(now);
  return {
    version: 1,
    id: createThreadId(now),
    target: cloneTarget(target),
    status: "open",
    createdAt: stamp,
    updatedAt: stamp,
    messages: [{ author, createdAt: stamp, bodyMarkdown }],
  };
}

function cloneTarget(target: ReviewTarget): ReviewTarget {
  return JSON.parse(JSON.stringify(target)) as ReviewTarget;
}

type Splice = { start: number; end: number; bytes: Buffer };

function findInsertionTarget(doc: ReviewDocument, thread: ReviewThread): ReviewTarget | undefined {
  if (thread.target.kind === "document") return doc.targets.find((target) => target.kind === "document");
  return doc.targets.find((target) => target.sourceHash === thread.target.sourceHash && target.kind === thread.target.kind)
    ?? doc.targets.find((target) => target.kind === thread.target.kind && target.blockOrdinal === thread.target.blockOrdinal && target.headingPath.join("\u0000") === thread.target.headingPath.join("\u0000"));
}

function insertionBytes(buffer: Buffer, insertAt: number, block: string, lineEnding: "\n" | "\r\n", originalFinalNewline: boolean): Buffer {
  const previous = insertAt > 0 ? buffer[insertAt - 1] : undefined;
  const beforeHasNewline = insertAt === 0 || previous === 10;
  const afterExists = insertAt < buffer.length;
  let text = `${beforeHasNewline ? "" : lineEnding}${block}`;
  if (afterExists || originalFinalNewline) text += lineEnding;
  return Buffer.from(text, "utf8");
}

function applySplices(buffer: Buffer, splices: Splice[]): Buffer {
  const sorted = [...splices].sort((a, b) => b.start - a.start);
  let output = buffer;
  for (const splice of sorted) {
    output = Buffer.concat([output.subarray(0, splice.start), splice.bytes, output.subarray(splice.end)]);
  }
  return output;
}

function ensureStateDir(filePath: string): string {
  const stateDir = join(dirname(filePath), ".stet");
  mkdirSync(stateDir, { recursive: true });
  const gitignore = join(stateDir, ".gitignore");
  if (!existsSync(gitignore)) writeFileSync(gitignore, "*\n");
  mkdirSync(join(stateDir, "backups"), { recursive: true });
  mkdirSync(join(stateDir, "locks"), { recursive: true });
  return stateDir;
}

function writeAtomicWithBackup(filePath: string, before: Buffer, after: Buffer, createBackup: boolean): void {
  const stateDir = ensureStateDir(filePath);
  if (createBackup) {
    const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
    const shortHash = hashBuffer(before).slice("sha256:".length, "sha256:".length + 12);
    const backupPath = join(stateDir, "backups", `${basename(filePath)}.${timestamp}.${shortHash}.bak`);
    copyFileSync(filePath, backupPath);
  }
  const tempPath = join(dirname(filePath), `.${basename(filePath)}.stet-${process.pid}-${Date.now()}.tmp`);
  writeFileSync(tempPath, after);
  renameSync(tempPath, filePath);
}

export function saveReviewThreads(filePath: string, updates: ReviewThread[], options: SaveOptions = {}): ReviewDocument {
  const before = readFileSync(filePath);
  const currentHash = hashBuffer(before);
  if (options.expectedHash && options.expectedHash !== currentHash) {
    throw new StetConflictError();
  }
  const doc = loadReviewDocument(filePath);
  if (doc.errors.length > 0) {
    throw new StetParseError(`Cannot save while ${doc.errors.length} malformed stet marker(s) exist.`);
  }
  const existingById = new Map(doc.threads.map((thread) => [thread.id, thread]));
  const splices: Splice[] = [];
  const inserts = new Map<number, ReviewThread[]>();

  for (const update of updates.map(cloneThread)) {
    update.updatedAt = update.updatedAt || isoNow(options.now ?? new Date());
    const existing = existingById.get(update.id);
    const block = renderThreadBlock(update, doc.lineEnding);
    if (existing?.range) {
      const existingRaw = before.subarray(existing.range.start, existing.range.end).toString("utf8");
      const replacement = Buffer.from(block + (existingRaw.endsWith("\n") ? doc.lineEnding : ""), "utf8");
      splices.push({ start: existing.range.start, end: existing.range.end, bytes: replacement });
      continue;
    }
    const target = findInsertionTarget(doc, update);
    if (!target || (target.kind !== "document" && !hasRenderedRange(target))) throw new StetNotFoundError(`Cannot find target for thread ${update.id}`);
    const insertAt = target.kind === "document" ? before.length : target.byteRange!.end;
    const list = inserts.get(insertAt) ?? [];
    list.push(update);
    inserts.set(insertAt, list);
  }

  for (const [insertAt, threads] of inserts.entries()) {
    const block = threads.map((thread) => renderThreadBlock(thread, doc.lineEnding)).join(doc.lineEnding);
    splices.push({ start: insertAt, end: insertAt, bytes: insertionBytes(before, insertAt, block, doc.lineEnding, doc.finalNewline) });
  }

  const after = applySplices(before, splices);
  writeAtomicWithBackup(filePath, before, after, options.createBackup !== false);
  const reparsed = loadReviewDocument(filePath);
  const missing = updates.filter((thread) => !reparsed.threads.some((candidate) => candidate.id === thread.id));
  if (missing.length > 0 || reparsed.errors.length > 0) {
    throw new StetParseError(`Saved file failed validation for thread(s): ${missing.map((thread) => thread.id).join(", ")}`);
  }
  return reparsed;
}

export function appendReply(filePath: string, threadId: string, message: { author: string; bodyMarkdown: string; createdAt?: string }): ReviewDocument {
  const doc = loadReviewDocument(filePath);
  if (doc.errors.length > 0) throw new StetParseError(`Cannot reply while ${doc.errors.length} malformed stet marker(s) exist.`);
  const thread = doc.threads.find((candidate) => candidate.id === threadId);
  if (!thread) throw new StetNotFoundError(`Unknown thread: ${threadId}`);
  const updated = cloneThread(thread);
  const createdAt = message.createdAt ?? isoNow();
  updated.messages.push({ author: message.author, bodyMarkdown: message.bodyMarkdown, createdAt });
  updated.updatedAt = createdAt;
  return saveReviewThreads(filePath, [updated], { expectedHash: doc.fileHash });
}

export function resolveThread(filePath: string, threadId: string, message?: { author: string; bodyMarkdown?: string; createdAt?: string }): ReviewDocument {
  return setThreadStatus(filePath, threadId, "resolved", message);
}

export function reopenThread(filePath: string, threadId: string, message?: { author: string; bodyMarkdown?: string; createdAt?: string }): ReviewDocument {
  return setThreadStatus(filePath, threadId, "open", message);
}

export function setThreadStatus(filePath: string, threadId: string, status: "open" | "resolved", message?: { author: string; bodyMarkdown?: string; createdAt?: string }): ReviewDocument {
  const doc = loadReviewDocument(filePath);
  if (doc.errors.length > 0) throw new StetParseError(`Cannot update status while ${doc.errors.length} malformed stet marker(s) exist.`);
  const thread = doc.threads.find((candidate) => candidate.id === threadId);
  if (!thread) throw new StetNotFoundError(`Unknown thread: ${threadId}`);
  const updated = cloneThread(thread);
  const timestamp = message?.createdAt ?? isoNow();
  updated.status = status;
  updated.updatedAt = timestamp;
  if (message?.bodyMarkdown) updated.messages.push({ author: message.author, bodyMarkdown: message.bodyMarkdown, createdAt: timestamp });
  return saveReviewThreads(filePath, [updated], { expectedHash: doc.fileHash });
}

export function previewThreadPatch(filePath: string, updates: ReviewThread[]): string {
  const doc = loadReviewDocument(filePath);
  return updates.map((thread) => `--- pending ${thread.id}\n${renderThreadBlock(thread, doc.lineEnding)}`).join(`${doc.lineEnding}${doc.lineEnding}`);
}

export function createCommentBySelector(filePath: string, selector: string, author: string, message: string): ReviewDocument {
  const doc = loadReviewDocument(filePath);
  if (doc.errors.length > 0) throw new StetParseError(`Cannot comment while ${doc.errors.length} malformed stet marker(s) exist.`);
  const target = selectTarget(doc, selector);
  if (!target) throw new StetNotFoundError(`No target matched selector: ${selector}`);
  const thread = createThreadForTarget(target, author, message);
  return saveReviewThreads(filePath, [thread], { expectedHash: doc.fileHash });
}

function selectTarget(doc: ReviewDocument, selector: string): ReviewTarget | undefined {
  if (selector === "document") return doc.targets.find((target) => target.kind === "document");
  const [kind, raw] = selector.split(/:(.*)/s).filter(Boolean);
  if (kind === "paragraph" || kind === "heading") {
    const byKind = doc.targets.filter((target) => target.kind === kind);
    const ordinal = Number.parseInt(raw ?? "0", 10);
    if (Number.isFinite(ordinal)) return byKind[ordinal];
    return byKind.find((target) => target.quote === raw || target.headingPath.at(-1) === raw);
  }
  return undefined;
}
