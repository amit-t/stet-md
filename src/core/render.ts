import hljs from "highlight.js";
import type { ReviewWarning } from "./types.js";
import { escapeHtml } from "./escape.js";

/**
 * GitHub-flavored Markdown -> HTML rendering helpers.
 *
 * Stet.md renders the document server-side and styles it with the bundled
 * github-markdown-css + highlight.js GitHub theme (see src/server/vendorCss.ts),
 * so the output here is shaped to match what a browser / the `mdv` (mdview) tool
 * produces: real tables, ordered/nested/task lists, emphasis, strikethrough,
 * autolinks, horizontal rules, slugged headings, and highlighted code.
 *
 * Security posture is preserved: all text is HTML-escaped first, raw inline HTML
 * is not emitted here, and remote images are blocked (CSP forbids remote origins).
 */

const NUL = "\u0000";

export type LinkDefinition = { href: string; title?: string };
export type LinkDefinitions = Map<string, LinkDefinition>;

/** Normalize a link reference label the way GitHub does (case/space-folded). */
export function normalizeLinkLabel(label: string): string {
  return label.trim().replace(/\s+/g, " ").toLowerCase();
}

function blockRemoteImage(alt: string, warnings: ReviewWarning[]): string {
  warnings.push({ kind: "remote_resource_blocked", message: "Remote Markdown image was blocked by default." });
  return `<span class="blocked-resource" data-stet-blocked-resource="image">remote image blocked: ${alt}</span>`;
}

/** GitHub-style heading anchor slug. */
export function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s/g, "-");
}

/** Apply emphasis/strikethrough to already-escaped, token-protected text. */
function applyEmphasis(text: string): string {
  return text
    .replace(/\*\*\*(?=\S)([\s\S]*?\S)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/___(?=\S)([\s\S]*?\S)___/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^\w])__(?=\S)([\s\S]*?\S)__(?=[^\w]|$)/g, "$1<strong>$2</strong>")
    .replace(/\*(?=\S)([^*]*?\S)\*/g, "<em>$1</em>")
    .replace(/(^|[^\w])_(?=\S)([^_]*?\S)_(?=[^\w]|$)/g, "$1<em>$2</em>")
    .replace(/~~(?=\S)([\s\S]*?\S)~~/g, "<del>$1</del>");
}

/**
 * Render inline Markdown to HTML. Escapes first, protects code spans / links /
 * images as opaque tokens, then applies emphasis so markup inside URLs is never
 * mangled.
 */
export function renderInline(text: string, warnings: ReviewWarning[], defs: LinkDefinitions = new Map()): string {
  // Strip NUL so it can never collide with the placeholder sentinel below.
  let safe = escapeHtml(text.split(NUL).join(""));
  const tokens: string[] = [];
  const stash = (html: string): string => `${NUL}${tokens.push(html) - 1}${NUL}`;
  // href is expected pre-escaped (inline hrefs come from the escaped source;
  // reference-definition hrefs are escaped when the map is built).
  const anchor = (href: string, body: string): string =>
    /^(?:https?:|mailto:|#|\/|\.{1,2}\/)/i.test(href)
      ? stash(`<a href="${href}" rel="noreferrer noopener">${applyEmphasis(body)}</a>`)
      : applyEmphasis(body);

  // Inline code spans (escaped backticks survive escapeHtml). Trim one padding
  // space on each side per CommonMark when the span is not all-whitespace.
  safe = safe.replace(/(`+)([\s\S]*?)\1/g, (_all, _ticks: string, body: string) => {
    let inner = body;
    if (inner.length > 2 && inner.startsWith(" ") && inner.endsWith(" ") && inner.trim() !== "") {
      inner = inner.slice(1, -1);
    }
    return stash(`<code>${inner}</code>`);
  });

  // Images: remote blocked, local/data allowed (CSP img-src 'self' data:).
  safe = safe.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;[^)]*&quot;)?\)/g, (_all, alt: string, src: string) => {
    if (/^(?:https?:)?\/\//i.test(src)) return stash(blockRemoteImage(alt, warnings));
    return stash(`<img src="${src}" alt="${alt}">`);
  });

  // Autolinks <https://...> (angle brackets are now &lt; / &gt;). The URL body
  // allows escaped ampersands (&amp;) so query strings are not truncated.
  safe = safe.replace(/&lt;(https?:\/\/(?:&amp;|[^\s&])+)&gt;/g, (_all, url: string) =>
    stash(`<a href="${url}" rel="noreferrer noopener">${url}</a>`),
  );

  // Inline links [label](href) — only safe schemes/relative become anchors.
  safe = safe.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;[^)]*&quot;)?\)/g, (_all, label: string, href: string) =>
    anchor(href, label),
  );

  // Reference links: full [text][id], collapsed [text][], shortcut [id].
  if (defs.size > 0) {
    const lookup = (label: string): LinkDefinition | undefined => defs.get(normalizeLinkLabel(label));
    safe = safe.replace(/\[([^\]]+)\]\[([^\]]*)\]/g, (all, text: string, id: string) => {
      const def = lookup(id.trim() === "" ? text : id);
      return def ? anchor(def.href, text) : all;
    });
    safe = safe.replace(/\[([^\]]+)\]/g, (all, text: string) => {
      const def = lookup(text);
      return def ? anchor(def.href, text) : all;
    });
  }

  safe = applyEmphasis(safe);
  safe = safe.replace(new RegExp(`${NUL}(\\d+)${NUL}`, "g"), (_all, index: string) => tokens[Number(index)] ?? "");
  return safe;
}

/** True for a Markdown thematic break (`---`, `***`, `___`). */
export function isHorizontalRule(text: string): boolean {
  return /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(text);
}

/** Render a fenced code block, syntax-highlighted with highlight.js. */
export function renderCodeBlock(code: string, lang: string): string {
  const language = lang.trim().split(/\s+/)[0] ?? "";
  if (language && hljs.getLanguage(language)) {
    try {
      const highlighted = hljs.highlight(code, { language }).value;
      return `<pre><code class="hljs language-${escapeHtml(language)}">${highlighted}</code></pre>`;
    } catch {
      /* fall through to plain */
    }
  }
  return `<pre><code class="hljs">${escapeHtml(code)}</code></pre>`;
}

function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells: string[] = [];
  let current = "";
  for (let i = 0; i < trimmed.length; i += 1) {
    const ch = trimmed[i];
    if (ch === "\\" && trimmed[i + 1] === "|") {
      current += "|";
      i += 1;
    } else if (ch === "|") {
      cells.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  cells.push(current);
  return cells.map((cell) => cell.trim());
}

function tableAlignments(delimiter: string): (string | undefined)[] {
  return splitTableRow(delimiter).map((cell) => {
    const left = cell.startsWith(":");
    const right = cell.endsWith(":");
    if (left && right) return "center";
    if (right) return "right";
    if (left) return "left";
    return undefined;
  });
}

/** Render a GFM pipe table (header, delimiter, then body rows). */
export function renderTable(rawLines: string[], warnings: ReviewWarning[], defs: LinkDefinitions = new Map()): string {
  const aligns = tableAlignments(rawLines[1] ?? "");
  const headerCells = splitTableRow(rawLines[0] ?? "");
  const cellTag = (tag: string, value: string, index: number): string => {
    const align = aligns[index];
    return `<${tag}${align ? ` align="${align}"` : ""}>${renderInline(value, warnings, defs)}</${tag}>`;
  };
  const head = `<thead><tr>${headerCells.map((cell, index) => cellTag("th", cell, index)).join("")}</tr></thead>`;
  const bodyRows = rawLines.slice(2).map((line) => {
    const cells = splitTableRow(line);
    const filled = headerCells.map((_, index) => cells[index] ?? "");
    return `<tr>${filled.map((cell, index) => cellTag("td", cell, index)).join("")}</tr>`;
  });
  const body = bodyRows.length > 0 ? `<tbody>${bodyRows.join("")}</tbody>` : "";
  return `<table>${head}${body}</table>`;
}

type ListItemMatch = { indent: number; ordered: boolean; start: number; text: string };

function matchListItem(line: string): ListItemMatch | null {
  const match = line.match(/^(\s*)([-+*]|(\d+)[.)])\s+(.*)$/);
  if (!match) return null;
  return {
    indent: match[1].length,
    ordered: match[3] !== undefined,
    start: match[3] !== undefined ? Number(match[3]) : 1,
    text: match[4],
  };
}

/** Render a (possibly nested) Markdown list from its raw source lines. */
export function renderList(rawLines: string[], warnings: ReviewWarning[], defs: LinkDefinitions = new Map()): string {
  return buildListLevel(rawLines, 0, rawLines.length, warnings, defs);
}

function buildListLevel(lines: string[], start: number, end: number, warnings: ReviewWarning[], defs: LinkDefinitions): string {
  let baseIndent = Infinity;
  for (let i = start; i < end; i += 1) {
    const match = matchListItem(lines[i]);
    if (match && match.indent < baseIndent) baseIndent = match.indent;
  }
  const first = (() => {
    for (let i = start; i < end; i += 1) {
      const match = matchListItem(lines[i]);
      if (match && match.indent === baseIndent) return match;
    }
    return null;
  })();
  if (!first) return "";

  const ordered = first.ordered;
  const items: string[] = [];
  let hasTask = false;
  let i = start;
  while (i < end) {
    const match = matchListItem(lines[i]);
    if (!match || match.indent !== baseIndent) {
      i += 1;
      continue;
    }
    const childStart = i + 1;
    let j = childStart;
    while (j < end) {
      const child = matchListItem(lines[j]);
      if (child && child.indent <= baseIndent) break;
      j += 1;
    }
    const childLines = lines.slice(childStart, j);
    const nestedAt = childLines.findIndex((line) => matchListItem(line) !== null);

    let text = match.text;
    const continuation = (nestedAt === -1 ? childLines : childLines.slice(0, nestedAt))
      .map((line) => line.trim())
      .filter(Boolean);
    if (continuation.length > 0) text = [text, ...continuation].join(" ");

    let prefix = "";
    let itemClass = "";
    const task = text.match(/^\[([ xX])\]\s+(.*)$/);
    if (task) {
      hasTask = true;
      itemClass = ' class="task-list-item"';
      const checked = task[1].toLowerCase() === "x" ? " checked" : "";
      prefix = `<input type="checkbox" disabled${checked}> `;
      text = task[2];
    }

    const nested = nestedAt === -1 ? "" : buildListLevel(childLines, nestedAt, childLines.length, warnings, defs);
    items.push(`<li${itemClass}>${prefix}${renderInline(text, warnings, defs)}${nested}</li>`);
    i = j;
  }

  if (ordered) {
    const startAttr = first.start !== 1 ? ` start="${first.start}"` : "";
    return `<ol${startAttr}>${items.join("")}</ol>`;
  }
  const listClass = hasTask ? ' class="contains-task-list"' : "";
  return `<ul${listClass}>${items.join("")}</ul>`;
}
