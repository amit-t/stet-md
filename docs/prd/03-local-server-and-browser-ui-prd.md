# Stet.md PRD 03 — Local Server and Browser Review UI

## Purpose

Provide the human review surface: open Markdown in a browser, add comments to eligible blocks, save threads into the file, and restore threads on reopen.

## Launch flow

```zsh
stet path/to/file.md
```

1. Resolve absolute canonical file path.
2. Start local server on `127.0.0.1` and chosen/random port.
3. Set authenticated session cookie.
4. Open browser unless `--no-open`.
5. Render document with commentable targets.

## Server API

MVP endpoints:

- `GET /` — UI shell.
- `GET /api/document` — rendered HTML, target model, thread model, dirty/conflict status.
- `POST /api/comments` — stage new comment/reply/resolve event in browser session.
- `POST /api/save` — persist staged changes through storage subsystem.
- `GET /api/patch` — raw pending patch preview for conflict/debug flows.
- `GET /events` — file-change and save events.

## UI layout

1. Top bar: file name, dirty state, save button, reload button, open thread count, render/security warnings.
2. Markdown body: GitHub-like styling, syntax highlighting, `data-stet-target` attributes.
3. Gutter/side panel: aligned thread cards, document-level card, orphan/card drift warnings.

## Comment creation

MVP interactions:

- Double-click eligible heading or paragraph.
- Hover eligible block and click `+`.
- Focus block and press `c`.
- Select text and press `c`; selected text becomes quoted context, but target remains block-level.
- Click “Comment on document” for global feedback.

## Thread display

Thread card shows:

- Status: open/resolved.
- Target quote or document-level label.
- Message history with author and localized display time.
- Reply composer.
- Resolve/reopen control.

Resolved threads collapsed by default.

## Reopen behavior

On reopen:

- Parse all `stet:thread` blocks.
- Attach by MVP anchor algorithm.
- Show `content drifted` when adjacent target hash changed.
- Show orphaned threads in “Needs re-attach”.
- Preserve raw orphan thread blocks.

## Acceptance criteria

- Browser opens for `stet prd.md`.
- Document renders headings, paragraphs, lists, blockquotes, and code blocks.
- Double-click heading/paragraph opens composer.
- Saving writes `stet:thread` block.
- Reopen restores thread beside target.
- CLI-added reply appears after reload.
- Resolve/reopen status survives save and reopen.
- Unsaved composer warning prevents accidental loss on reload.
