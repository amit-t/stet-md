import { describe, it, expect } from "vitest";
import {
  serializeMarker,
  parseMarker,
  renderThreadBlock,
} from "../../src/core/threadMarker.js";
import { scanThreadBlocks } from "../../src/core/parseThreads.js";
import type { ReviewThread } from "../../src/core/types.js";

function thread(overrides: Partial<ReviewThread> = {}): ReviewThread {
  return {
    version: 1,
    id: "rlt_20260607_150015_7f3a9c",
    status: "open",
    createdAt: "2026-06-07T15:00:15Z",
    updatedAt: "2026-06-07T15:00:15Z",
    target: {
      kind: "heading",
      headingPath: ["Product goals"],
      blockOrdinal: 0,
      sourceHash: "sha256:4e2f",
      quote: "Product goals",
    },
    messages: [
      {
        author: "Amit",
        createdAt: "2026-06-07T15:00:15Z",
        bodyMarkdown:
          "This section needs a goal about agents responding inside the file.",
      },
    ],
    ...overrides,
  };
}

describe("marker serialize/parse round-trip", () => {
  it("round-trips a basic thread through serialize -> parse", () => {
    const t = thread();
    const parsed = parseMarker(serializeMarker(t));
    expect(parsed).toEqual(t);
  });

  it("round-trips multiple messages with statuses and edits", () => {
    const t = thread({
      status: "resolved",
      updatedAt: "2026-06-07T15:32:44Z",
      messages: [
        {
          author: "Amit",
          createdAt: "2026-06-07T15:00:15Z",
          bodyMarkdown: "First message.\n\nWith a blank line.",
        },
        {
          author: "Claude",
          createdAt: "2026-06-07T15:32:44Z",
          bodyMarkdown: "Agreed. Changed goal 6.",
          editedAt: "2026-06-07T15:40:00Z",
        },
      ],
    });
    expect(parseMarker(serializeMarker(t))).toEqual(t);
  });

  it("round-trips a message body containing '-->' through a full block scan", () => {
    const t = thread({
      messages: [
        {
          author: "Codex",
          createdAt: "2026-06-07T15:00:15Z",
          bodyMarkdown:
            "Careful: an HTML comment ends with --> and may contain -- dashes.\nSecond line with C:\\path and ---.",
        },
      ],
    });
    const block = renderThreadBlock(t);
    // The marker body (between the opening `<!-- redline:thread` delimiter and
    // its closing `-->`) must never contain `--`, which would close the HTML
    // comment early. The `<!--` delimiter itself legitimately contains `--`.
    const innerStart = block.indexOf("\n") + 1;
    const innerEnd = block.indexOf("\n-->");
    const markerBody = block.slice(innerStart, innerEnd);
    expect(markerBody).not.toContain("--");

    const wrapped = `# Heading\n\n${block}\n`;
    const { blocks, errors } = scanThreadBlocks(wrapped);
    expect(errors).toEqual([]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.thread).toEqual(t);
  });

  it("round-trips quotes with colons and special characters", () => {
    const t = thread({
      target: {
        kind: "paragraph",
        headingPath: ["A: section", "Nested #2"],
        blockOrdinal: 3,
        sourceHash: "sha256:deadbeef",
        quote: "weird: value with # hash and : colon",
      },
    });
    expect(parseMarker(serializeMarker(t))).toEqual(t);
  });

  it("preserves a body with trailing newline via quoted fallback", () => {
    const t = thread({
      messages: [
        {
          author: "Amit",
          createdAt: "2026-06-07T15:00:15Z",
          bodyMarkdown: "ends with newline\n",
        },
      ],
    });
    expect(parseMarker(serializeMarker(t))).toEqual(t);
  });
});
