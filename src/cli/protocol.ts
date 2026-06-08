/** Text for `stet --print-agent-protocol` and the docs. */
export const AGENT_PROTOCOL = `Stet.md agent protocol
======================

Stet.md review threads live inside the Markdown file, bracketed by
\`<!-- stet:thread ... -->\` markers. The structured marker is the source of
truth; the visible blockquote beneath it is a generated view.

Blessed path — use the CLI (it supplies time, IDs, escaping, byte splices, and
conflict checks):

  stet list --json FILE.md
  stet reply FILE.md --thread THREAD_ID --author NAME --message "..."
  stet resolve FILE.md --thread THREAD_ID --author NAME --message "..."

Fallback path — manual edits to the structured marker, following these rules:

  1. Do not delete \`stet:thread\` blocks unless explicitly asked.
  2. Prefer \`stet reply\` and \`stet resolve\` over hand edits.
  3. If editing manually, add replies as new entries in the \`messages:\` list
     INSIDE the structured marker only.
  4. Use UTC ISO 8601 timestamps ending in \`Z\`.
  5. Do not hand-edit the generated blockquote as a source of truth; it is
     regenerated from the structured marker on the next CLI write.
  6. To close a thread, set \`status: resolved\` and update \`updated_at\`.
  7. A message body must not contain a literal \`-->\`; the CLI encodes this
     automatically, so prefer the CLI.
  8. If unsure, leave the thread open and ask inside the thread.
`;

export const agentProtocol = AGENT_PROTOCOL;
