# Redline PRD 04 — Safety, Conflicts, Drafts, Locks, and Backups

## Purpose

Protect user files and local machine while Redline runs a write-capable browser UI.

## Local server security

Requirements:

1. Bind only to `127.0.0.1` by default.
2. Never put auth token in URL.
3. Use `HttpOnly`, `SameSite=Strict` cookie or custom header.
4. Reject requests without token.
5. Validate `Host` header; reject DNS-rebinding attempts.
6. Send `Referrer-Policy: no-referrer`.
7. Send restrictive Content Security Policy.
8. Block remote resources by default.
9. Serve only selected file and bundled assets.
10. No arbitrary filesystem read endpoints.
11. Sanitize Markdown HTML by default.
12. No telemetry.

## Conflict handling

Before save:

1. Compare current file hash to loaded hash.
2. If unchanged, save normally.
3. If changed, do not overwrite.
4. Show conflict banner.
5. Offer reload-and-reapply staged comments when anchors still match.
6. Offer save-to-copy.
7. Do not ship force-save in MVP.

## Draft protection

Requirements:

- Store unsaved composer text in `localStorage` keyed by file path + session file hash.
- Do not auto-reload over open composer or staged comments.
- Show dirty state in top bar.
- Confirm before closing/reloading with unsaved comments.

## Backups

Requirements:

- Store backups under `.redline/backups/`.
- Auto-create `.redline/.gitignore` with `*`.
- Backups include timestamp and short file hash.
- Backups are created before atomic replacement.

## Locks

MVP lock file under `.redline/locks/` contains:

- PID
- hostname
- started-at timestamp
- target file absolute path
- loaded file hash

Behavior:

- Second Redline instance on same file warns.
- If PID no longer exists or lock mtime is stale, show stale-lock recovery prompt.
- Last-write-wins without warning is forbidden.

## Acceptance criteria

- Token never appears in URL.
- Requests with wrong token fail.
- Requests with hostile Host fail.
- Remote image in Markdown does not leak token through Referer.
- Changed file blocks save and shows conflict UI.
- Open composer survives refresh through localStorage.
- `.redline/.gitignore` prevents backups/locks from entering git.
- Stale lock can be recovered; active lock warns.
