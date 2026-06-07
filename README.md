# Redline

Redline is a local Markdown review utility: open a Markdown file in the browser, add threaded review comments, save those threads back into the same Markdown file, and let AI agents reply in the same threads.

Current status: **PRD-only handoff repo**. No implementation yet.

## Identity

- GitHub repo: `redline`
- npm package: `redline-md`
- CLI binary: `redline`
- CLI alias: `rl`
- Thread marker: `redline:thread`
- Thread ID prefix: `rlt_`
- Local state dir: `.redline/`

## Start here

Read docs in order:

1. [`docs/prd/00-redline-master-prd.md`](docs/prd/00-redline-master-prd.md) — consolidated master PRD.
2. [`docs/prd/01-storage-format-and-splice-prd.md`](docs/prd/01-storage-format-and-splice-prd.md) — core storage contract and byte-splice writer.
3. [`docs/prd/02-agent-cli-prd.md`](docs/prd/02-agent-cli-prd.md) — agent-safe CLI commands.
4. [`docs/prd/03-local-server-and-browser-ui-prd.md`](docs/prd/03-local-server-and-browser-ui-prd.md) — local server and review UI.
5. [`docs/prd/04-safety-conflict-and-drafts-prd.md`](docs/prd/04-safety-conflict-and-drafts-prd.md) — security, conflicts, locks, backups, drafts.
6. [`docs/prd/05-packaging-testing-and-release-prd.md`](docs/prd/05-packaging-testing-and-release-prd.md) — package, tests, release gates.

## Source provenance

This repo consolidates:

- Base Codex canonical PRD from `~/Profiles/docs/superpowers/specs/2026-06-07-markdown-review-comments-prd.md`.
- kid-Claude corrected v2 PRD from Profiles commit `6c1e45e`.
- kid-Claude review findings folded into canonical Redline PRD, including byte-splice persistence, structured thread markers, agent CLI, sub-block anchoring, and loopback hardening.

## Non-goal right now

Do not implement before converting these PRDs into an implementation plan or tracked tasks.
