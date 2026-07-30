import { describe, expect, test } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendReply,
  createCommentBySelector,
  loadReviewDocument,
} from "../../src/core/index.js";

function tempMarkdown(contents: string | Buffer): string {
  const dir = mkdtempSync(join(tmpdir(), "stet-frontmatter-"));
  const file = join(dir, "doc.md");
  writeFileSync(file, contents);
  return file;
}

const FLAT = ["---", "title: Charting doc", "created_at: 2026-07-30T08:50:52+05:30", "status: open", "---", "", "# Body", "", "Prose paragraph.", ""].join("\n");

const NESTED = [
  "---",
  "created_at: 2026-07-30T08:50:52+05:30",
  "depth: deep",
  "shortcuts:",
  '  accept_all: "accept all my recommendations"',
  "---",
  "",
  "# Body",
  "",
  "Prose paragraph.",
  "",
].join("\n");

describe("frontmatter detection", () => {
  test("hides a well-formed frontmatter block from the body and collapses it", () => {
    const doc = loadReviewDocument(tempMarkdown(FLAT));

    expect(doc.frontmatter).toBeDefined();
    expect(doc.frontmatter!.lineStart).toBe(1);
    expect(doc.frontmatter!.lineEnd).toBe(5);
    expect(doc.html).not.toMatch(/<p[^>]*>[^<]*created_at:/);
    expect(doc.html).toContain('<details class="stet-frontmatter">');
    expect(doc.html).toContain("<summary>Frontmatter</summary>");
    // The junk `<hr>` pair the frontmatter used to render as is gone.
    expect(doc.html.startsWith("<details")).toBe(true);
    expect(doc.html).not.toContain("<hr>");
  });

  test("renders flat `key: value` frontmatter as a table", () => {
    const doc = loadReviewDocument(tempMarkdown(FLAT));

    expect(doc.html).toContain("<th>Field</th><th>Value</th>");
    expect(doc.html).toContain("<tr><td>title</td><td>Charting doc</td></tr>");
    expect(doc.html).toContain("<tr><td>status</td><td>open</td></tr>");
  });

  test("renders nested frontmatter as a highlighted YAML code block, losing nothing", () => {
    const doc = loadReviewDocument(tempMarkdown(NESTED));

    expect(doc.html).toContain('<pre><code class="hljs language-yaml">');
    expect(doc.html).not.toContain("<th>Field</th>");
    expect(doc.html).toContain("accept_all");
    expect(doc.html).toContain("shortcuts");
  });

  test("strips one layer of matching quotes from table values", () => {
    const doc = loadReviewDocument(tempMarkdown('---\nmarker: "## Answer key"\n---\n\n# Body\n'));
    expect(doc.html).toContain("<tr><td>marker</td><td>## Answer key</td></tr>");
  });

  test("treats an empty frontmatter block as frontmatter", () => {
    const doc = loadReviewDocument(tempMarkdown("---\n---\n\n# Body\n"));

    expect(doc.frontmatter).toBeDefined();
    expect(doc.frontmatter!.raw).toBe("");
    expect(doc.html).toContain('<details class="stet-frontmatter">');
    expect(doc.html).not.toContain("<hr>");
  });

  test("handles CRLF frontmatter", () => {
    const doc = loadReviewDocument(tempMarkdown("---\r\ntitle: CRLF\r\n---\r\n\r\n# Body\r\n"));

    expect(doc.frontmatter!.lineEnd).toBe(3);
    expect(doc.html).toContain("<tr><td>title</td><td>CRLF</td></tr>");
    expect(doc.html).not.toMatch(/<p[^>]*>[^<]*title:/);
  });

  test("handles a BOM before the opening delimiter", () => {
    const doc = loadReviewDocument(tempMarkdown(Buffer.from("﻿---\ntitle: BOM\n---\n\n# Body\n", "utf8")));

    expect(doc.hasBom).toBe(true);
    expect(doc.frontmatter).toBeDefined();
    expect(doc.html).toContain("<tr><td>title</td><td>BOM</td></tr>");
  });
});

describe("frontmatter is never a raw-HTML passthrough", () => {
  test("escapes HTML in table keys and values", () => {
    const doc = loadReviewDocument(tempMarkdown('---\ntitle: <script>alert(1)</script>\n---\n\n# Body\n'));

    expect(doc.html).not.toContain("<script>");
    expect(doc.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  test("escapes HTML in the code-block fallback", () => {
    const doc = loadReviewDocument(tempMarkdown("---\nnested:\n  html: <details open><summary>x</summary>\n---\n\n# Body\n"));

    expect(doc.html).not.toContain("<details open>");
    expect(doc.html).not.toContain("<summary>x</summary>");
    // Highlighting wraps tokens in spans, so assert on the escaped fragments.
    expect(doc.html).toContain("&lt;details");
    expect(doc.html).toContain("&lt;/summary&gt;");
  });
});

describe("malformed or absent frontmatter is unaffected", () => {
  test("an unterminated leading `---` still renders as a thematic break plus prose", () => {
    const doc = loadReviewDocument(tempMarkdown("---\ncreated_at: 2026-07-30\ndepth: deep\n\n# Body\n"));

    expect(doc.frontmatter).toBeUndefined();
    expect(doc.html).toContain("<hr>");
    expect(doc.html).toMatch(/<p[^>]*>created_at: 2026-07-30 depth: deep<\/p>/);
  });

  test("a `---` rule below line 1 stays a thematic break", () => {
    const doc = loadReviewDocument(tempMarkdown("# Title\n\n---\n\nAfter the rule.\n"));

    expect(doc.frontmatter).toBeUndefined();
    expect(doc.html).toContain("<hr>");
    expect(doc.html).not.toContain("stet-frontmatter");
  });

  test("a file with no frontmatter parses exactly as before", () => {
    const doc = loadReviewDocument(tempMarkdown("# Title\n\nParagraph one.\n"));

    expect(doc.frontmatter).toBeUndefined();
    expect(doc.targets.map((target) => [target.kind, target.quote])).toEqual([
      ["document", "Document"],
      ["heading", "Title"],
      ["paragraph", "Paragraph one."],
    ]);
  });

  test("`***` and `___` rules at line 1 are not frontmatter", () => {
    const doc = loadReviewDocument(tempMarkdown("***\ntitle: x\n***\n\n# Body\n"));
    expect(doc.frontmatter).toBeUndefined();
    expect(doc.html).toContain("<hr>");
  });
});

describe("frontmatter and targets", () => {
  test("frontmatter lines produce no comment target and no target ordinal", () => {
    const doc = loadReviewDocument(tempMarkdown(FLAT));

    expect(doc.targets.map((target) => [target.kind, target.quote])).toEqual([
      ["document", "Document"],
      ["heading", "Body"],
      ["paragraph", "Prose paragraph."],
    ]);
    expect(doc.targets.every((target) => (target.lineStart ?? 1) > doc.frontmatter!.lineEnd || target.kind === "document")).toBe(true);
  });

  test("byte ranges stay exact: every target slices back to its source text", () => {
    const file = tempMarkdown(NESTED);
    const source = readFileSync(file);
    const doc = loadReviewDocument(file);

    // The range spans both delimiter lines, terminator included.
    expect(source.subarray(doc.frontmatter!.range.start, doc.frontmatter!.range.end).toString("utf8")).toBe(
      NESTED.slice(0, NESTED.indexOf("---", 3) + 4),
    );
    for (const target of doc.targets) {
      if (target.kind === "document" || !target.byteRange) continue;
      const slice = source.subarray(target.byteRange.start, target.byteRange.end).toString("utf8");
      expect(slice.trim().length).toBeGreaterThan(0);
      expect(slice).not.toContain("---");
    }
  });

  test("a stet:thread marker inside frontmatter is data, not a thread", () => {
    const doc = loadReviewDocument(
      tempMarkdown(
        [
          "---",
          "example: |",
          "  <!-- stet:thread",
          "  id: stt_20260607_150015_aaaaaa",
          "  -->",
          "  > example",
          "  <!-- /stet:thread -->",
          "---",
          "",
          "# Body",
          "",
        ].join("\n"),
      ),
    );

    expect(doc.threads).toEqual([]);
    expect(doc.errors).toEqual([]);
    expect(doc.frontmatter).toBeDefined();
  });
});

describe("frontmatter splice safety", () => {
  test("commenting on a heading leaves the frontmatter bytes untouched", () => {
    const file = tempMarkdown(FLAT);
    const before = readFileSync(file);
    const doc = loadReviewDocument(file);
    const frontmatterBytes = before.subarray(0, doc.frontmatter!.range.end);

    createCommentBySelector(file, "heading:0", "Amit", "First note.");

    const after = readFileSync(file);
    expect(after.subarray(0, frontmatterBytes.length).equals(frontmatterBytes)).toBe(true);
    expect(after.toString("utf8")).toContain("title: Charting doc");

    const reloaded = loadReviewDocument(file);
    expect(reloaded.errors).toEqual([]);
    expect(reloaded.frontmatter!.range).toEqual(doc.frontmatter!.range);
    expect(reloaded.threads).toHaveLength(1);
    expect(reloaded.threads[0]!.anchor!.state).toBe("attached");
    expect(reloaded.threads[0]!.range!.start).toBeGreaterThan(reloaded.frontmatter!.range.end);
    expect(reloaded.html).not.toMatch(/<p[^>]*>[^<]*created_at:/);
  });

  test("the inserted thread lands after its target, not at the top of the file", () => {
    const file = tempMarkdown(FLAT);
    createCommentBySelector(file, "paragraph:0", "Amit", "About the prose.");

    const text = readFileSync(file, "utf8");
    expect(text.indexOf("<!-- stet:thread")).toBeGreaterThan(text.indexOf("Prose paragraph."));
    expect(text.startsWith("---\ntitle: Charting doc")).toBe(true);
  });

  test("replies splice into a document that has frontmatter", () => {
    const file = tempMarkdown(NESTED);
    const created = createCommentBySelector(file, "heading:0", "Amit", "First note.");
    const threadId = created.threads[0]!.id;

    const replied = appendReply(file, threadId, { author: "Reviewer", bodyMarkdown: "Second note." });

    expect(replied.threads[0]!.messages.map((message) => message.bodyMarkdown)).toEqual(["First note.", "Second note."]);
    expect(readFileSync(file, "utf8").startsWith(NESTED.slice(0, NESTED.indexOf("---", 3) + 3))).toBe(true);
    expect(replied.frontmatter).toBeDefined();
  });

  test("a document-level comment appends at EOF and preserves frontmatter", () => {
    const file = tempMarkdown(FLAT);
    createCommentBySelector(file, "document", "Amit", "Whole-doc note.");

    const text = readFileSync(file, "utf8");
    expect(text.startsWith("---\ntitle: Charting doc")).toBe(true);
    expect(text.indexOf("<!-- stet:thread")).toBeGreaterThan(text.indexOf("Prose paragraph."));

    const reloaded = loadReviewDocument(file);
    expect(reloaded.threads).toHaveLength(1);
    expect(reloaded.threads[0]!.target.kind).toBe("document");
    expect(reloaded.errors).toEqual([]);
    expect(reloaded.frontmatter!.range).toEqual({ start: 0, end: text.indexOf("\n# Body") });
  });
});
