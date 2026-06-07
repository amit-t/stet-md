# Redline PRD 02 — Agent-Safe CLI

## Purpose

Give AI agents safe commands for reading and responding to review threads without hand-editing fragile Markdown markers.

The CLI is not a convenience layer. It is the primary agent protocol and future MCP backend.

## MVP commands

```zsh
redline list --json FILE.md
redline reply FILE.md --thread THREAD_ID --author Claude --message "..."
redline resolve FILE.md --thread THREAD_ID --author Claude --message "..."
redline --print-agent-protocol
```

Also supported by the browser-launch command:

```zsh
redline FILE.md
redline --author "Amit" FILE.md
redline --app "Google Chrome" FILE.md
redline --port 43117 FILE.md
redline --no-open FILE.md
```

## `list --json`

Returns deterministic JSON for agents:

```json
{
  "file": "/abs/path/prd.md",
  "threads": [
    {
      "id": "rlt_20260607_150015_7f3a9c",
      "status": "open",
      "target": {
        "kind": "heading",
        "headingPath": ["Product goals"],
        "quote": "Product goals"
      },
      "messages": [
        {
          "author": "Amit",
          "createdAt": "2026-06-07T15:00:15Z",
          "bodyMarkdown": "This section needs a goal about agents responding inside the file."
        }
      ]
    }
  ]
}
```

## `reply`

Appends one message to an existing thread.

Requirements:

- Generate UTC timestamp.
- Preserve existing status unless explicit status flag is later added.
- Use storage subsystem byte-splice writer.
- Refuse unknown thread ID.
- Refuse write if file changed during operation.
- Print updated thread ID and status.

## `resolve`

Marks a thread resolved and optionally appends a resolution message.

Requirements:

- Set `status: resolved`.
- Update `updated_at`.
- Append message if `--message` is present.
- Preserve existing messages.

## Agent protocol output

`redline --print-agent-protocol` prints fallback manual-edit instructions:

1. Do not delete `redline:thread` blocks.
2. Prefer `redline reply` and `redline resolve`.
3. If editing manually, add messages inside structured marker only.
4. Use UTC timestamps.
5. Do not hand-edit generated blockquote as source of truth.

## Post-MVP commands

```zsh
redline comment FILE.md --target heading:"Product goals" --author Amit --message "..."
redline strip-comments FILE.md --output clean.md
redline export-comments FILE.md --format json
redline doctor FILE.md
redline repair FILE.md
```

## Acceptance criteria

- `list --json` returns parseable JSON with every thread.
- `reply` appends exactly one message and preserves untouched bytes outside the thread block.
- `resolve` changes status, updates timestamp, and preserves messages.
- CLI exits nonzero with useful errors for missing file, malformed marker, unknown thread, and changed file.
- Commands work without starting the browser server.
