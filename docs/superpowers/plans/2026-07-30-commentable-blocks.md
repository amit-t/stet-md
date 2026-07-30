# Commentable Blocks Everywhere Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every block — paragraph, heading, list, table, blockquote, fenced code — becomes a comment target, at top level and inside `<details>` at any nesting depth.

**Architecture:** Widen `TargetKind`; mint targets for container blocks in `parseMarkdown` and wrap their HTML in a `<div class="stet-block" data-stet-target>` wrapper; thread a `TargetContext` through `renderDetailsBlock`/`renderMarkdownFragment` so inner blocks mint real targets with true byte/line ranges; widen the CLI selector. UI needs no logic change (`[data-stet-target]` is already generic) — only CSS.

**Tech Stack:** TypeScript, vitest, happy-dom. Spec: `docs/superpowers/specs/2026-07-30-commentable-blocks-design.md`.

**Commands:** `pnpm vitest run tests/core/block-targets.test.ts`, `pnpm run typecheck`, `pnpm run ci`.

---

### Task 1: Top-level container targets (list, blockquote, table, code_block)

**Files:**
- Modify: `src/core/types.ts:9`
- Modify: `src/core/document.ts` (`makeTarget` ~line 213, `parseMarkdown` branches ~lines 530–600)
- Test: `tests/core/block-targets.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/core/block-targets.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadReviewDocument } from "../../src/core/index.js";

function tempMarkdown(contents: string): string {
  const dir = mkdtempSync(join(tmpdir(), "stet-block-targets-"));
  const file = join(dir, "doc.md");
  writeFileSync(file, contents);
  return file;
}

const TOP_LEVEL = [
  "# Title",
  "",
  "Intro paragraph.",
  "",
  "- **Q1?**",
  "- **Q2?**",
  "",
  "> quoted wisdom",
  "",
  "| a | b |",
  "| - | - |",
  "| 1 | 2 |",
  "",
  "```js",
  "const x = 1;",
  "```",
  "",
].join("\n");

describe("top-level container targets", () => {
  test("list, blockquote, table, and code blocks mint targets", () => {
    const doc = loadReviewDocument(tempMarkdown(TOP_LEVEL));
    const kinds = doc.targets.map((t) => t.kind);
    expect(kinds).toContain("list");
    expect(kinds).toContain("blockquote");
    expect(kinds).toContain("table");
    expect(kinds).toContain("code_block");
  });

  test("container html is wrapped with a stet-block target div", () => {
    const doc = loadReviewDocument(tempMarkdown(TOP_LEVEL));
    const list = doc.targets.find((t) => t.kind === "list")!;
    expect(doc.html).toContain(`<div class="stet-block" data-stet-target="${list.id}" tabindex="0"><ul>`);
    const quote = doc.targets.find((t) => t.kind === "blockquote")!;
    expect(doc.html).toContain(`data-stet-target="${quote.id}"`);
  });

  test("list target carries quote and exact line range", () => {
    const doc = loadReviewDocument(tempMarkdown(TOP_LEVEL));
    const list = doc.targets.find((t) => t.kind === "list")!;
    expect(list.quote).toContain("Q1?");
    expect(list.lineStart).toBe(5);
    expect(list.lineEnd).toBe(6);
    expect(list.headingPath).toEqual(["Title"]);
  });

  test("hr mints no target", () => {
    const doc = loadReviewDocument(tempMarkdown("# T\n\n---\n\nProse.\n"));
    expect(doc.targets.filter((t) => t.kind !== "document" && t.kind !== "heading" && t.kind !== "paragraph")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/core/block-targets.test.ts`
Expected: FAIL — `kinds` lacks "list" etc.

- [ ] **Step 3: Widen the target kinds**

`src/core/types.ts` line 9:

```ts
export type TargetKind = "document" | "heading" | "paragraph" | "list" | "blockquote" | "table" | "code_block" | "sub_block";
```

- [ ] **Step 4: Widen makeTarget and add container helpers**

In `src/core/document.ts`, change `makeTarget`'s kind parameter:

```ts
type MintableKind = "heading" | "paragraph" | "list" | "blockquote" | "table" | "code_block";

function makeTarget(kind: MintableKind, headingPath: string[], blockOrdinal: number, quote: string, source: string, startLine: Line, endLine: Line, globalOrdinal: number): ReviewTarget {
```

Below `makeTarget`, add:

```ts
type TargetContext = {
  targets: ReviewTarget[];
  ordinals: Map<string, number>;
  headingStack: string[];
  threadRanges: { start: number; end: number }[];
  nextGlobalOrdinal: () => number;
};

const KIND_FALLBACK_QUOTE: Record<string, string> = {
  list: "List",
  blockquote: "Blockquote",
  table: "Table",
  code_block: "Code block",
};

function mintContainerTarget(ctx: TargetContext, kind: "list" | "blockquote" | "table" | "code_block", source: string, startLine: Line, endLine: Line): ReviewTarget {
  const path = ctx.headingStack.filter(Boolean);
  const key = `${kind}:${path.join("/")}`;
  const ordinal = ctx.ordinals.get(key) ?? 0;
  ctx.ordinals.set(key, ordinal + 1);
  const quote = stripMarkdownInline(source).replace(/\s+/g, " ").trim().slice(0, 240) || KIND_FALLBACK_QUOTE[kind];
  const target = makeTarget(kind, path, ordinal, quote, source, startLine, endLine, ctx.nextGlobalOrdinal());
  ctx.targets.push(target);
  return target;
}

function wrapTargetBlock(target: ReviewTarget, inner: string): string {
  return `<div class="stet-block" data-stet-target="${target.id}" tabindex="0">${inner}</div>`;
}
```

- [ ] **Step 5: Create the context in parseMarkdown and mint targets in the four branches**

In `parseMarkdown`, after `let globalOrdinal = 0;` add:

```ts
  const ctx: TargetContext = {
    targets,
    ordinals,
    headingStack,
    threadRanges,
    nextGlobalOrdinal: () => globalOrdinal++,
  };
```

Replace the four target-less branch pushes:

**Fence branch** — replace `blocks.push({ type: "code", html: renderCodeBlock(codeLines, lang), range: ..., lineStart: start + 1, lineEnd: end + 1 });` with:

```ts
      const codeTarget = mintContainerTarget(ctx, "code_block", collectText(lines, start, end), lines[start], lines[end]);
      blocks.push({
        type: "code",
        html: wrapTargetBlock(codeTarget, renderCodeBlock(codeLines, lang)),
        range: { start: lines[start].start, end: lines[end].end },
        lineStart: start + 1,
        lineEnd: end + 1,
        targetId: codeTarget.id,
      });
```

**List branch** — replace the `blocks.push({ type: "list", ... })` with:

```ts
      const listTarget = mintContainerTarget(ctx, "list", collectText(lines, start, end), lines[start], lines[end]);
      blocks.push({
        type: "list",
        html: wrapTargetBlock(listTarget, renderList(rawLines, warnings, linkDefs)),
        range: { start: lines[start].start, end: lines[end].end },
        lineStart: start + 1,
        lineEnd: end + 1,
        targetId: listTarget.id,
      });
```

**Blockquote branch** — replace the `blocks.push({ type: "blockquote", ... })` with:

```ts
      const quoteTarget = mintContainerTarget(ctx, "blockquote", collectText(lines, start, end), lines[start], lines[end]);
      blocks.push({
        type: "blockquote",
        html: wrapTargetBlock(quoteTarget, `<blockquote>${renderBlockquoteBody(parts, warnings, linkDefs)}</blockquote>`),
        range: { start: lines[start].start, end: lines[end].end },
        lineStart: start + 1,
        lineEnd: end + 1,
        targetId: quoteTarget.id,
      });
```

**Table branch** — replace the `blocks.push({ type: "code", html: renderTable(...) ... })` with:

```ts
      const tableTarget = mintContainerTarget(ctx, "table", collectText(lines, start, end), lines[start], lines[end]);
      blocks.push({
        type: "code",
        html: wrapTargetBlock(tableTarget, renderTable(tableLines, warnings, linkDefs)),
        range: { start: lines[start].start, end: lines[end].end },
        lineStart: start + 1,
        lineEnd: end + 1,
        targetId: tableTarget.id,
      });
```

Leave the `<hr>` branch untouched. Also switch the heading and paragraph branches from `globalOrdinal++` to `ctx.nextGlobalOrdinal()` so numbering stays single-sourced.

- [ ] **Step 6: Run tests**

Run: `pnpm vitest run tests/core/block-targets.test.ts && pnpm run typecheck`
Expected: PASS. Then full core suite: `pnpm vitest run tests/core` — all pass (fix any snapshot-style assertions that relied on unwrapped html).

- [ ] **Step 7: Commit**

```bash
git add src/core/types.ts src/core/document.ts tests/core/block-targets.test.ts
git commit -m "feat(core): mint comment targets for list, blockquote, table, and code blocks"
```

---

### Task 2: CLI selector accepts the new kinds

**Files:**
- Modify: `src/core/document.ts` (`selectTarget` ~line 855)
- Modify: `src/cli/main.ts` (usage text: `--target paragraph:0` line)
- Test: `tests/core/block-targets.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

Append to `tests/core/block-targets.test.ts` (add `createCommentBySelector` to the existing import from `../../src/core/index.js`):

```ts
describe("selector resolution for new kinds", () => {
  test("comment --target list:0 anchors a thread to the first list", () => {
    const file = tempMarkdown(TOP_LEVEL);
    createCommentBySelector(file, "list:0", "Amit", "Answer: option B.");
    const doc = loadReviewDocument(file);
    expect(doc.threads).toHaveLength(1);
    expect(doc.threads[0]!.target.kind).toBe("list");
    expect(doc.errors).toEqual([]);
  });

  test("unknown kind still returns not-found", () => {
    const file = tempMarkdown(TOP_LEVEL);
    expect(() => createCommentBySelector(file, "banana:0", "Amit", "x")).toThrow(/No target matched/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/core/block-targets.test.ts`
Expected: FAIL — `No target matched selector: list:0`.

- [ ] **Step 3: Widen selectTarget**

In `src/core/document.ts` replace the kind guard in `selectTarget`:

```ts
const SELECTABLE_KINDS = new Set(["paragraph", "heading", "list", "blockquote", "table", "code_block"]);

function selectTarget(doc: ReviewDocument, selector: string): ReviewTarget | undefined {
  if (selector === "document") return doc.targets.find((target) => target.kind === "document");
  const [kind, raw] = selector.split(/:(.*)/s).filter(Boolean);
  if (kind && SELECTABLE_KINDS.has(kind)) {
    const byKind = doc.targets.filter((target) => target.kind === kind);
    const ordinal = Number.parseInt(raw ?? "0", 10);
    if (Number.isFinite(ordinal)) return byKind[ordinal];
    return byKind.find((target) => target.quote === raw || target.headingPath.at(-1) === raw);
  }
  return undefined;
}
```

In `src/cli/main.ts`, update the usage line for `comment` to mention the kinds:

```
  stet-md comment FILE.md --target paragraph:0 --author NAME --message MESSAGE
                  (targets: document, paragraph:N, heading:N, list:N, blockquote:N, table:N, code_block:N)
```

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run tests/core/block-targets.test.ts tests/cli`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/document.ts src/cli/main.ts tests/core/block-targets.test.ts
git commit -m "feat(cli): resolve list/blockquote/table/code_block target selectors"
```

---

### Task 3: Targets inside collapsibles (TargetContext threading)

**Files:**
- Modify: `src/core/document.ts` (`renderDetailsBlock` ~line 264, `renderMarkdownFragment` ~line 277, details branch of `parseMarkdown` ~line 544)
- Test: `tests/core/block-targets.test.ts` (extend)

- [ ] **Step 1: Write the failing tests**

Append to `tests/core/block-targets.test.ts`:

```ts
const WITH_DETAILS = [
  "# Title",
  "",
  "<details>",
  "<summary>**Q3: pick an option**</summary>",
  "",
  "Context paragraph inside.",
  "",
  "- option A",
  "- option B",
  "",
  "<details>",
  "<summary>nested</summary>",
  "",
  "Deep paragraph.",
  "",
  "</details>",
  "",
  "</details>",
  "",
].join("\n");

describe("targets inside collapsibles", () => {
  test("paragraphs and lists inside details mint targets with real line ranges", () => {
    const doc = loadReviewDocument(tempMarkdown(WITH_DETAILS));
    const innerParagraph = doc.targets.find((t) => t.quote === "Context paragraph inside.")!;
    expect(innerParagraph.kind).toBe("paragraph");
    expect(innerParagraph.lineStart).toBe(6);
    const innerList = doc.targets.find((t) => t.kind === "list")!;
    expect(innerList.quote).toContain("option A");
    expect(innerList.lineStart).toBe(8);
    expect(innerList.lineEnd).toBe(9);
  });

  test("nested details content mints targets", () => {
    const doc = loadReviewDocument(tempMarkdown(WITH_DETAILS));
    expect(doc.targets.some((t) => t.quote === "Deep paragraph.")).toBe(true);
  });

  test("summary line is not a target", () => {
    const doc = loadReviewDocument(tempMarkdown(WITH_DETAILS));
    expect(doc.targets.some((t) => t.quote.includes("Q3: pick an option"))).toBe(false);
  });

  test("inner blocks carry data-stet-target in the rendered html", () => {
    const doc = loadReviewDocument(tempMarkdown(WITH_DETAILS));
    const innerList = doc.targets.find((t) => t.kind === "list")!;
    expect(doc.html).toContain(`<div class="stet-block" data-stet-target="${innerList.id}" tabindex="0"><ul>`);
  });

  test("frontmatter block mints no targets", () => {
    const doc = loadReviewDocument(tempMarkdown("---\ntitle: X\n---\n\nProse.\n"));
    expect(doc.targets.filter((t) => t.kind === "table")).toEqual([]);
  });

  test("comment on an inner list roundtrips without leaking the marker into prose", () => {
    const file = tempMarkdown(WITH_DETAILS);
    createCommentBySelector(file, "list:0", "Amit", "Answer: option B.");
    const doc = loadReviewDocument(file);
    expect(doc.errors).toEqual([]);
    expect(doc.threads).toHaveLength(1);
    expect(doc.threads[0]!.anchor?.state ?? "attached").not.toBe("orphan");
    expect(doc.html).not.toContain("stet:");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run tests/core/block-targets.test.ts`
Expected: FAIL — no inner targets minted.

- [ ] **Step 3: Thread the context through details rendering**

In `src/core/document.ts`:

**`renderDetailsBlock`** — add optional `ctx` parameter and pass through:

```ts
function renderDetailsBlock(lines: Line[], start: number, end: number, warnings: ReviewWarning[], defs: LinkDefinitions, ctx?: TargetContext): string {
  const open = detailsOpenMatch(lines[start])?.[1] ? " open" : "";
  let index = start + 1;
  while (index < end && isBlank(lines[index])) index += 1;

  const summary = index < end ? summaryMatch(lines[index]) : null;
  const summaryHtml = summary ? `<summary>${renderInlineWithSafeHtml(summary[1], warnings, defs)}</summary>` : "";
  if (summary) index += 1;

  const inner = renderMarkdownFragment(lines, index, end - 1, warnings, defs, ctx);
  return [`<details${open}>`, summaryHtml, inner, "</details>"].filter(Boolean).join("\n");
}
```

**`renderMarkdownFragment`** — add optional `ctx` parameter; when present, skip thread-marker lines, mint targets, and tag/wrap html. Full replacement:

```ts
function renderMarkdownFragment(lines: Line[], startIndex: number, endIndex: number, warnings: ReviewWarning[], defs: LinkDefinitions, ctx?: TargetContext): string {
  const html: string[] = [];
  let i = startIndex;
  while (i <= endIndex) {
    const line = lines[i];
    if (isBlank(line) || linkDefinitionMatch(lineText(line)) || (ctx && isRangeStartInside(ctx.threadRanges, line))) {
      i += 1;
      continue;
    }

    if (detailsOpenMatch(line)) {
      const nestedDetailsEnd = findDetailsEnd(lines, i);
      if (nestedDetailsEnd !== undefined && nestedDetailsEnd <= endIndex) {
        html.push(renderDetailsBlock(lines, i, nestedDetailsEnd, warnings, defs, ctx));
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
      let attr = "";
      if (ctx) {
        ctx.headingStack.splice(level - 1);
        ctx.headingStack[level - 1] = title;
        const path = ctx.headingStack.filter(Boolean);
        const key = `heading:${path.slice(0, -1).join("/")}`;
        const ordinal = ctx.ordinals.get(key) ?? 0;
        ctx.ordinals.set(key, ordinal + 1);
        const target = makeTarget("heading", path, ordinal, title, lineText(line), line, line, ctx.nextGlobalOrdinal());
        ctx.targets.push(target);
        attr = ` data-stet-target="${target.id}" tabindex="0"`;
      }
      html.push(`<h${level} id="${slugify(title)}"${attr}>${renderInline(title, warnings, defs)}</h${level}>`);
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
      let rendered = renderCodeBlock(codeLines, lang);
      if (ctx) rendered = wrapTargetBlock(mintContainerTarget(ctx, "code_block", collectText(lines, codeStart, codeEnd), lines[codeStart], lines[codeEnd]), rendered);
      html.push(rendered);
      i = codeEnd + 1;
      continue;
    }

    if (isList(line)) {
      const listStart = i;
      const rawLines: string[] = [];
      while (i <= endIndex && (isList(lines[i]) || (lineText(lines[i]).startsWith("  ") && !isBlank(lines[i]) && !detailsOpenMatch(lines[i])))) {
        if (ctx && isRangeStartInside(ctx.threadRanges, lines[i])) break;
        rawLines.push(lineText(lines[i]));
        i += 1;
      }
      let rendered = renderList(rawLines, warnings, defs);
      if (ctx) rendered = wrapTargetBlock(mintContainerTarget(ctx, "list", collectText(lines, listStart, i - 1), lines[listStart], lines[i - 1]), rendered);
      html.push(rendered);
      continue;
    }

    if (isBlockquote(line)) {
      const quoteStart = i;
      const parts: string[] = [];
      while (i <= endIndex && isBlockquote(lines[i])) {
        if (ctx && isRangeStartInside(ctx.threadRanges, lines[i])) break;
        parts.push(lineText(lines[i]).replace(/^\s{0,3}>\s?/, ""));
        i += 1;
      }
      let rendered = `<blockquote>${renderBlockquoteBody(parts, warnings, defs)}</blockquote>`;
      if (ctx) rendered = wrapTargetBlock(mintContainerTarget(ctx, "blockquote", collectText(lines, quoteStart, i - 1), lines[quoteStart], lines[i - 1]), rendered);
      html.push(rendered);
      continue;
    }

    if (isTable(line)) {
      const tableStart = i;
      while (i <= endIndex && isTable(lines[i])) i += 1;
      const tableLines = lines.slice(tableStart, i).map((candidate) => lineText(candidate));
      let rendered = renderTable(tableLines, warnings, defs);
      if (ctx) rendered = wrapTargetBlock(mintContainerTarget(ctx, "table", collectText(lines, tableStart, i - 1), lines[tableStart], lines[i - 1]), rendered);
      html.push(rendered);
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
      !detailsOpenMatch(lines[i]) &&
      !(ctx && isRangeStartInside(ctx.threadRanges, lines[i]))
    ) {
      i += 1;
    }
    const paragraphSource = collectText(lines, paragraphStart, i - 1);
    if (RAW_HTML_TAG.test(paragraphSource)) rawHtmlWarning(warnings);
    if (ctx) {
      const path = ctx.headingStack.filter(Boolean);
      const key = `paragraph:${path.join("/")}`;
      const ordinal = ctx.ordinals.get(key) ?? 0;
      ctx.ordinals.set(key, ordinal + 1);
      const quote = stripMarkdownInline(paragraphSource).slice(0, 240) || "Paragraph";
      const target = makeTarget("paragraph", path, ordinal, quote, paragraphSource, lines[paragraphStart], lines[i - 1], ctx.nextGlobalOrdinal());
      ctx.targets.push(target);
      html.push(`<p data-stet-target="${target.id}" tabindex="0">${renderInline(paragraphSource.replace(/\n/g, " "), warnings, defs)}</p>`);
    } else {
      html.push(`<p>${renderInline(paragraphSource.replace(/\n/g, " "), warnings, defs)}</p>`);
    }
  }
  return html.join("\n");
}
```

**Details branch of `parseMarkdown`** — pass the context:

```ts
        html: renderDetailsBlock(lines, start, end, warnings, linkDefs, ctx),
```

`renderFrontmatterBlock` keeps calling nothing with `ctx` — frontmatter stays target-free by construction.

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run tests/core && pnpm run typecheck`
Expected: PASS (all core suites, including anchors/roundtrip).

- [ ] **Step 5: Commit**

```bash
git add src/core/document.ts tests/core/block-targets.test.ts
git commit -m "feat(core): mint comment targets for blocks inside details collapsibles"
```

---

### Task 4: UI — CSS for wrappers + smoke tests

**Files:**
- Modify: `src/server/assets.ts` (style, ~line 35)
- Test: `tests/browser/ui-smoke.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

Append to `tests/browser/ui-smoke.test.ts` inside the existing `describe`:

```ts
  test("quick-comment works on wrapped blocks inside details", async () => {
    const window = createWindow();
    const payload = {
      ...documentPayload,
      html: `<details open><summary>Q3</summary><div class="stet-block" data-stet-target="t3" tabindex="0"><ul><li>option A</li><li>option B</li></ul></div></details>`,
      targets: [
        { id: "doc", kind: "document", quote: "Document" },
        { id: "t3", kind: "list", quote: "option A option B" },
      ],
    };
    const fetchMock = vi.fn(async () => Response.json(payload));
    const app = createStetApp({ window: window as unknown as Window & typeof globalThis, fetch: fetchMock as unknown as typeof fetch });
    await app.start();

    const wrapper = window.document.querySelector<HTMLElement>(".stet-block[data-stet-target='t3']")!;
    const button = wrapper.querySelector<HTMLButtonElement>(":scope > button[data-action='quick-comment']");
    expect(button).not.toBeNull();
    expect(wrapper.querySelector("ul button")).toBeNull();

    button!.click();
    const composer = window.document.querySelector<HTMLElement>("#threads .composer");
    expect(composer).not.toBeNull();
    expect(composer!.textContent).toContain("option A");
  });
```

- [ ] **Step 2: Run test to verify current state**

Run: `pnpm vitest run tests/browser`
Expected: PASS already (enhanceTargets is generic) — this test locks the behavior in. If it fails, fix per failure message before continuing.

- [ ] **Step 3: Add wrapper CSS**

In `src/server/assets.ts`, extend the position rule (line ~35):

```
#document p, #document h1, #document h2, #document h3, #document h4, #document h5, #document h6, #document li, #document .stet-block { position: relative; }
```

Add after the `.target-plus` rule:

```
.stet-block > .target-plus { position: absolute; top: 0.15rem; right: 0.3rem; margin-left: 0; }
```

- [ ] **Step 4: Run browser tests**

Run: `pnpm vitest run tests/browser`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/assets.ts tests/browser/ui-smoke.test.ts
git commit -m "feat(ui): comment affordance on wrapped block targets incl. inside details"
```

---

### Task 5: Docs

**Files:**
- Modify: `README.md` (commenting/targets description)
- Modify: `docs/prd/03-local-server-and-browser-ui-prd.md` (targeting section)

- [ ] **Step 1: Update README**

Find the section describing what can be commented (search for "paragraph" / "heading" near comment usage). State: every block is a target — paragraphs, headings, lists, tables, blockquotes, fenced code — including blocks inside `<details>` collapsibles at any depth; CLI selectors `list:N`, `blockquote:N`, `table:N`, `code_block:N` alongside the existing `paragraph:N` / `heading:N` / `document`.

- [ ] **Step 2: Update PRD 03**

In `docs/prd/03-local-server-and-browser-ui-prd.md`, update the target-granularity statements to match (block-level targets everywhere, wrapper div affordance, summary/hr/frontmatter excluded).

- [ ] **Step 3: Commit**

```bash
git add README.md docs/prd/03-local-server-and-browser-ui-prd.md
git commit -m "docs: block-level comment targets incl. inside collapsibles"
```

---

### Task 6: Full verification

- [ ] **Step 1: Full CI locally**

Run: `pnpm run ci`
Expected: typecheck clean; all suites (core, cli, safety, server, security, browser, packaging) pass.

- [ ] **Step 2: Rebuild + live end-to-end check**

```bash
pnpm run build
SCRATCH=$(mktemp -d); cat > "$SCRATCH/sample.md" <<'EOF'
# Plan

<details>
<summary>**Q1: which option?**</summary>

Context paragraph.

- option A
- option B

</details>
EOF
stet-md "$SCRATCH/sample.md" --port 4799 --no-open &
sleep 2
curl -s -c "$SCRATCH/c.txt" -o /dev/null http://127.0.0.1:4799/
curl -s -b "$SCRATCH/c.txt" http://127.0.0.1:4799/api/document | grep -o 'stet-block\" data-stet-target=\"[^\"]*\"' | sort -u
kill %1
```

Expected: wrapper targets listed for the inner paragraph is inline (`<p data-stet-target`), inner list shows a `stet-block` wrapper target.

- [ ] **Step 3: CLI end-to-end**

```bash
stet-md comment "$SCRATCH/sample.md" --target list:0 --author Amit --message "Option B."
stet-md list --json "$SCRATCH/sample.md"
```

Expected: one thread, target kind `list`, no parse errors.

- [ ] **Step 4: Report** — summarize commits, test counts, and observed end-to-end output. Remind: restart any running stet-md session + hard-reload browser.
