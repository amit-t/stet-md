# Redline PRD 05 — Packaging, Testing, and Release Gates

## Purpose

Ship Redline as a standalone utility that an implementation agent can build, test, and release safely.

## Package identity

- Repo: `redline`
- npm package: `redline-md`
- Binary: `redline`
- Alias: `rl`
- Marker: `redline:thread`
- ID prefix: `rlt_`
- State dir: `.redline/`

## Recommended stack

- TypeScript
- Node.js
- Unified/remark-compatible Markdown parser with source positions
- Rehype/render pipeline for browser HTML
- Small local HTTP server
- Vanilla TypeScript frontend for MVP
- Unit tests before browser tests

## Repository structure target

Suggested future structure:

```text
bin/
  redline
src/
  cli/
  core/
    parseThreads.ts
    spliceWriter.ts
    anchors.ts
    renderThread.ts
  server/
  ui/
tests/
  fixtures/
  core/
  cli/
  browser/
docs/
  prd/
  AGENT_PROTOCOL.md
```

This PRD handoff does not require that structure to exist before implementation.

## Test gates

Core parser tests:

- Zero-thread Markdown.
- One thread after heading.
- Multiple threads in one section.
- Malformed marker.
- Divergent generated blockquote.
- Message body containing `-->`.

Splice writer tests:

- Insert heading comment.
- Insert paragraph comment.
- Replace existing thread.
- Append reply.
- Resolve thread.
- Preserve LF, CRLF, BOM, final newline/no-final-newline.
- Preserve trailing spaces, list markers, reference links, wrapping.
- Golden fixtures assert byte-for-byte equality outside expected splice ranges.

CLI tests:

- `list --json` valid JSON.
- `reply` appends one message.
- `resolve` updates status.
- Nonzero exit for unknown thread, malformed marker, changed file.

Browser tests:

- Open fixture.
- Double-click paragraph.
- Save comment.
- Confirm file contains `redline:thread`.
- Reload and see thread.
- CLI reply appears in UI.
- Resolve persists.
- Draft survives refresh.

Security tests:

- Token missing/wrong rejected.
- Host header rejected.
- CSP present.
- No-referrer header present.
- Remote resources blocked by default.

## Release gates

MVP release cannot ship unless:

1. Core parser/splice tests pass.
2. CLI tests pass.
3. Browser save/reopen flow passes.
4. Security headers and token behavior verified.
5. README documents install, usage, storage format, security model, formatter caveats, and agent protocol.
6. Dogfood succeeds on the master PRD.

## Acceptance criteria

- `npm package` metadata uses `redline-md`.
- Installed binary is `redline`; alias `rl` works if shipped.
- `redline --version` and `redline --help` work.
- CI runs unit, CLI, and browser smoke tests.
- Release notes state MVP limitations: no list-item/table-row/text-range comments yet.
