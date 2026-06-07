import { describe, it, expect } from "vitest";
import { scanThreadBlocks, listThreads } from "../../src/core/parseThreads.js";
import { renderThreadBlock } from "../../src/core/threadMarker.js";
import type { ReviewThread } from "../../src/core/types.js";

function thread(id: string, body: string): ReviewThread {
  return {
    version: 1,
    id,
    status: "open",
    createdAt: "2026-06-07T15:00:15Z",
    updatedAt: "2026-06-07T15:00:15Z",
    target: {
      kind: "heading",
      headingPath: ["H"],
      blockOrdinal: 0,
      sourceHash: "sha256:0",
      quote: "H",
    },
    messages: [
      { author: "Amit", createdAt: "2026-06-07T15:00:15Z", bodyMarkdown: body },
    ],
  };
}

describe("parseThreads", () => {
  it("parses zero-thread Markdown", () => {
    const { blocks, errors } = scanThreadBlocks("# Title\n\nJust prose.\n");
    expect(blocks).toEqual([]);
    expect(errors).toEqual([]);
  });

  it("parses one structured thread after a heading", () => {
    const src = `## H\n\n${renderThreadBlock(thread("rlt_20260607_150015_aaaaaa", "hi"))}\n`;
    const threads = listThreads(src);
    expect(threads).toHaveLength(1);
    expect(threads[0]!.id).toBe("rlt_20260607_150015_aaaaaa");
    expect(threads[0]!.messages[0]!.bodyMarkdown).toBe("hi");
  });

  it("parses multiple threads in one section in document order", () => {
    const a = renderThreadBlock(thread("rlt_20260607_150015_aaaaaa", "first"));
    const b = renderThreadBlock(thread("rlt_20260607_150016_bbbbbb", "second"));
    const src = `## H\n\n${a}\n\n${b}\n`;
    const ids = listThreads(src).map((t) => t.id);
    expect(ids).toEqual([
      "rlt_20260607_150015_aaaaaa",
      "rlt_20260607_150016_bbbbbb",
    ]);
  });

  it("extracts messages from the structured marker, not the blockquote", () => {
    // Tamper with the visible blockquote; structured data must still win.
    const block = renderThreadBlock(thread("rlt_20260607_150015_aaaaaa", "TRUTH"));
    const tampered = block.replace(/> TRUTH/g, "> LIES in the blockquote");
    const src = `## H\n\n${tampered}\n`;
    const t = listThreads(src)[0]!;
    expect(t.messages[0]!.bodyMarkdown).toBe("TRUTH");
  });

  it("flags a divergent generated blockquote", () => {
    const block = renderThreadBlock(thread("rlt_20260607_150015_aaaaaa", "real"));
    const tampered = block.replace(/> real/g, "> drifted text");
    const { blocks } = scanThreadBlocks(`## H\n\n${tampered}\n`);
    expect(blocks[0]!.diverged).toBe(true);
  });

  it("does not flag divergence when the blockquote matches", () => {
    const block = renderThreadBlock(thread("rlt_20260607_150015_aaaaaa", "real"));
    const { blocks } = scanThreadBlocks(`## H\n\n${block}\n`);
    expect(blocks[0]!.diverged).toBe(false);
  });

  it("reports a malformed marker with a line number and preserves raw content", () => {
    const src =
      "# Doc\n\n<!-- redline:thread\nthis: : is broken yaml : :\n-->\n> x\n<!-- /redline:thread -->\n";
    const { blocks, errors } = scanThreadBlocks(src);
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(errors[0]!.code).toBe("malformed_marker");
    expect(errors[0]!.line).toBeGreaterThan(1);
    // Raw block content is preserved for recovery.
    expect(blocks[0]!.raw).toContain("this: : is broken yaml");
    expect(blocks[0]!.thread).toBeUndefined();
  });

  it("reports an unterminated opening marker", () => {
    const src = "# Doc\n\n<!-- redline:thread\nid: rlt_x\n(no terminator)\n";
    const { errors } = scanThreadBlocks(src);
    expect(errors[0]!.code).toBe("malformed_marker");
    expect(errors[0]!.message).toMatch(/no `-->`/);
  });

  it("ignores marker tokens inside fenced code and inline code", () => {
    const real = renderThreadBlock(thread("rlt_20260607_150015_aaaaaa", "real"));
    const src =
      "# Docs\n\n" +
      "Mention `<!-- redline:thread ... -->` inline in prose.\n\n" +
      "```markdown\n<!-- redline:thread\nid: rlt_example\n-->\n> example\n<!-- /redline:thread -->\n```\n\n" +
      real +
      "\n";
    const { blocks, errors } = scanThreadBlocks(src);
    expect(errors).toEqual([]); // the unterminated inline/example must NOT error
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.thread!.id).toBe("rlt_20260607_150015_aaaaaa");
  });

  it("preserves unknown Markdown around thread blocks (raw range is exact)", () => {
    const block = renderThreadBlock(thread("rlt_20260607_150015_aaaaaa", "hi"));
    const src = `before\n\n${block}\n\nafter\n`;
    const b = scanThreadBlocks(src).blocks[0]!;
    expect(src.slice(b.range.start, b.range.end)).toBe(block);
  });
});
