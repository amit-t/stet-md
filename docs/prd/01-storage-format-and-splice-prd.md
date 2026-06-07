# Redline PRD 01 — Storage Format and Byte-Splice Persistence

## Purpose

Define and implement Redline's core storage contract: review threads live inside the Markdown file, but saving a thread never rewrites unrelated Markdown bytes.

This subsystem is the product's foundation. Browser UI and agent CLI are only safe if this layer preserves user documents exactly.

## Core requirements

1. Parse Markdown source into blocks with source byte ranges.
2. Parse `redline:thread` blocks into structured thread objects.
3. Generate a visible Markdown blockquote from structured thread data.
4. Insert new thread blocks after eligible target blocks.
5. Replace existing thread blocks when messages or status change.
6. Apply edits as byte splices only.
7. Preserve every byte outside splice ranges exactly.

## On-disk format

Thread block:

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
> **Amit** · 2026-06-07 20:30 IST
>
> This section needs a goal about agents responding inside the file.
<!-- /redline:thread -->
```

Structured marker is source of truth. Visible blockquote is generated view.

## Target model

MVP target kinds:

- `document`
- `heading`
- `paragraph`

Post-MVP target kinds:

- `code_block`
- `sub_block` with `intraBlock.kind` of `list_item`, `table_row`, or `text_range`

MVP must not insert comments inside lists or tables.

## Byte-splice save algorithm

1. Read original file as bytes.
2. Detect BOM, line ending style, and final newline state.
3. Parse Markdown AST with source positions.
4. Find existing Redline thread block ranges.
5. Generate replacement bytes for new/updated thread blocks using the file's existing line ending style.
6. Sort splice operations by descending start offset.
7. Apply splices to original bytes.
8. Write temp file in same directory.
9. Reparse temp bytes.
10. Replace original atomically only after validation.

## Escaping rule

The marker body is inside an HTML comment. Message bodies containing `-->` or unsafe `--` sequences must be encoded in structured data so they cannot close the comment early. Tests must prove round-trip of a message body containing `-->`.

## Anchor matching MVP

1. Physical adjacency + source hash match = attached.
2. Physical adjacency + source hash mismatch = attached with `content drifted` warning.
3. Exact source hash elsewhere = reattached.
4. No match = orphan.

No fuzzy matching in MVP.

## Acceptance criteria

- New heading comment inserts after heading line.
- New paragraph comment inserts after paragraph block.
- Existing thread update replaces only that thread block.
- Visible blockquote regenerates from structured marker.
- Parser ignores generated blockquote as data source.
- Message containing `-->` round-trips safely.
- LF, CRLF, BOM, final newline, trailing spaces, list markers, reference links, and paragraph wrapping outside splice ranges remain byte-identical.
- Malformed marker reports line/range and preserves raw content.
