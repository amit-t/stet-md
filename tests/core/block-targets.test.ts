import { describe, expect, test } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadReviewDocument } from "../../src/core/index.js";

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
