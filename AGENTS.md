# Agent Instructions — Stet

Read these before implementation:

1. `docs/prd/README.md`
2. `docs/prd/00-stet-master-prd.md`
3. The granular PRD for the subsystem you are implementing.

Hard constraints:

- The Markdown file is the source of truth.
- Never full-stringify a user Markdown file to save comments; use byte splices only.
- Thread data source of truth is the structured `stet:thread` marker. Visible blockquote is generated view.
- Keep local server loopback-only and hardened.
- New shell scripts must be zsh (`#!/usr/bin/env zsh`, `.zsh`, parse-check with `zsh -n`).
