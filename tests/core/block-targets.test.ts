import { describe, expect, test } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCommentBySelector, loadReviewDocument } from "../../src/core/index.js";

function tempMarkdown(contents: string): string {
  const dir = mkdtempSync(join(tmpdir(), "stet-block-targets-"));
  const file = join(dir, "doc.md");
  writeFileSync(file, contents);
  return file;
}

const TOP_LEVEL = [
  "# Title",
  "",
  "Intro paragraph.",
  "",
  "- **Q1?**",
  "- **Q2?**",
  "",
  "> quoted wisdom",
  "",
  "| a | b |",
  "| - | - |",
  "| 1 | 2 |",
  "",
  "```js",
  "const x = 1;",
  "```",
  "",
].join("\n");

describe("top-level container targets", () => {
  test("list, blockquote, table, and code blocks mint targets", () => {
    const doc = loadReviewDocument(tempMarkdown(TOP_LEVEL));
    const kinds = doc.targets.map((t) => t.kind);
    expect(kinds).toContain("list");
    expect(kinds).toContain("blockquote");
    expect(kinds).toContain("table");
    expect(kinds).toContain("code_block");
  });

  test("container html is wrapped with a stet-block target div", () => {
    const doc = loadReviewDocument(tempMarkdown(TOP_LEVEL));
    const list = doc.targets.find((t) => t.kind === "list")!;
    expect(doc.html).toContain(`<div class="stet-block" data-stet-target="${list.id}" tabindex="0"><ul>`);
    const quote = doc.targets.find((t) => t.kind === "blockquote")!;
    expect(doc.html).toContain(`data-stet-target="${quote.id}"`);
  });

  test("list target carries quote and exact line range", () => {
    const doc = loadReviewDocument(tempMarkdown(TOP_LEVEL));
    const list = doc.targets.find((t) => t.kind === "list")!;
    expect(list.quote).toContain("Q1?");
    expect(list.lineStart).toBe(5);
    expect(list.lineEnd).toBe(6);
    expect(list.headingPath).toEqual(["Title"]);
  });

  test("hr mints no target", () => {
    const doc = loadReviewDocument(tempMarkdown("# T\n\n---\n\nProse.\n"));
    expect(doc.targets.filter((t) => t.kind !== "document" && t.kind !== "heading" && t.kind !== "paragraph")).toEqual([]);
  });
});

describe("selector resolution for new kinds", () => {
  test("comment --target list:0 anchors a thread to the first list", () => {
    const file = tempMarkdown(TOP_LEVEL);
    createCommentBySelector(file, "list:0", "Amit", "Answer: option B.");
    const doc = loadReviewDocument(file);
    expect(doc.threads).toHaveLength(1);
    expect(doc.threads[0]!.target.kind).toBe("list");
    expect(doc.errors).toEqual([]);
  });

  test("unknown kind still returns not-found", () => {
    const file = tempMarkdown(TOP_LEVEL);
    expect(() => createCommentBySelector(file, "banana:0", "Amit", "x")).toThrow(/No target matched/);
  });
});

const WITH_DETAILS = [
  "# Title",
  "",
  "<details>",
  "<summary>**Q3: pick an option**</summary>",
  "",
  "Context paragraph inside.",
  "",
  "- option A",
  "- option B",
  "",
  "<details>",
  "<summary>nested</summary>",
  "",
  "Deep paragraph.",
  "",
  "</details>",
  "",
  "</details>",
  "",
].join("\n");

describe("targets inside collapsibles", () => {
  test("paragraphs and lists inside details mint targets with real line ranges", () => {
    const doc = loadReviewDocument(tempMarkdown(WITH_DETAILS));
    const innerParagraph = doc.targets.find((t) => t.quote === "Context paragraph inside.")!;
    expect(innerParagraph.kind).toBe("paragraph");
    expect(innerParagraph.lineStart).toBe(6);
    const innerList = doc.targets.find((t) => t.kind === "list")!;
    expect(innerList.quote).toContain("option A");
    expect(innerList.lineStart).toBe(8);
    expect(innerList.lineEnd).toBe(9);
  });

  test("nested details content mints targets", () => {
    const doc = loadReviewDocument(tempMarkdown(WITH_DETAILS));
    expect(doc.targets.some((t) => t.quote === "Deep paragraph.")).toBe(true);
  });

  test("summary line is not a target", () => {
    const doc = loadReviewDocument(tempMarkdown(WITH_DETAILS));
    expect(doc.targets.some((t) => t.quote.includes("Q3: pick an option"))).toBe(false);
  });

  test("inner blocks carry data-stet-target in the rendered html", () => {
    const doc = loadReviewDocument(tempMarkdown(WITH_DETAILS));
    const innerList = doc.targets.find((t) => t.kind === "list")!;
    expect(doc.html).toContain(`<div class="stet-block" data-stet-target="${innerList.id}" tabindex="0"><ul>`);
  });

  test("frontmatter block mints no targets", () => {
    const doc = loadReviewDocument(tempMarkdown("---\ntitle: X\n---\n\nProse.\n"));
    expect(doc.targets.filter((t) => t.kind === "table")).toEqual([]);
  });

  test("comment on an inner list roundtrips without leaking the marker into prose", () => {
    const file = tempMarkdown(WITH_DETAILS);
    createCommentBySelector(file, "list:0", "Amit", "Answer: option B.");
    const doc = loadReviewDocument(file);
    expect(doc.errors).toEqual([]);
    expect(doc.threads).toHaveLength(1);
    expect(doc.threads[0]!.anchor?.state ?? "attached").not.toBe("orphan");
    expect(doc.html).not.toContain("stet:");
  });
});
