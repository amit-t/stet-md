# Redline Release Notes

## 0.1.0 MVP

### Included

- `redline-md` npm package metadata.
- `redline` binary and `rl` alias.
- `redline FILE.md` local loopback review server.
- Browser UI for heading, paragraph, and document-level comments.
- Thread reply, resolve, and reopen flows.
- `redline list --json`, `reply`, `resolve`, `reopen`, and MVP `comment` helper.
- Byte-splice persistence with backups under `.redline/backups/`.
- Loopback hardening: token cookie, Host validation, CSP, no-referrer, remote resource blocking.
- CI scripts for typecheck, unit/server/security/browser smoke, and package smoke gates.

### MVP limitations

- No list-item comments.
- No table-row comments.
- No text-range comments yet; selected text becomes quoted context only in the UI layer.
- No fuzzy anchor matching beyond adjacency and exact source-hash matching.
- No force-save on conflict.
- No hosted sync, telemetry, multi-user live collaboration, or browser extension.
