import { describe, it, expect } from "vitest";
import { resolveAnchors } from "../../src/core/anchors.js";
import { resolveTarget, parseTargetSpec } from "../../src/core/markdown.js";
import { detectFileFormat } from "../../src/core/fileFormat.js";
import { insertThreadBlock } from "../../src/core/spliceWriter.js";
import { newThread } from "../../src/core/threadOps.js";

const NOW = new Date("2026-06-07T15:00:15Z");

function withComment(src: string, spec: string) {
  const fmt = detectFileFormat(src);
  const r = resolveTarget(src, parseTargetSpec(spec));
  const t = newThread(r.target, "Amit", "note", NOW);
  return insertThreadBlock(src, r.insertOffset, t, fmt);
}

describe("anchor resolution", () => {
  it("marks an adjacent thread with matching hash as attached", () => {
    const out = withComment("## Product goals\n\nBody.\n", "heading:Product goals");
    const [a] = resolveAnchors(out);
    expect(a!.status).toBe("attached");
  });

  it("marks content_drifted when adjacent target text changed", () => {
    const out = withComment("## Product goals\n\nBody.\n", "heading:Product goals");
    const drifted = out.replace("## Product goals", "## Product goals (revised)");
    const [a] = resolveAnchors(drifted);
    expect(a!.status).toBe("content_drifted");
  });

  it("reattaches by exact hash after the target moves elsewhere", () => {
    const src = "## Product goals\n\nBody.\n";
    const out = withComment(src, "heading:Product goals");
    // Move the heading away from the thread block: drop the heading where it
    // was and reintroduce identical text later in the document.
    const blockStart = out.indexOf("<!-- redline:thread");
    const moved =
      out.slice(0, out.indexOf("## Product goals")) +
      out.slice(blockStart) +
      "\n## Product goals\n";
    const a = resolveAnchors(moved).find((r) => r.status !== "document")!;
    expect(a.status).toBe("reattached");
  });

  it("marks orphan when no plausible target exists", () => {
    const out = withComment("## Product goals\n\nBody.\n", "heading:Product goals");
    // Remove the adjacent heading entirely so the thread leads the document
    // and no block anywhere carries the target's hash.
    const blockStart = out.indexOf("<!-- redline:thread");
    const orphaned = out.slice(blockStart);
    const [a] = resolveAnchors(orphaned);
    expect(a!.status).toBe("orphan");
  });

  it("classifies document-level threads as document", () => {
    const out = withComment("## H\n\nBody.\n", "document");
    const [a] = resolveAnchors(out);
    expect(a!.status).toBe("document");
  });
});
