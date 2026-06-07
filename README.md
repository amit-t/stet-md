# Stet

Stet is a local-first Markdown review utility. It opens one Markdown file in a loopback browser UI, lets humans add threaded review comments, saves those threads back into the same Markdown file, and lets AI agents reply through a safe CLI.

- npm package: `@amit-t/stet`
- binaries: `stet`, `s`; legacy aliases: `redline`, `rl`
- marker: `stet:thread`
- thread IDs: `stt_...`
- transient state: `.stet/`

## Install

### Install from Amit's local checkout

Use this when the repo already exists at `/Users/amittiwari/Projects/Tools-Utilities/stet`:

```zsh
cd /Users/amittiwari/Projects/Tools-Utilities/stet
pnpm install
pnpm run build
pnpm link --global
rehash
stet --version
s --help
```

If `pnpm link --global` says the global bin directory is not configured, run `pnpm setup`, restart the shell, then repeat `pnpm link --global`.

### No-clone one-shot usage after publish

After `stet` is published to npm, anyone can run Stet without cloning this repo:

```zsh
npx @amit-t/stet@latest README.md
# or
pnpm dlx @amit-t/stet README.md
```

`npx`/`pnpm dlx` downloads the package to a temporary tool cache, runs the `stet` binary, and leaves no project dependency behind. Pass the same flags you would pass to `stet`:

```zsh
npx @amit-t/stet@latest --author "Amit" --app "Google Chrome" docs/prd/00-stet-master-prd.md
pnpm dlx @amit-t/stet --no-open --port 43117 docs/prd/00-stet-master-prd.md
```

### Persistent install after publish

For a permanent terminal command without cloning the repo:

```zsh
pnpm add --global @amit-t/stet
# or, if you prefer npm for global tools:
npm install -g @amit-t/stet

stet --version
stet README.md
```

## Quick start

```zsh
stet README.md
# or
s README.md
```

Useful launch flags:

```zsh
stet --author "Amit" README.md
stet --app "Google Chrome" README.md
stet --port 43117 README.md
stet --no-open README.md
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
stet list --json FILE.md
stet reply FILE.md --thread stt_... --author Claude --message "I updated the paragraph above."
stet resolve FILE.md --thread stt_... --author Claude --message "Resolved by the edit above."
stet --print-agent-protocol
```

A helper exists for smoke tests and scripts:

```zsh
stet comment FILE.md --target paragraph:0 --author Amit --message "Please tighten this."
```

Full protocol: [`docs/AGENT_PROTOCOL.md`](docs/AGENT_PROTOCOL.md).

## Storage format

Threads are stored inline as structured HTML-comment markers plus a generated visible blockquote:

```markdown
<!-- stet:thread
version: 1
id: stt_20260607_150015_7f3a9c
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
> **Review thread `stt_20260607_150015_7f3a9c` — open**
>
> **Amit** · 2026-06-07 15:00 UTC
>
> This needs a clearer agent workflow.
<!-- /stet:thread -->
```

The structured marker is the source of truth. The blockquote is regenerated from marker data on save. Message bodies containing unsafe `--` sequences are escaped in the structured marker so they cannot terminate the HTML comment early, then decoded losslessly when Stet parses the thread.

## Write safety and formatter caveats

Stet saves by byte splices only. It does not stringify or reformat the whole Markdown document. Tests cover preservation of LF, CRLF, BOM, final-newline state, trailing spaces, list markers, reference links, and paragraph wrapping outside expected splice ranges.

Formatter caveat: if an external formatter rewrites the file while Stet is open, Stet detects the file hash change and blocks save. Reload before saving staged comments. MVP intentionally has no force-save.

Backups are written before replacement:

```text
.stet/
  .gitignore      # contains *
  backups/
  locks/
```

## Security model

Stet is local-only and has no telemetry.

- Binds to `127.0.0.1` by default.
- Serves only the selected Markdown file and bundled UI assets.
- Uses an HttpOnly `SameSite=Strict` cookie token; missing/wrong tokens are rejected for API routes.
- Validates `Host` to reject DNS rebinding attempts.
- Sends `Referrer-Policy: no-referrer`.
- Sends restrictive CSP: self-only scripts/styles, self/data images, no objects/forms/framing.
- Escapes raw Markdown HTML by default.
- Blocks remote Markdown images/resources by default.

## Development

Stet uses pnpm for repository development. Keep `pnpm-lock.yaml` as the only package-manager lockfile.

```zsh
pnpm install
pnpm run typecheck
pnpm test
pnpm run test:packaging
pnpm run ci
pnpm run pack:dry
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
3. `stet --version`, `--help`, `--print-agent-protocol` work;
4. README documents install, usage, storage, security, formatter caveats, and agent protocol;
5. release notes list MVP limitations;
6. dogfood run against the master PRD or a byte-identical copy.

## MVP limitations

See [`docs/RELEASE_NOTES.md`](docs/RELEASE_NOTES.md). Current MVP does not support list-item, table-row, or text-range comments.
