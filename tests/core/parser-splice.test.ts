import { describe, expect, test } from "vitest";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  appendReply,
  createThreadForTarget,
  loadReviewDocument,
  renderThreadBlock,
  resolveThread,
  saveReviewThreads,
} from "../../src/core/index.js";

function tempMarkdown(contents: string | Buffer): string {
  const dir = mkdtempSync(join(tmpdir(), "redline-core-"));
  const file = join(dir, "fixture.md");
  writeFileSync(file, contents);
  return file;
}

describe("core parser and byte-splice writer", () => {
  test("parses zero-thread Markdown and exposes heading and paragraph targets", () => {
    const file = tempMarkdown("# Title\n\nParagraph one.\n\n- list item not commentable\n");
    const doc = loadReviewDocument(file);

    expect(doc.threads).toEqual([]);
    expect(doc.targets.map((target) => [target.kind, target.quote])).toEqual([
      ["document", "Document"],
      ["heading", "Title"],
      ["paragraph", "Paragraph one."],
    ]);
  });

  test("inserts heading and paragraph comments without rewriting unrelated bytes", () => {
    const before = "# Title\n\nParagraph one has trailing spaces.  \n\nReference link stays [same][id].\n\n[id]: https://example.com\n";
    const file = tempMarkdown(before);
    const loaded = loadReviewDocument(file);
    const heading = loaded.targets.find((target) => target.kind === "heading")!;
    const paragraph = loaded.targets.find((target) => target.kind === "paragraph")!;

    const first = createThreadForTarget(heading, "Amit", "Heading note", new Date("2026-06-07T10:00:00Z"));
    const second = createThreadForTarget(paragraph, "Amit", "Paragraph note", new Date("2026-06-07T10:01:00Z"));
    saveReviewThreads(file, [first, second], { expectedHash: loaded.fileHash, now: new Date("2026-06-07T10:02:00Z") });

    const after = readFileSync(file, "utf8");
    expect(after).toContain("redline:thread");
    expect(after).toContain("Heading note");
    expect(after).toContain("Paragraph note");
    expect(after).toContain("Paragraph one has trailing spaces.  \n");
    expect(after).toContain("Reference link stays [same][id].\n\n[id]: https://example.com\n");
    expect(after.replace(/<!-- redline:thread[\s\S]*?<!-- \/redline:thread -->\n?/g, "")).toBe(before);
    expect(readFileSync(join(dirname(file), ".redline", ".gitignore"), "utf8")).toBe("*\n");
    expect(readdirSync(join(dirname(file), ".redline", "backups")).length).toBeGreaterThan(0);
  });

  test("replaces existing thread when appending reply and resolving", () => {
    const file = tempMarkdown("# Title\n\nParagraph.\n");
    const loaded = loadReviewDocument(file);
    const target = loaded.targets.find((candidate) => candidate.kind === "paragraph")!;
    const thread = createThreadForTarget(target, "Amit", "Initial", new Date("2026-06-07T10:00:00Z"));
    saveReviewThreads(file, [thread], { expectedHash: loaded.fileHash });
    const once = readFileSync(file, "utf8");

    appendReply(file, thread.id, { author: "Claude", bodyMarkdown: "Reply with --> marker", createdAt: "2026-06-07T10:03:00Z" });
    resolveThread(file, thread.id, { author: "Claude", bodyMarkdown: "Resolved", createdAt: "2026-06-07T10:04:00Z" });

    const twice = readFileSync(file, "utf8");
    expect(twice).toContain("status: resolved");
    expect(twice).toContain("body_base64:");
    expect(twice).toContain("Resolved");
    expect((twice.match(/<!-- redline:thread/g) ?? []).length).toBe(1);
    expect(twice.replace(/<!-- redline:thread[\s\S]*?<!-- \/redline:thread -->\n?/g, "")).toBe(once.replace(/<!-- redline:thread[\s\S]*?<!-- \/redline:thread -->\n?/g, ""));

    const reparsed = loadReviewDocument(file);
    expect(reparsed.threads[0].messages.map((message) => message.bodyMarkdown)).toEqual(["Initial", "Reply with --> marker", "Resolved"]);
  });

  test("preserves CRLF, BOM, final-newline state, and outside bytes", () => {
    const bom = Buffer.from([0xef, 0xbb, 0xbf]);
    const body = Buffer.from("# Title\r\n\r\nParagraph without final newline", "utf8");
    const file = tempMarkdown(Buffer.concat([bom, body]));
    const loaded = loadReviewDocument(file);
    const target = loaded.targets.find((candidate) => candidate.kind === "paragraph")!;
    const thread = createThreadForTarget(target, "Amit", "CRLF note", new Date("2026-06-07T10:00:00Z"));

    saveReviewThreads(file, [thread], { expectedHash: loaded.fileHash });

    const after = readFileSync(file);
    expect(after.subarray(0, 3)).toEqual(bom);
    const text = after.toString("utf8");
    expect(text).toContain("\r\n<!-- redline:thread\r\n");
    expect(text.endsWith("<!-- /redline:thread -->")).toBe(true);
    expect(text.replace(/<!-- redline:thread[\s\S]*?<!-- \/redline:thread -->/g, "")).toBe("﻿# Title\r\n\r\nParagraph without final newline\r\n");
  });

  test("flags adjacent changed target as content drifted on reopen", () => {
    const file = tempMarkdown("# Title\n\nParagraph.\n");
    const loaded = loadReviewDocument(file);
    const target = loaded.targets.find((candidate) => candidate.kind === "paragraph")!;
    const thread = createThreadForTarget(target, "Amit", "Initial", new Date("2026-06-07T10:00:00Z"));
    saveReviewThreads(file, [thread], { expectedHash: loaded.fileHash });
    const saved = readFileSync(file, "utf8").replace("Paragraph.", "Paragraph changed.");
    writeFileSync(file, saved);

    const reopened = loadReviewDocument(file);

    expect(reopened.threads[0].anchor?.state).toBe("content_drifted");
    expect(reopened.warnings.some((warning) => warning.kind === "content_drifted")).toBe(true);
  });

  test("flags unmatchable thread as orphan on reopen", () => {
    const target = {
      id: "fake",
      kind: "paragraph" as const,
      headingPath: ["Missing"],
      blockOrdinal: 9,
      sourceHash: "sha256:missing",
      quote: "Missing paragraph",
      byteRange: { start: 0, end: 0 },
      lineStart: 1,
      lineEnd: 1,
    };
    const thread = createThreadForTarget(target, "Amit", "Orphan", new Date("2026-06-07T10:00:00Z"));
    const file = tempMarkdown(`${renderThreadBlock(thread, "\n")}\n\n# Title\n\nReal paragraph.\n`);

    const reopened = loadReviewDocument(file);

    expect(reopened.threads[0].anchor?.state).toBe("orphan");
    expect(reopened.warnings.some((warning) => warning.kind === "orphaned_thread")).toBe(true);
  });

  test("ignores redline marker examples inside fenced code blocks", () => {
    const file = tempMarkdown("# Title\n\n```markdown\n<!-- redline:thread\nversion: 1\nid: rlt_example\nstatus: open\ncreated_at: 2026-06-07T10:00:00Z\nupdated_at: 2026-06-07T10:00:00Z\ntarget:\n  kind: document\n  heading_path:\n    []\n  block_ordinal: 0\n  source_hash: sha256:example\n  quote: Document\nmessages:\n  - author: Amit\n    created_at: 2026-06-07T10:00:00Z\n    body: |-\n      Example only\n-->\n> [!NOTE]\n<!-- /redline:thread -->\n```\n\nReal paragraph.\n");
    const doc = loadReviewDocument(file);

    expect(doc.threads).toEqual([]);
    expect(doc.errors).toEqual([]);
    expect(doc.targets.some((target) => target.quote === "Real paragraph.")).toBe(true);
  });

  test("malformed marker reports line/range and leaves raw content visible to caller", () => {
    const file = tempMarkdown("# Title\n\n<!-- redline:thread\nid: broken\nstatus: open\n-->\n> bad\n<!-- /redline:thread -->\n");
    const doc = loadReviewDocument(file, { allowMalformed: true });

    expect(doc.errors).toHaveLength(1);
    expect(doc.errors[0].message).toMatch(/version/i);
    expect(doc.errors[0].lineStart).toBeGreaterThan(0);
    expect(doc.rawThreadBlocks[0].raw).toContain("id: broken");
  });

  test("detects divergent generated blockquote but trusts structured marker", () => {
    const target = {
      id: "t1",
      kind: "document" as const,
      headingPath: [],
      blockOrdinal: 0,
      sourceHash: "sha256:doc",
      quote: "Document",
      byteRange: { start: 0, end: 0 },
      lineStart: 1,
      lineEnd: 1,
    };
    const thread = createThreadForTarget(target, "Amit", "Structured truth", new Date("2026-06-07T10:00:00Z"));
    const block = renderThreadBlock(thread, "\n").replace("> Structured truth", "> Generated lie");
    const file = tempMarkdown(`# Title\n\n${block}\n`);

    const doc = loadReviewDocument(file);

    expect(doc.threads[0].messages[0].bodyMarkdown).toBe("Structured truth");
    expect(doc.warnings.some((warning) => warning.kind === "divergent_generated_blockquote")).toBe(true);
  });
});
