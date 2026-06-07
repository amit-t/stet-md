# Stet PRD Handoff

This folder is the implementation handoff for Stet.

## What Stet is

Stet opens a Markdown file in a browser, lets a human add threaded comments to exact document blocks, saves those comments back into the same Markdown file, and lets AI agents reply through safe CLI commands or a documented fallback marker protocol.

## Consolidated source

The master PRD consolidates two sources:

1. Base Codex PRD: `~/Profiles/docs/superpowers/specs/2026-06-07-markdown-review-comments-prd.md`.
2. kid-Claude PRD/review: Profiles commit `6c1e45e`, later merged into the canonical PRD.

The consolidated decisions are in `00-stet-master-prd.md`.

## Why split into granular PRDs

The product has five separable subsystems with different failure modes and acceptance criteria:

1. Storage format + byte-splice persistence.
2. Agent-safe CLI.
3. Local server + browser UI.
4. Safety, conflicts, drafts, locks, backups.
5. Packaging, testing, release gates.

Implementing them as one giant task would hide the core risk: corrupting user Markdown. Start with storage/persistence and CLI before UI polish.

## Recommended implementation order

1. `01-storage-format-and-splice-prd.md`
2. `02-agent-cli-prd.md`
3. `04-safety-conflict-and-drafts-prd.md`
4. `03-local-server-and-browser-ui-prd.md`
5. `05-packaging-testing-and-release-prd.md`

Reason: persistence contract must be trusted before browser UX can safely write files.

## MVP done means

Amit can run:

```zsh
stet prd.md
```

Then:

1. Browser opens.
2. Amit double-clicks a heading or paragraph.
3. Amit writes a comment and saves.
4. `prd.md` gains a structured `stet:thread` block.
5. An agent runs `stet reply prd.md --thread <id> --author Claude --message "..."`.
6. Reopening `stet prd.md` shows both human comment and agent reply in one thread.
7. Untouched Markdown bytes remain identical.
