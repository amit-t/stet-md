# Stet.md Release Notes

## 0.1.0 MVP

### Included

- `@amit-t/stet.md` npm package metadata with `stet` and `s` binaries.
- `stet` binary and `s` alias, with `redline`/`rl` kept as legacy command aliases for migration.
- `stet FILE.md` local loopback review server.
- Browser UI for heading, paragraph, and document-level comments.
- Thread reply, resolve, and reopen flows.
- `stet list --json`, `reply`, `resolve`, `reopen`, and MVP `comment` helper.
- Byte-splice persistence with backups under `.stet/backups/`.
- Loopback hardening: token cookie, Host validation, CSP, no-referrer, remote resource blocking.
- CI scripts for typecheck, unit/server/security/browser smoke, and package smoke gates.

### MVP limitations

- No list-item comments.
- No table-row comments.
- No text-range comments yet; selected text becomes quoted context only in the UI layer.
- No fuzzy anchor matching beyond adjacency and exact source-hash matching.
- No force-save on conflict.
- No hosted sync, telemetry, multi-user live collaboration, or browser extension.
