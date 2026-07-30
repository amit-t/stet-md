# Commentable Blocks Everywhere (incl. inside collapsibles)

**Date:** 2026-07-30
**Status:** Approved

## Problem

Only headings and paragraphs carry `data-stet-target`, so only they are commentable in the browser UI. Lists, tables, blockquotes, and fenced code have no targets anywhere. Content inside `<details>` collapsibles has no targets at all — the whole block renders as one opaque chunk. Grill-style review docs (question per collapsible, options as bullet lists) cannot be answered in the UI.

## Goal

Every meaningful block — paragraph, heading, list, table, blockquote, fenced code — is a comment target, at the top level and inside `<details>` at any nesting depth. Answering a question in an expanded collapsible = opening a composer on any block inside it.

Non-goals: targeting `<summary>` lines, `<hr>`, frontmatter blocks, or individual list items; whole-`<details>` targets.

## Design

### 1. Target model (`src/core/types.ts`)

- `TargetKind` gains `"list" | "blockquote" | "table"`. Fenced code reuses the existing `"code_block"` kind.
- `makeTarget`'s kind parameter widens accordingly. Id scheme `t_<kind>_<globalOrdinal>`, `sourceHash`, `byteRange`, `lineStart/lineEnd` semantics unchanged.

### 2. Top-level container targets (`src/core/document.ts`, `parseMarkdown`)

- List, blockquote, table, and fenced-code branches mint a target: quote = `stripMarkdownInline(source)` capped at 240 chars (fallback to kind name), heading path and per-path ordinals same as paragraphs.
- Rendered HTML is wrapped: `<div class="stet-block" data-stet-target="<id>" tabindex="0">…</div>`. Paragraphs and headings keep their inline attribute (no wrapper). `<hr>` stays untargeted.
- The wrapper exists because the UI appends a `+` `<button>` into the target element; a button as a direct child of `<table>`/`<ul>` is invalid and gets hoisted by browsers. The wrapper hosts it legally.

### 3. Targets inside collapsibles

- New `TargetContext` bundle threaded through `renderDetailsBlock` → `renderMarkdownFragment`: `{ targets, ordinals, headingStack, nextGlobalOrdinal(), warnings, linkDefs }`.
- The fragment renderer already walks `Line[]` with real indices, so inner paragraphs, headings, lists, tables, blockquotes, and code blocks mint targets with true byte/line ranges via the same `makeTarget`.
- Nested `<details>` recurse with the same context. `<summary>` is container chrome — no target. The synthetic frontmatter `<details>` block stays untargeted (metadata, not prose).
- When no context is supplied (defensive default), fragment rendering behaves as today (render-only). All production call sites pass the context.

### 4. UI (`src/ui/app.ts`, styles)

- `enhanceTargets`, dblclick, `c`-key, and quick-comment all operate on `[data-stet-target]` generically — they pick up the new wrappers with no logic change.
- CSS: `.stet-block { position: relative; }` and `.target-plus` placement reused.

### 5. Anchoring and CLI

- Thread reattach (sourceHash match, adjacency, drift detection) is target-agnostic — new kinds flow through unchanged.
- `stet-md comment --target <selector>`: selector resolution must accept the new kinds. Verify `createCommentBySelector` does not hardcode `heading|paragraph`; widen if it does.

### 6. Error handling

- Malformed/unclosed `<details>`: existing fallback (escape + warn) unchanged; no targets minted for the malformed region.
- Target id stability: ids remain positional (`globalOrdinal`). Editing the doc shifts ids exactly as it does today for paragraphs; reattach-by-hash compensates. No new invariants.

### 7. Tests

- **Core (`tests/core`):** targets minted for each new kind at top level; targets inside details, including nested details; exact line ranges; frontmatter block excluded; `<summary>` excluded; ordinal/id stability across kinds; quote capping.
- **UI smoke (`tests/browser`):** expand collapsible → dblclick inner list → composer opens with quote → stage comment → thread anchored to the inner target id.
- **Packaging:** existing suite re-run.

### 8. Docs

- README: update the "what can be commented" description.
- `docs/prd/03-local-server-and-browser-ui-prd.md`: reflect block-level targeting incl. collapsibles.
