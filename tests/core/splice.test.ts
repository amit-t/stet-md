import { describe, it, expect } from "vitest";
import { resolveTarget, parseTargetSpec } from "../../src/core/markdown.js";
import { detectFileFormat } from "../../src/core/fileFormat.js";
import {
  insertThreadSplice,
  replaceThreadSplice,
  applySplices,
} from "../../src/core/spliceWriter.js";
import { scanThreadBlocks } from "../../src/core/parseThreads.js";
import { newThread, appendMessage, resolveThread } from "../../src/core/threadOps.js";
import { CLOSE_MARKER } from "../../src/core/threadMarker.js";

const NOW = new Date("2026-06-07T15:00:15Z");

function insertComment(source: string, spec: string, msg = "A note.") {
  const fmt = detectFileFormat(source);
  const resolved = resolveTarget(source, parseTargetSpec(spec));
  const t = newThread(resolved.target, "Amit", msg, NOW);
  const splice = insertThreadSplice(source, resolved.insertOffset, t, fmt);
  const out = applySplices(source, [splice]);
  return { out, offset: resolved.insertOffset, splice, thread: t };
}

/** Assert every byte outside the inserted region is identical to the original. */
function expectBytesOutsideInsertPreserved(
  original: string,
  out: string,
  offset: number,
) {
  expect(out.startsWith(original.slice(0, offset))).toBe(true);
  expect(out.endsWith(original.slice(offset))).toBe(true);
}

describe("splice writer — insertion", () => {
  it("inserts a new heading comment after the heading line", () => {
    const src = "# Title\n\n## Product goals\n\nSome body paragraph here.\n";
    const { out, offset } = insertComment(src, 'heading:Product goals');
    expect(out).toContain("<!-- stet:thread");
    expect(out).toContain(CLOSE_MARKER);
    // Inserted after the heading, before the body paragraph.
    const headingIdx = out.indexOf("## Product goals");
    const blockIdx = out.indexOf("<!-- stet:thread");
    const bodyIdx = out.indexOf("Some body paragraph");
    expect(headingIdx).toBeLessThan(blockIdx);
    expect(blockIdx).toBeLessThan(bodyIdx);
    expectBytesOutsideInsertPreserved(src, out, offset);
  });

  it("inserts a new paragraph comment after the paragraph block", () => {
    const src = "# Title\n\nFirst paragraph text.\n\nSecond paragraph text.\n";
    const { out, offset } = insertComment(src, "paragraph:1");
    const firstIdx = out.indexOf("First paragraph text.");
    const blockIdx = out.indexOf("<!-- stet:thread");
    const secondIdx = out.indexOf("Second paragraph text.");
    expect(firstIdx).toBeLessThan(blockIdx);
    expect(blockIdx).toBeLessThan(secondIdx);
    expectBytesOutsideInsertPreserved(src, out, offset);
  });

  it("inserts a document-level comment at end of file", () => {
    const src = "# Title\n\nBody.\n";
    const { out, offset } = insertComment(src, "document");
    expect(out.indexOf("<!-- stet:thread")).toBeGreaterThan(
      out.indexOf("Body."),
    );
    expectBytesOutsideInsertPreserved(src, out, offset);
  });

  it("stacks a second heading thread after the first", () => {
    const src = "## Product goals\n\nBody.\n";
    const first = insertComment(src, "heading:Product goals", "first").out;
    // second insertion should land after the first thread block.
    const fmt = detectFileFormat(first);
    const resolved = resolveTarget(first, parseTargetSpec("heading:Product goals"));
    const t2 = newThread(resolved.target, "Amit", "second", NOW);
    const out2 = applySplices(first, [
      insertThreadSplice(first, resolved.insertOffset, t2, fmt),
    ]);
    const firstMsg = out2.indexOf("first");
    const secondMsg = out2.indexOf("second");
    const bodyIdx = out2.indexOf("Body.");
    expect(firstMsg).toBeLessThan(secondMsg);
    expect(secondMsg).toBeLessThan(bodyIdx);
    const { blocks, errors } = scanThreadBlocks(out2);
    expect(errors).toEqual([]);
    expect(blocks).toHaveLength(2);
  });
});

describe("splice writer — replacement preserves surrounding bytes", () => {
  const base = "# Title\n\n## Product goals\n\nBody paragraph.\n";

  function setup() {
    const { out } = insertComment(base, "heading:Product goals", "first note");
    return out;
  }

  it("appends a reply replacing only the thread block", () => {
    const withThread = setup();
    const { blocks } = scanThreadBlocks(withThread);
    const block = blocks[0]!;
    const updated = appendMessage(block.thread!, "Claude", "a reply", NOW);
    const fmt = detectFileFormat(withThread);
    const splice = replaceThreadSplice(block, updated, fmt);
    const out = applySplices(withThread, [splice]);

    // Bytes before and after the replaced range are byte-identical.
    expect(out.slice(0, block.range.start)).toBe(
      withThread.slice(0, block.range.start),
    );
    expect(out.slice(block.range.start + splice.replacement.length)).toBe(
      withThread.slice(block.range.end),
    );

    const reparsed = scanThreadBlocks(out).blocks[0]!.thread!;
    expect(reparsed.messages).toHaveLength(2);
    expect(reparsed.messages[1]!.bodyMarkdown).toBe("a reply");
  });

  it("resolve changes status and keeps prior messages", () => {
    const withThread = setup();
    const { blocks } = scanThreadBlocks(withThread);
    const block = blocks[0]!;
    const updated = resolveThread(block.thread!, {
      author: "Claude",
      message: "done",
      now: NOW,
    });
    const fmt = detectFileFormat(withThread);
    const out = applySplices(withThread, [replaceThreadSplice(block, updated, fmt)]);
    const reparsed = scanThreadBlocks(out).blocks[0]!.thread!;
    expect(reparsed.status).toBe("resolved");
    expect(reparsed.messages).toHaveLength(2);
    expect(reparsed.messages[0]!.bodyMarkdown).toBe("first note");
  });
});

describe("splice writer — byte fidelity across file conventions", () => {
  const cases: { name: string; src: string }[] = [
    { name: "LF", src: "## Product goals\n\nBody with trailing spaces   \nand a list:\n\n- one\n- two\n" },
    { name: "CRLF", src: "## Product goals\r\n\r\nBody line.\r\nMore.\r\n" },
    { name: "BOM + LF", src: "﻿## Product goals\n\nBody.\n" },
    { name: "no final newline", src: "## Product goals\n\nBody without final newline." },
    { name: "reference links + trailing space", src: "## Product goals\n\nSee [ref][1].   \n\n[1]: https://example.com\n" },
  ];

  for (const c of cases) {
    it(`preserves untouched bytes for ${c.name}`, () => {
      const { out, offset } = insertComment(c.src, "heading:Product goals");
      expectBytesOutsideInsertPreserved(c.src, out, offset);
      // Re-scan must find exactly one well-formed thread.
      const { blocks, errors } = scanThreadBlocks(out);
      expect(errors).toEqual([]);
      expect(blocks).toHaveLength(1);
    });
  }

  it("uses CRLF in the inserted block for CRLF files", () => {
    const src = "## Product goals\r\n\r\nBody line.\r\n";
    const { out } = insertComment(src, "heading:Product goals");
    const blockStart = out.indexOf("<!-- stet:thread");
    const blockEnd = out.indexOf(CLOSE_MARKER) + CLOSE_MARKER.length;
    const block = out.slice(blockStart, blockEnd);
    expect(block).toContain("\r\n");
    expect(block).not.toMatch(/[^\r]\n/); // no bare LF inside the block
  });

  it("does not rewrap paragraphs or change list markers outside the splice", () => {
    const src =
      "## Product goals\n\nA long paragraph that\nspans two source lines.\n\n* star item\n+ plus item\n";
    const { out, offset } = insertComment(src, "heading:Product goals");
    expect(out).toContain("A long paragraph that\nspans two source lines.");
    expect(out).toContain("* star item\n+ plus item");
    expectBytesOutsideInsertPreserved(src, out, offset);
  });
});
