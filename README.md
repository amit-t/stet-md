# Redline

Redline is a local-first Markdown review utility. It opens one Markdown file in a loopback browser UI, lets humans add threaded review comments, saves those threads back into the same Markdown file, and lets AI agents reply through a safe CLI.

- npm package: `redline-md`
- binaries: `redline`, `rl`
- marker: `redline:thread`
- thread IDs: `rlt_...`
- transient state: `.redline/`

## Install

From this repository:

```zsh
npm install
npm run build
npm link
```

After publish:

```zsh
npm install -g redline-md
```

## Quick start

```zsh
redline README.md
# or
rl README.md
```

Useful launch flags:

```zsh
redline --author "Amit" README.md
redline --app "Google Chrome" README.md
redline --port 43117 README.md
redline --no-open README.md
```

The server binds to `127.0.0.1`, sets an HttpOnly `SameSite=Strict` cookie, and opens `http://127.0.0.1:<port>/`. The token is never placed in the URL.

## Browser review UI

The UI includes:

- top bar with file name, dirty/saved state, open-thread count, Save, Reload, and patch preview;
- rendered Markdown body with commentable headings and paragraphs;
- `+` affordances, double-click comments, keyboard `c` on focused blocks, and document-level comments;
- side-panel thread cards with replies, resolve/reopen controls, orphan and content-drift warnings;
- localStorage draft recovery keyed by file path and loaded file hash;
- conflict banner when the file changes on disk before save.

Resolved threads are collapsed by default. Orphaned threads appear under **Needs re-attach** and remain preserved in the Markdown file.

## Agent CLI

Agents should use CLI commands instead of hand-editing markers:

```zsh
redline list --json FILE.md
redline reply FILE.md --thread rlt_... --author Claude --message "I updated the paragraph above."
redline resolve FILE.md --thread rlt_... --author Claude --message "Resolved by the edit above."
redline --print-agent-protocol
```

A helper exists for smoke tests and scripts:

```zsh
redline comment FILE.md --target paragraph:0 --author Amit --message "Please tighten this."
```

Full protocol: [`docs/AGENT_PROTOCOL.md`](docs/AGENT_PROTOCOL.md).

## Storage format

Threads are stored inline as structured HTML-comment markers plus a generated visible blockquote:

```markdown
<!-- redline:thread
version: 1
id: rlt_20260607_150015_7f3a9c
status: open
created_at: 2026-06-07T15:00:15Z
updated_at: 2026-06-07T15:00:15Z
target:
  kind: paragraph
  heading_path:
    - Product goals
  block_ordinal: 0
  source_hash: sha256:...
  quote: Product goals
messages:
  - author: Amit
    created_at: 2026-06-07T15:00:15Z
    body: |-
      This needs a clearer agent workflow.
-->
> [!NOTE]
> **Review thread `rlt_20260607_150015_7f3a9c` — open**
>
> **Amit** · 2026-06-07 15:00 UTC
>
> This needs a clearer agent workflow.
<!-- /redline:thread -->
```

The structured marker is the source of truth. The blockquote is regenerated from marker data on save. Message bodies containing unsafe `--` sequences are stored as `body_base64:` so they cannot terminate the HTML comment early.

## Write safety and formatter caveats

Redline saves by byte splices only. It does not stringify or reformat the whole Markdown document. Tests cover preservation of LF, CRLF, BOM, final-newline state, trailing spaces, list markers, reference links, and paragraph wrapping outside expected splice ranges.

Formatter caveat: if an external formatter rewrites the file while Redline is open, Redline detects the file hash change and blocks save. Reload before saving staged comments. MVP intentionally has no force-save.

Backups are written before replacement:

```text
.redline/
  .gitignore      # contains *
  backups/
  locks/
```

## Security model

Redline is local-only and has no telemetry.

- Binds to `127.0.0.1` by default.
- Serves only the selected Markdown file and bundled UI assets.
- Uses an HttpOnly `SameSite=Strict` cookie token; missing/wrong tokens are rejected for API routes.
- Validates `Host` to reject DNS rebinding attempts.
- Sends `Referrer-Policy: no-referrer`.
- Sends restrictive CSP: self-only scripts/styles, self/data images, no objects/forms/framing.
- Escapes raw Markdown HTML by default.
- Blocks remote Markdown images/resources by default.

## Development

```zsh
npm install
npm run typecheck
npm test
npm run test:packaging
npm run ci
npm pack --dry-run
```

Test groups:

- `tests/core/` parser, anchors, thread serialization, byte-splice writer.
- `tests/server/` local server save/reopen/conflict flow.
- `tests/security/` token, Host, CSP, no-referrer, remote-resource blocking.
- `tests/browser/` browser UI smoke using a DOM-compatible runtime.
- `tests/packaging/` package metadata and built CLI smoke.

## Release gates

MVP release requires:

1. core parser/splice tests pass;
2. server, security, and browser smoke tests pass;
3. `redline --version`, `--help`, `--print-agent-protocol` work;
4. README documents install, usage, storage, security, formatter caveats, and agent protocol;
5. release notes list MVP limitations;
6. dogfood run against the master PRD or a byte-identical copy.

## MVP limitations

See [`docs/RELEASE_NOTES.md`](docs/RELEASE_NOTES.md). Current MVP does not support list-item, table-row, or text-range comments.
