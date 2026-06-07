# Redline Agent Protocol

How an AI agent reads and responds to review threads in a Markdown file.

`redline --print-agent-protocol` prints the short version of this document.

## Mental model

Review threads live **inside** the Markdown file, bracketed by an HTML comment
marker:

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
  source_hash: sha256:4e2f...
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

- The **structured marker** (inside `<!-- redline:thread ... -->`) is the
  single source of truth.
- The **blockquote** below it is a generated, human-readable view. It is
  regenerated from the marker on every CLI write. Do not treat it as data.

## Blessed path — use the CLI

The CLI supplies the current UTC time, generates IDs, escapes problematic
sequences, writes via byte splices (so untouched bytes stay identical), backs
the file up, and refuses to overwrite a file that changed on disk. Prefer it.

```zsh
# See every thread as deterministic JSON
redline list --json FILE.md

# Append a reply to an existing thread
redline reply FILE.md --thread THREAD_ID --author Claude --message "Agreed. Changed goal 6."

# Mark a thread resolved (optionally with a closing message)
redline resolve FILE.md --thread THREAD_ID --author Claude --message "Resolved by the edit above."

# Create a new thread on a heading / paragraph / document target
redline comment FILE.md --target heading:"Product goals" --author Claude --message "Question about this section."
```

`list --json` output:

```json
{
  "file": "/abs/path/prd.md",
  "threads": [
    {
      "id": "rlt_20260607_150015_7f3a9c",
      "status": "open",
      "createdAt": "2026-06-07T15:00:15Z",
      "updatedAt": "2026-06-07T15:00:15Z",
      "target": { "kind": "heading", "headingPath": ["Product goals"], "blockOrdinal": 0, "sourceHash": "sha256:...", "quote": "Product goals" },
      "messages": [
        { "author": "Amit", "createdAt": "2026-06-07T15:00:15Z", "bodyMarkdown": "..." }
      ]
    }
  ]
}
```

### Exit codes

| Code | Meaning |
|------|---------|
| `0`  | success |
| `1`  | runtime error — missing file, malformed marker (with line number), unknown thread id, or the file changed on disk since it was read |
| `2`  | usage error — bad flags or unknown target kind |

## Fallback path — manual marker edits

If the CLI is unavailable, edit the structured marker directly, following these
rules:

1. Do **not** delete `redline:thread` blocks unless explicitly asked.
2. Prefer `redline reply` / `redline resolve` over hand edits.
3. Add replies as new entries in the `messages:` list **inside** the marker.
4. Use UTC ISO 8601 timestamps ending in `Z`.
5. Do **not** hand-edit the generated blockquote as a source of truth; it is
   regenerated from the marker on the next CLI write.
6. To close a thread, set `status: resolved` and update `updated_at`.
7. A message body must not contain a literal `-->` (it would close the HTML
   comment early). The CLI encodes this automatically — prefer the CLI when a
   body might contain `-->` or `--`.
8. If unsure, leave the thread open and ask inside the thread.

## Anchoring

Each thread records its `target` (kind, heading path, ordinal, normalized
source hash, and a short quote). On reopen, Redline reattaches a thread by:

1. physical adjacency + matching `source_hash` → attached,
2. physical adjacency + differing hash → attached, flagged **content drifted**,
3. exact `source_hash` found elsewhere → reattached,
4. otherwise → orphan (kept in the file, surfaced for re-attach).

No fuzzy matching in the MVP: uncertainty is surfaced, never hidden.
