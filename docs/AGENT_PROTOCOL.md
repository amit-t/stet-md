# Stet Agent Protocol

Stet stores review threads inside Markdown files. The Markdown file is the source of truth.

## Preferred path

Use the CLI. It handles IDs, UTC timestamps, marker escaping, generated blockquote updates, backups, and byte-splice writes.

```zsh
stet list --json FILE.md
stet reply FILE.md --thread THREAD_ID --author Claude --message "I changed the section above."
stet resolve FILE.md --thread THREAD_ID --author Claude --message "Resolved by the edit above."
```

## Manual fallback

If the CLI is unavailable:

1. Do not delete `stet:thread` blocks unless Amit explicitly asks.
2. Add replies as new `messages:` entries inside the structured marker.
3. Use author `Codex`, `Claude`, `Devin`, `Agent`, or the configured name.
4. Use UTC ISO timestamps ending in `Z`.
5. Do not treat the generated blockquote as source of truth.
6. If the comment is addressed by a document edit, reply in the thread explaining the edit.
7. Resolve only when the requested change is complete.
8. If unsure, leave the thread open and ask in the thread.

## Marker safety

Message bodies containing `--` or `-->` must be encoded. The CLI does this automatically in the structured marker and decodes them losslessly when reading threads.
