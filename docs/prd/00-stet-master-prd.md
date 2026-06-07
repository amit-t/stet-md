# Stet — Markdown Review Comments Utility — Thesis and PRD

- **Date:** 2026-06-07
- **Revision:** v2, with kid-Claude architecture review incorporated
- **Status:** Draft thesis / product requirements document
- **Name:** **Stet** — threaded review comments that live inside the Markdown
- **GitHub repo:** `stet` (standalone; not part of this `Profiles` dotfiles repo)
- **npm package:** `stet` (bare `stet` is taken by a stale package)
- **Binary:** `stet` (alias `rl`) — e.g. `stet prd.md`
- **On-disk marker token:** `stet:thread` · thread-ID prefix `stt_` · state dir `.stet/`
- **Audience:** Amit, Codex/Claude/Devin agents, future implementer
- **Related tools:** `mdview` / `mdv` browser preview, `mdvc` cMUX preview

---

## 1. Thesis

Markdown review should be a portable conversation, not a web-app silo.

A human should be able to open a Markdown file in a local browser, comment on exact sections, save, and hand the same Markdown file back to an AI agent. The agent should see the comments in plain text, respond in the same threads, and hand the same file back. Reopening that file should restore the comment UI and all thread history without a required database, account, cloud service, or sidecar file.

The Markdown file remains the source of truth. The browser is only the review surface.

This is closer to “Google Docs comments for Markdown, but stored inside the Markdown itself” than to a generic Markdown previewer. Existing `mdview` proves the “open Markdown in browser” behavior. This feature adds a local write-capable review loop: parse Markdown, render it, attach comments to document blocks, persist those comments back into readable Markdown, and rehydrate threads on the next open.

The central design constraint: **never rewrite the whole Markdown file.** Comment saves must be surgical byte splices into the original file so normal Markdown formatting, line wrapping, reference links, list markers, line endings, BOM, and final newline remain unchanged.

---

## 2. Problem

AI agents often create PRDs, plans, specs, README changes, and design docs. Human review usually happens in one of four weak forms:

1. Free-form chat feedback: easy to write, hard for the agent to map back to exact sections.
2. Manual Markdown edits: precise, but comments and discussion clutter the document inconsistently.
3. Google Docs / Notion comments: good UX, but not portable back to the agent as a Markdown artifact.
4. GitHub review comments: good for code review, awkward before a PR or outside a repository diff.

Need a small local utility that keeps review context next to the artifact the agent already understands: the Markdown file.

---

## 3. Target user and primary use case

### Primary user

Amit reviewing AI-generated Markdown artifacts: PRDs, implementation plans, specs, README drafts, strategy docs, and design docs.

### Primary workflow

1. Agent writes `prd.md`.
2. Amit runs:

   ```zsh
   stet prd.md
   ```

3. Browser opens a rendered Markdown view.
4. Amit double-clicks a heading or paragraph and writes a comment.
5. Amit saves.
6. `prd.md` now contains machine-readable, human-readable comment threads.
7. Amit gives `prd.md` back to the agent: “Look at the comments and let’s discuss.”
8. Agent replies through `stet reply` or, as fallback, by editing the structured thread marker.
9. Amit runs `stet prd.md` again and sees the full thread UI restored.

---

## 4. Product goals

1. **Open Markdown in a browser.** Match the simplicity of `mdview README.md`.
2. **Support block-level comments first.** Double-click a heading or paragraph and add a comment.
3. **Persist comments into the same Markdown file.** No required sidecar, database, cloud sync, or account.
4. **Keep diffs minimal.** Save operations must splice thread blocks into the original bytes, not stringify the whole Markdown AST.
5. **Make comments clear to AI agents.** The raw Markdown must expose target context, author, UTC timestamp, status, and message history.
6. **Let agents respond safely.** Provide CLI commands agents can call instead of requiring byte-perfect hand edits.
7. **Restore threads on reopen.** The browser reads embedded thread blocks and displays them next to related content.
8. **Preserve user trust.** Saving should be explicit, diffable, reversible, and conflict-aware.

---

## 5. Non-goals for MVP

1. No multi-user real-time collaboration.
2. No hosted service.
3. No browser extension.
4. No WYSIWYG Markdown editor.
5. No arbitrary pixel-coordinate annotations.
6. No full GitHub PR review clone.
7. No text-range comments inside paragraphs.
8. No table-row or list-item comments in MVP.
9. No full fuzzy reattachment engine in MVP.
10. No sidecar as source of truth. Transient caches are allowed, but the Markdown file is authoritative.

---

## 6. Recommended product shape

Build this as a new standalone utility first: **`stet`** with alias **`rl`**. Ship it as its own project/package, not as a permanent feature inside this `Profiles` dotfiles repo.

Do not force it into the existing single-file `mdview` script immediately. `mdview` is a lightweight preview tool. Review comments require a local server, write endpoints, AST positions, byte-splice persistence, save conflict handling, UI state, and tests across file mutation. That is a different complexity class.

Recommended relationship:

- `mdview`: fast read-only Markdown preview.
- `mdvc`: cMUX native preview wrapper.
- `stet` / `rl`: write-capable Markdown review and comment threading.
- Later: `mdview --review file.md` can delegate to `stet` if installed.

This avoids bloating `mdview` while keeping user ergonomics familiar.

---

## 7. UX requirements

### 7.1 Launch

```zsh
stet path/to/file.md
rl path/to/file.md
stet --app "Google Chrome" docs/prd.md
stet --no-open docs/prd.md
```

Default behavior:

1. Resolve Markdown file to an absolute, canonical path.
2. Serve only that exact selected file and bundled assets; do not expose parent-directory browsing.
3. Start a local server bound to `127.0.0.1` on a random available port.
4. Generate a session token stored in an HTTP-only same-site cookie, not in the URL.
5. Open browser to `http://127.0.0.1:<port>/`.
6. Watch the file for changes and show a conflict banner when a safe auto-reconcile is not possible.

### 7.2 Review surface

The page has three main zones:

1. **Rendered Markdown body** — GitHub-like typography, stable heading anchors, syntax highlighting.
2. **Comment gutter / side panel** — thread cards aligned to target blocks.
3. **Top bar** — file name, dirty state, save button, reload button, open thread count, rendering warnings.

### 7.3 Add comment

MVP interaction:

- Double-click a heading or paragraph to open a comment composer.
- Hovering an eligible block shows a small `+` comment affordance in the gutter.
- `c` opens a comment on the currently focused eligible block.
- Selecting text within a block and pressing `c` still creates a block-level comment, but stores the selection as quoted context.
- Document-level comment button supports feedback that is not tied to one section.

Composer fields:

- Message textarea.
- Author default from `$USER`, git config user name, or explicit `--author`.
- Save / cancel.

Draft protection:

- Unsaved composer text is cached in `localStorage` for the active file/session.
- File-watch reload does not discard an open composer or staged comments; it shows a conflict banner instead.

### 7.4 Edit and resolve

MVP must support:

- Edit own unsaved draft before saving.
- Save all staged comments to disk.
- Mark thread as `open` or `resolved`.
- Show resolved threads collapsed by default.

Later versions can support editing persisted historical comments, deleting threads, re-anchoring orphaned threads, and reaction metadata.

### 7.5 Reopen

When reopened:

- Existing thread markers are parsed.
- Threads appear beside the correct target when possible.
- Threads whose target text changed are flagged as “content drifted” if physical adjacency still matches but hash does not.
- Orphaned threads appear in a “Needs re-attach” panel with last known target context.
- Raw thread blocks remain in the Markdown even if the UI cannot reattach them.

---

## 8. Persistence model

### 8.1 Principle

Persist review threads as readable Markdown blocks bracketed by machine-readable HTML comments.

Reason:

- AI agents can read and modify the thread text without special tooling.
- Markdown renderers still show useful context if opened without `stet`.
- The utility can parse exact thread boundaries reliably.
- Git diffs remain understandable.

### 8.2 Hard constraint: splice, do not stringify

The app may use a Markdown AST to discover source positions and render HTML. It must not use an AST stringifier to write the whole file.

Save algorithm writes by byte offsets:

1. Read original bytes.
2. Parse AST with source positions.
3. Compute insertion/replacement ranges for thread blocks.
4. Apply byte splices from the end of the file toward the beginning.
5. Preserve untouched bytes exactly.
6. Preserve BOM, line endings, final newline, trailing spaces, reference-link formatting, list markers, and wrapping.

This prevents a “comment save” from becoming a full-document formatter.

### 8.3 Thread placement

Default placement:

- Heading target: insert after the heading line and any immediately following existing thread blocks for that heading.
- Paragraph target: insert after the paragraph block.
- Code block target: post-MVP unless source positions are reliable; if enabled, insert after the fenced block.
- Document-level target: store in a small appendix region near the end of the file.

Avoid inline insertion inside Markdown constructs that can break rendering:

- No MVP insertion between list items.
- No MVP insertion inside GFM tables or after individual table rows.
- Later sub-block targets attach after the containing block and store an `intra_block` locator.

### 8.4 Structured source + generated visible view

The structured marker is the source of truth. The visible blockquote is generated from the marker for humans and agents reading normal Markdown.

Parser rule:

- Read thread metadata and messages from the opening `stet:thread` comment.
- Do not parse messages from the blockquote as authoritative data.
- If the blockquote diverges, regenerate it from structured data on save and surface a warning.
- If the structured marker is malformed, show the raw block as broken and do not guess silently.

### 8.5 Thread block format

Use this Markdown shape:

```markdown
<!-- stet:thread
version: 1
id: stt_20260607_150015_7f3a9c
status: open
created_at: 2026-06-07T15:00:15Z
updated_at: 2026-06-07T15:00:15Z
target:
  kind: heading
  heading_path:
    - Product goals
  block_ordinal: 0
  source_hash: sha256:4e2f...
  quote: Product goals
messages:
  - author: Amit
    created_at: 2026-06-07T15:00:15Z
    body: |-
      This section needs a goal about agents responding inside the file, not just reading comments.
-->
> [!NOTE]
> **Review thread `stt_20260607_150015_7f3a9c` — open**
>
> **Amit** · 2026-06-07 20:30 IST
>
> This section needs a goal about agents responding inside the file, not just reading comments.
<!-- /stet:thread -->
```

Agent reply after `stet reply`:

```markdown
<!-- stet:thread
version: 1
id: stt_20260607_150015_7f3a9c
status: open
created_at: 2026-06-07T15:00:15Z
updated_at: 2026-06-07T15:32:44Z
target:
  kind: heading
  heading_path:
    - Product goals
  block_ordinal: 0
  source_hash: sha256:4e2f...
  quote: Product goals
messages:
  - author: Amit
    created_at: 2026-06-07T15:00:15Z
    body: |-
      This section needs a goal about agents responding inside the file, not just reading comments.
  - author: Claude
    created_at: 2026-06-07T15:32:44Z
    body: |-
      Agreed. I added that as goal 6 and will treat the thread block as the response channel.
-->
> [!NOTE]
> **Review thread `stt_20260607_150015_7f3a9c` — open**
>
> **Amit** · 2026-06-07 20:30 IST
>
> This section needs a goal about agents responding inside the file, not just reading comments.
>
> **Claude** · 2026-06-07 21:02 IST
>
> Agreed. I added that as goal 6 and will treat the thread block as the response channel.
<!-- /stet:thread -->
```

Notes:

- Store timestamps in UTC; display them in local time.
- Use `[!NOTE]` instead of a non-standard `[!COMMENT]` alert.
- Include `version: 1` from day one for future migrations.
- Serializer must HTML-comment-escape problematic marker body sequences such as `--` and decode them on parse.

### 8.6 Why not pure HTML comments?

Pure hidden comments are too easy for humans to miss and too easy for agents to ignore. The structured data should be machine-safe, but the conversation should also be visible as normal Markdown.

### 8.7 Why not sidecar JSON?

Sidecars violate the core workflow. If Amit gives only `prd.md` to the agent, comments disappear. JSON can be useful as a cache or export, not as the authoritative storage.

---

## 9. Anchoring model

Anchors must survive moderate edits. Line numbers alone are not enough.

Each thread stores:

1. `id` — unique thread ID.
2. `target.kind` — `document`, `heading`, `paragraph`, or later `code_block` / sub-block kinds.
3. `target.heading_path` — heading hierarchy containing the target.
4. `target.block_ordinal` — ordinal among comparable blocks in that section.
5. `target.source_hash` — hash of normalized target text at creation time.
6. `target.quote` — short quoted context shown to agents and used for later fuzzy matching.
7. `target.intra_block` — post-MVP locator for list items, table rows, and text ranges.
8. Physical placement — the thread block sits directly after the target or in the document-comment appendix.

MVP reattachment algorithm:

1. If thread block is physically adjacent to a plausible target and hash still matches, attach there.
2. If physical adjacency exists but hash differs, attach but show “content drifted.”
3. Else find exact `source_hash` match in the current AST.
4. Else mark thread orphaned and keep it in the raw file.

Post-MVP reattachment adds heading-path + ordinal and fuzzy quote matching. MVP should not hide uncertainty behind overconfident fuzzy matches.

Hash normalization must be defined and tested:

- Normalize line endings to `\n` for hash input only.
- Trim leading/trailing blank lines for block hash input.
- Preserve internal whitespace and Markdown markup.
- Hash rendered text later only if source-hash matching proves too brittle.

---

## 10. Agent collaboration protocol

The utility must publish a short protocol that agents can follow with or without running the app.

### 10.1 Blessed path: CLI writes

Agents should prefer CLI commands because the CLI supplies current time, IDs, escaping, byte splices, and conflict checks.

MVP agent commands:

```zsh
stet list --json FILE.md
stet reply FILE.md --thread stt_20260607_150015_7f3a9c --author Claude --message "Agreed. I changed goal 6."
stet resolve FILE.md --thread stt_20260607_150015_7f3a9c --author Claude --message "Resolved by the edit above."
```

Post-MVP agent commands:

```zsh
stet comment FILE.md --target heading:"Product goals" --author Claude --message "Question about this section."
stet strip-comments FILE.md --output clean.md
stet export-comments FILE.md --format json
```

### 10.2 Fallback path: manual raw Markdown edit

If CLI is unavailable, agents may edit the `messages:` list inside the `stet:thread` marker.

Rules for agents:

1. Do not delete `<!-- stet:thread ... -->` blocks unless explicitly asked.
2. Add replies as new `messages:` entries inside the marker.
3. Use author `Agent`, `Codex`, `Claude`, or a configured name.
4. Use UTC ISO 8601 timestamps ending in `Z`.
5. If the comment is addressed by a document edit, add a response explaining the edit.
6. If the thread is complete, change `status: open` to `status: resolved` and update `updated_at`.
7. Do not edit the generated visible blockquote by hand unless also updating structured data.
8. If unsure, leave the thread open and ask in the thread.

This protocol should be included in `README.md`, `docs/AGENT_PROTOCOL.md`, and `stet --print-agent-protocol`.

---

## 11. File write behavior

Saving must be explicit and safe.

### 11.1 Default save

On Save:

1. Read current file bytes from disk.
2. Check file hash against the version loaded in the browser.
3. If unchanged, apply thread insertions/updates by byte splice.
4. Write to a temp file in the same directory.
5. Maintain backups under `.stet/backups/`.
6. Ensure `.stet/.gitignore` contains `*` so backups and transient files do not leak into commits.
7. Atomic rename temp file over original.
8. Reparse saved file and confirm every written thread is readable.
9. Show “Saved” only after validation passes.

### 11.2 External modifications

If file changed while browser is open:

- Do not blindly overwrite.
- Show conflict banner.
- Offer:
  1. Reload and reapply unsaved comments when anchors still match.
  2. Save to copy.
  3. Show raw pending patch.

MVP can implement option 1 and option 2. Force save should not ship until patch preview and tests are solid.

### 11.3 Multiple writers

MVP should detect two `stet` instances on one file and warn. Use a lock file under `.stet/locks/` containing PID, hostname, started-at timestamp, and file hash. If the PID is gone or the lock mtime is stale, show a recoverable stale-lock warning. Last-write-wins behavior is unacceptable without a warning.

---

## 12. Rendering and parsing

### 12.1 Requirement

The implementation needs source positions. The app must know which rendered DOM block maps to which Markdown source byte range.

### 12.2 Recommended implementation stack

Use a TypeScript local-server app for the first serious implementation.

Suggested shape:

- CLI: Node.js TypeScript, distributed as an npm package and later as a bundled executable.
- Server: small HTTP server on `127.0.0.1`.
- Markdown parser: unified/remark-compatible parser with positional AST support.
- Renderer: remark/rehype pipeline to HTML, with custom data attributes for block IDs.
- Persistence: custom byte-splice writer, not remark stringification.
- Frontend: small vanilla TypeScript app; no heavy SPA framework for MVP.
- Tests: unit tests for parser/persistence first; browser tests after the save loop is reliable.

Reasoning:

- Source positions and AST transforms matter more than raw startup speed.
- JavaScript ecosystem has strong Markdown AST tooling.
- Browser UI and server code can share thread schema types.
- TypeScript is the right first implementation; Go/Rust can be reconsidered only if packaging becomes the dominant constraint.

---

## 13. System architecture

```text
stet CLI
  ├─ resolves file path
  ├─ starts local review server
  ├─ opens browser
  └─ exposes non-browser agent commands: list/reply/resolve

Local review server
  ├─ GET /                 -> review UI shell
  ├─ GET /api/document     -> rendered HTML + parsed thread model
  ├─ POST /api/comments    -> stage new comment/reply/resolve event
  ├─ POST /api/save        -> byte-splice threads into Markdown file
  ├─ GET /api/patch        -> raw pending patch preview
  └─ GET /events           -> file change events

Markdown engine
  ├─ parse Markdown to AST with source positions
  ├─ strip/parse stet thread blocks from source bytes
  ├─ assign stable block IDs
  ├─ render body HTML with data-stet-target IDs
  ├─ associate threads to targets
  ├─ generate visible thread blockquotes from structured marker data
  └─ compute byte-splice edits for inserts/replacements

Browser UI
  ├─ displays rendered Markdown
  ├─ handles double-click / gutter comment actions
  ├─ shows side-panel threads
  ├─ caches unsaved composer drafts
  ├─ stages unsaved changes
  ├─ previews patch when needed
  └─ sends save request
```

---

## 14. CLI requirements

MVP commands:

```zsh
stet FILE.md
stet --author "Amit" FILE.md
stet --app "Google Chrome" FILE.md
stet --port 43117 FILE.md
stet --no-open FILE.md
stet list --json FILE.md
stet reply FILE.md --thread THREAD_ID --author Claude --message "..."
stet resolve FILE.md --thread THREAD_ID --author Claude --message "..."
stet --print-agent-protocol
stet --version
stet --help
```

Later commands:

```zsh
stet --export-comments json FILE.md
stet --strip-comments FILE.md
stet --list-comments FILE.md
stet --storage inline|appendix FILE.md
stet --readonly FILE.md
stet comment FILE.md --target heading:"Product goals" --author Amit --message "..."
```

---

## 15. Security and privacy requirements

1. Bind only to `127.0.0.1` by default.
2. Use a random session token in an HTTP-only same-site cookie or custom header, not a query string.
3. Reject requests without token.
4. Validate `Host` header; reject anything except `127.0.0.1:<port>` and approved localhost forms.
5. Send `Referrer-Policy: no-referrer`.
6. Send a restrictive Content Security Policy.
7. Block remote resource loads by default; remote images in reviewed Markdown can leak file-review activity.
8. Only serve the selected file and bundled assets.
9. Do not expose arbitrary filesystem read endpoints.
10. HTML-escape raw Markdown when embedding in page state.
11. Sanitize rendered HTML unless the user explicitly enables unsafe HTML.
12. Never execute scripts from the Markdown document.
13. Show clear warning if unsafe rendering mode is enabled.
14. No telemetry.

---

## 16. Data model

Thread:

```ts
type ReviewThread = {
  version: 1;
  id: string;
  target: ReviewTarget;
  status: "open" | "resolved";
  createdAt: string; // UTC ISO 8601
  updatedAt: string; // UTC ISO 8601
  messages: ReviewMessage[];
};
```

Target:

```ts
type ReviewTarget = {
  kind: "document" | "heading" | "paragraph" | "code_block" | "sub_block";
  headingPath: string[];
  blockOrdinal: number;
  sourceHash: string;
  quote: string;
  intraBlock?: {
    kind: "list_item" | "table_row" | "text_range";
    ordinal?: number;
    startOffset?: number;
    endOffset?: number;
  };
};
```

Message:

```ts
type ReviewMessage = {
  author: string;
  createdAt: string; // UTC ISO 8601
  bodyMarkdown: string;
  editedAt?: string; // UTC ISO 8601
};
```

The on-disk marker is a strict YAML subset. Parser errors must include thread ID and line range when available.

---

## 17. MVP scope

MVP should deliver one complete loop and avoid fake completeness.

In scope:

1. Open a local Markdown file in browser.
2. Render headings, paragraphs, lists, blockquotes, and code blocks.
3. Double-click a heading or paragraph and write a comment.
4. Save comment into the same Markdown file as an inline thread block using byte splices.
5. Reopen the same file and see the thread restored beside the target.
6. Run `stet list --json FILE.md` and see the thread.
7. Run `stet reply FILE.md --thread ID --author Claude --message "..."`.
8. Reopen and see the CLI-added reply in the browser thread.
9. Mark thread resolved through browser or CLI and save status back to Markdown.
10. Detect whole-file external modification before overwrite.
11. Provide agent protocol documentation.
12. Preserve untouched bytes exactly across save.

Out of MVP:

1. Table-row comments.
2. List-item comments.
3. Text-range comments.
4. Full fuzzy reattachment.
5. Force-save.
6. Fancy patch UI.
7. GitHub import/export.
8. cMUX integration.

This MVP is still enough for AI PRD review.

---

## 18. Post-MVP roadmap

1. Text-range comments within paragraphs.
2. List-item and table-row comments using `intra_block` locators.
3. Suggested edits / patch blocks.
4. Appendix storage mode.
5. `mdview --review` delegation.
6. cMUX integration: `mdvc --review` or `cmux markdown review`.
7. Import/export GitHub review comments.
8. Search/filter threads.
9. Keyboard-first review mode.
10. Multi-file review session for PRDs split across docs.
11. Agent handoff bundle: original file, comments summary, unresolved-only excerpt.
12. MCP server backed by the same list/reply/resolve operations.

---

## 19. Testing and verification strategy

### 19.1 Unit tests

Parser tests:

- Parses zero-thread Markdown.
- Parses one structured thread after heading.
- Parses multiple threads in one section.
- Rejects malformed opening marker with useful error.
- Preserves unknown Markdown around thread blocks.
- Extracts messages from structured marker data, not generated blockquote.
- Detects divergent generated blockquote.

Anchor tests:

- Attaches adjacent thread to target when hash matches.
- Flags adjacent thread as content-drifted when hash differs.
- Reattaches by exact hash after movement.
- Marks orphan when no target is plausible.

Splice writer tests:

- Inserts a new thread after selected heading.
- Inserts a new thread after selected paragraph.
- Replaces an existing thread block without touching surrounding bytes.
- Updates existing thread status.
- Appends a reply without destroying prior messages.
- Preserves LF files.
- Preserves CRLF files.
- Preserves BOM.
- Preserves final newline or lack of final newline.
- Preserves trailing spaces outside splice ranges.
- Does not rewrap paragraphs.
- Does not change list markers outside splice ranges.
- Does not alter reference links outside splice ranges.
- Uses golden fixtures that assert byte-for-byte equality outside expected splice ranges.
- Round-trips a comment body containing `-->` without terminating the HTML comment marker early.

CLI tests:

- `list --json` returns thread IDs, status, targets, messages.
- `reply` appends message with UTC timestamp.
- `resolve` marks status resolved and appends optional message.
- CLI refuses to save when file hash changed unexpectedly.

### 19.2 Browser tests

Browser tests begin after parser and splice writer are reliable:

- Opens fixture file.
- Double-clicks a paragraph.
- Enters comment text.
- Saves.
- Confirms file contains `stet:thread` block.
- Reloads page.
- Confirms thread appears in side panel.
- Resolves thread.
- Confirms status persisted.
- Refreshes with unsaved composer text and confirms draft recovery.

### 19.3 Manual dogfood

Use the tool on this PRD itself:

```zsh
stet docs/superpowers/specs/2026-06-07-markdown-review-comments-prd.md
```

Add review comments, save, hand the file to an agent, ask it to respond via `stet reply`, reopen.

---

## 20. Key risks and mitigations

### Risk: Markdown gets noisy

Mitigation: keep thread blocks compact, use generated `[!NOTE]` blockquotes, collapse in `stet` UI, and optionally support appendix storage later.

### Risk: Anchors break after agent rewrites document

Mitigation: combine physical adjacency, source hash, heading path, ordinal, and quote matching over time. MVP surfaces orphans and content drift clearly instead of silently dropping or misbinding threads.

### Risk: Browser cannot write local files

Mitigation: do not use pure `file://`; use a local loopback server with authenticated save endpoints.

### Risk: Existing `mdview` becomes bloated

Mitigation: build standalone `stet` first. Integrate only through delegation once stable.

### Risk: Agents corrupt thread format

Mitigation: provide `stet list/reply/resolve` CLI commands as the blessed agent path. Keep manual edits as fallback. Parser should fail loudly on malformed structured markers and preserve raw content.

### Risk: Full-document rewrites destroy trust

Mitigation: custom byte-splice writer with tests proving untouched bytes remain identical.

### Risk: Unsafe HTML or remote assets leak data

Mitigation: sanitize by default, reject unsafe host headers, use cookie/header token, no token in URL, no-referrer policy, restrictive CSP, block remote resource loads by default.

### Risk: Backups leak into git

Mitigation: store backups under `.stet/backups/` and auto-create `.stet/.gitignore` containing `*`.

### Risk: Formatters damage thread blocks

Mitigation: document formatter limitations, include `version: 1`, prefer CLI operations after formatter runs, and add repair/list commands that detect malformed or missing markers.

---

## 21. Success criteria

The first successful release is done when all of these are true:

1. Amit can run `stet prd.md` and browser opens.
2. Double-clicking a heading or paragraph opens a comment composer.
3. Saving writes a readable structured thread block into `prd.md`.
4. Save preserves all untouched bytes exactly.
5. An AI agent can read the raw Markdown and understand the comment target, timestamp, author, status, and requested discussion.
6. An AI agent can run `stet reply` to append a response.
7. Reopening `prd.md` shows the human comment and agent reply in one thread.
8. Resolved/open status survives save and reopen.
9. External file modifications are detected before overwrite.
10. Tests cover parse, splice, anchor, CLI reply, browser comment, save, and reopen flows.
11. README documents install, CLI usage, storage format, security model, formatter caveats, and agent protocol.

---

## 22. Recommendation

Build `stet` as a separate TypeScript local-server utility with Markdown-embedded structured thread blocks and byte-splice persistence.

The critical product decision is not the renderer; it is the storage contract. Once comments live in the Markdown in a predictable, agent-friendly thread format, every other surface can be swapped later: browser UI, cMUX panel, CLI summary, GitHub export, or agent-specific workflows.

Start with heading/paragraph comments, inline thread blocks, explicit Save, `list/reply/resolve` CLI, and agent protocol. Dogfood it on AI-generated PRDs immediately. Only then decide whether to fold it into `mdview`, keep it standalone, or create a shared `mdview`/`stet` family.

---

## 23. Claude architecture review incorporated

kid-Claude reviewed v1 and identified these corrections, now incorporated into v2:

1. **Splice, never stringify.** Full AST stringification would destroy minimal diffs.
2. **Do not insert inside tables/lists.** MVP limits comments to headings and paragraphs; sub-block targets wait for `intra_block` locators.
3. **Structured marker is source of truth.** Generated blockquote is display only.
4. **Agent CLI is mandatory.** `list`, `reply`, and `resolve` prevent fragile hand-edits.
5. **Use real GitHub alert syntax.** `[!NOTE]`, not `[!COMMENT]`.
6. **Defend local server better.** Cookie/header token, no-referrer, host validation, CSP, remote-resource blocking.
7. **Shrink MVP.** Keep the first useful loop tight; defer fuzzy reattach, table/list targets, and advanced patch UI.
8. **Add document-level comments.** Some feedback is global, not block-specific.
9. **Protect drafts.** Use localStorage and block unsafe auto-reloads.
10. **Preserve bytes exactly.** Tests cover CRLF, BOM, final newline, trailing spaces, and formatting noise.
