import type { ReviewThread, ReviewMessage } from "./types.js";

/**
 * Generate the visible Markdown blockquote shown to humans and to agents
 * reading raw Markdown. This is a DERIVED view: the structured marker is the
 * source of truth and the parser never reads authoritative data from here.
 *
 * Timestamps render in UTC for deterministic output; the browser UI may
 * re-localize them at display time.
 */

/** `2026-06-07 15:00 UTC` from a UTC ISO 8601 string. */
export function displayTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ` +
    `${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`
  );
}

/**
 * Neutralize HTML-comment delimiters so a message body rendered into the
 * blockquote can never collide with the `<!-- /stet:thread -->` scan that
 * finds block boundaries. Display-only; the structured body stays exact.
 */
function neutralize(text: string): string {
  return text.replace(/<!--/g, "&lt;!--").replace(/-->/g, "--&gt;");
}

function quoteBody(body: string): string[] {
  return neutralize(body)
    .split("\n")
    .map((line) => (line === "" ? ">" : `> ${line}`));
}

function messageLines(msg: ReviewMessage): string[] {
  return [
    `> **${msg.author}** · ${displayTime(msg.createdAt)}`,
    ">",
    ...quoteBody(msg.bodyMarkdown),
  ];
}

export function renderBlockquote(thread: ReviewThread): string {
  const lines: string[] = [
    "> [!NOTE]",
    `> **Review thread \`${thread.id}\` — ${thread.status}**`,
  ];
  for (const msg of thread.messages) {
    lines.push(">");
    lines.push(...messageLines(msg));
  }
  return lines.join("\n");
}
