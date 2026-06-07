# Redline

Redline is a local Markdown review utility: open a Markdown file in the browser,
add threaded review comments, save those threads back into the **same** Markdown
file, and let AI agents reply in the same threads — no database, account, cloud
service, or sidecar file.

The Markdown file is the source of truth. Saving review threads never rewrites
unrelated bytes: edits are surgical **byte splices**, so formatting, wrapping,
reference links, list markers, line endings, BOM, and the final newline all stay
exactly as they were.

Current status: **core storage, agent CLI, and safety primitives implemented**
(PRDs 01, 02, 04). The browser review server/UI (PRD 03) plugs into the security
helpers shipped here.

## Identity

| | |
|---|---|
| npm package | `redline-md` |
| CLI binary | `redline` (alias `rl`) |
| Thread marker | `redline:thread` |
| Thread ID prefix | `rlt_` |
| Local state dir | `.redline/` |

## Install

```zsh
npm install            # install dependencies
npm run build          # compile TypeScript to dist/
npm test               # run the full test suite (vitest)
npm run typecheck      # tsc --noEmit
```

After `npm install -g .` (or via the published package), the `redline` and `rl`
binaries are available.

## CLI

Agent-safe, no browser required:

```zsh
redline list --json FILE.md                                   # threads as deterministic JSON
redline reply FILE.md --thread ID --author Claude --message "…"   # append one reply
redline resolve FILE.md --thread ID --author Claude --message "…" # mark resolved (+ optional message)
redline comment FILE.md --target heading:"Product goals" --author Amit --message "…"  # create a thread
redline --print-agent-protocol                                # agent collaboration protocol
redline --version
redline --help
```

`--target` kinds: `heading:"Heading text"`, `paragraph:N` (1-based) or
`paragraph:"substring"`, and `document` (file-level comment appended near the
end).

Author defaults to `$REDLINE_AUTHOR`, then `$USER`, then `Agent`.

Exit codes: `0` ok · `1` runtime error (missing file, malformed marker with line
number, unknown thread, file changed on disk) · `2` usage error.

The browser launch form `redline FILE.md [--author …] [--app …] [--port …]
[--no-open]` is provided by the server subsystem (PRD 03) and is not bundled in
this core build.

## Storage format

Threads persist as a structured HTML-comment marker (the source of truth)
followed by a generated `[!NOTE]` blockquote (the human/agent-readable view):

```markdown
<!-- redline:thread
version: 1
id: rlt_20260607_150015_7f3a9c
status: open
created_at: 2026-06-07T15:00:15Z
updated_at: 2026-06-07T15:00:15Z
target:
  kind: heading
  heading_path:
    - Product goals
  block_ordinal: 0
  source_hash: sha256:4e2f…
  quote: Product goals
messages:
  - author: Amit
    created_at: 2026-06-07T15:00:15Z
    body: |-
      This section needs a goal about agents responding inside the file.
-->
> [!NOTE]
> **Review thread `rlt_20260607_150015_7f3a9c` — open**
>
> **Amit** · 2026-06-07 15:00 UTC
>
> This section needs a goal about agents responding inside the file.
<!-- /redline:thread -->
```

Guarantees:

- **Splice, never stringify.** The Markdown AST is used only to find source
  positions; saves apply byte splices and preserve every untouched byte
  (verified byte-for-byte across LF, CRLF, BOM, trailing spaces, list markers,
  reference links, and final-newline state).
- **Comment-safe bodies.** A message body containing `-->` or `--` is encoded
  in the structured data so it cannot close the HTML comment early, and decoded
  losslessly on read.
- **Marker tokens in code are ignored.** `redline:thread` inside fenced/inline
  code (docs, examples) is never mistaken for a real thread.
- **Honest anchoring.** Threads reattach by adjacency + source hash; drift and
  orphans are surfaced, never silently guessed (no fuzzy matching in MVP).

## Safety model

- **Conflict-aware saves.** Before writing, Redline re-reads the file and
  refuses to overwrite if it changed since load — no last-write-wins. A backup
  of the prior bytes is written first.
- **Backups & gitignore.** Backups go to `.redline/backups/<file>.<UTC>.<hash>.bak`.
  `.redline/.gitignore` is auto-created containing `*`, so backups and locks
  never enter git.
- **Atomic writes.** New content is written to a temp file in the same
  directory, fsynced, then renamed over the original.
- **Locks.** `.redline/locks/` records PID, hostname, start time, target path,
  and loaded hash. A second active instance warns; a lock whose PID is gone or
  whose mtime is stale is recoverable.

### Loopback server security helpers

For the browser subsystem (PRD 03), `redline-md/safety` exports framework-
agnostic hooks (master PRD §15):

- `generateToken`, `buildSessionCookie` (HttpOnly, SameSite=Strict, never in a
  URL), `checkToken` (constant-time; rejects missing/wrong tokens),
- `validateHost(host, port)` — rejects DNS-rebinding (only loopback hosts on the
  expected port),
- `securityHeaders()` / `contentSecurityPolicy()` — `no-referrer`, `nosniff`,
  and a `default-src 'none'` CSP that blocks all remote loads,
- `isRemoteResourceUrl` / `blockRemoteResourcesInHtml` — block remote images so
  reviewing cannot leak via Referer.

## Agent protocol

See [`docs/AGENT_PROTOCOL.md`](docs/AGENT_PROTOCOL.md) or run
`redline --print-agent-protocol`. In short: prefer the CLI (`list` / `reply` /
`resolve`); if hand-editing, only touch the `messages:` list inside the marker,
use UTC `…Z` timestamps, never hand-edit the generated blockquote, and set
`status: resolved` to close a thread.

## Library API

```ts
import { scanThreadBlocks, insertThreadBlock, newThread } from "redline-md/core";
import { acquireLock, securityHeaders } from "redline-md/safety";
import { runCli } from "redline-md";
```

## PRD handoff docs

1. [`docs/prd/00-redline-master-prd.md`](docs/prd/00-redline-master-prd.md) — consolidated master PRD.
2. [`docs/prd/01-storage-format-and-splice-prd.md`](docs/prd/01-storage-format-and-splice-prd.md) — storage contract + byte-splice writer. **(implemented)**
3. [`docs/prd/02-agent-cli-prd.md`](docs/prd/02-agent-cli-prd.md) — agent-safe CLI. **(implemented)**
4. [`docs/prd/03-local-server-and-browser-ui-prd.md`](docs/prd/03-local-server-and-browser-ui-prd.md) — local server + review UI.
5. [`docs/prd/04-safety-conflict-and-drafts-prd.md`](docs/prd/04-safety-conflict-and-drafts-prd.md) — safety, conflicts, locks, backups. **(implemented)**
6. [`docs/prd/05-packaging-testing-and-release-prd.md`](docs/prd/05-packaging-testing-and-release-prd.md) — package, tests, release gates.

## Source provenance

This repo consolidates:

- Base Codex canonical PRD from `~/Profiles/docs/superpowers/specs/2026-06-07-markdown-review-comments-prd.md`.
- kid-Claude corrected v2 PRD from Profiles commit `6c1e45e`.
- kid-Claude review findings folded into the canonical Redline PRD: byte-splice
  persistence, structured thread markers, agent CLI, sub-block anchoring, and
  loopback hardening.

## MVP limitations

No list-item, table-row, or text-range comments yet; no full fuzzy reattachment;
no force-save. See the master PRD §17 for the full scope.
