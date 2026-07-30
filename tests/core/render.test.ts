import { describe, expect, test } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  isHorizontalRule,
  renderCodeBlock,
  renderInline,
  renderList,
  renderTable,
  slugify,
} from "../../src/core/render.js";
import { loadReviewDocument } from "../../src/core/document.js";
import type { ReviewWarning } from "../../src/core/types.js";

function inline(text: string): string {
  const warnings: ReviewWarning[] = [];
  return renderInline(text, warnings);
}

function tempMarkdown(contents: string): string {
  const dir = mkdtempSync(join(tmpdir(), "stet-render-"));
  const file = join(dir, "doc.md");
  writeFileSync(file, contents);
  return file;
}

describe("inline rendering matches browser Markdown", () => {
  test("emphasis, strong, strong+em, and strikethrough", () => {
    expect(inline("**bold**")).toBe("<strong>bold</strong>");
    expect(inline("__bold__")).toBe("<strong>bold</strong>");
    expect(inline("*italic*")).toBe("<em>italic</em>");
    expect(inline("_italic_")).toBe("<em>italic</em>");
    expect(inline("***both***")).toBe("<strong><em>both</em></strong>");
    expect(inline("~~gone~~")).toBe("<del>gone</del>");
    expect(inline("a **b** and *c*")).toBe("a <strong>b</strong> and <em>c</em>");
  });

  test("underscores inside words are not emphasis", () => {
    expect(inline("file_name_here")).toBe("file_name_here");
    expect(inline("a_b and _real_ italic")).toBe("a_b and <em>real</em> italic");
  });

  test("inline code is not re-parsed for emphasis", () => {
    expect(inline("`a*b*c`")).toBe("<code>a*b*c</code>");
    expect(inline("`x` and **y**")).toBe("<code>x</code> and <strong>y</strong>");
  });

  test("links, autolinks, and emphasis inside link text", () => {
    expect(inline("[site](https://example.com)")).toBe(
      '<a href="https://example.com" rel="noreferrer noopener">site</a>',
    );
    expect(inline("<https://example.com>")).toBe(
      '<a href="https://example.com" rel="noreferrer noopener">https://example.com</a>',
    );
    // Autolinks keep ampersand query strings intact (not truncated).
    expect(inline("<https://example.com/s?a=1&b=2>")).toBe(
      '<a href="https://example.com/s?a=1&amp;b=2" rel="noreferrer noopener">https://example.com/s?a=1&amp;b=2</a>',
    );
    expect(inline("[**bold link**](https://example.com)")).toBe(
      '<a href="https://example.com" rel="noreferrer noopener"><strong>bold link</strong></a>',
    );
    expect(inline("[relative](./other.md)")).toBe(
      '<a href="./other.md" rel="noreferrer noopener">relative</a>',
    );
  });

  test("local images render, remote images are blocked", () => {
    expect(inline("![alt](./img.png)")).toBe('<img src="./img.png" alt="alt">');
    const warnings: ReviewWarning[] = [];
    const html = renderInline("![x](https://evil.example/t.png)", warnings);
    expect(html).toContain("data-stet-blocked-resource");
    expect(html).not.toContain("https://evil.example");
    expect(warnings.some((w) => w.kind === "remote_resource_blocked")).toBe(true);
  });

  test("escapes HTML before applying inline markup", () => {
    expect(inline("<script>alert(1)</script>")).toBe("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(inline("a < b and c > d")).toBe("a &lt; b and c &gt; d");
  });

  test("NUL bytes cannot collide with the placeholder sentinel", () => {
    const nul = String.fromCharCode(0);
    expect(inline(`a${nul}0${nul}b **x**`)).toBe("a0b <strong>x</strong>");
  });
});

describe("block helpers", () => {
  test("slugify mirrors GitHub heading anchors", () => {
    expect(slugify("Hello World")).toBe("hello-world");
    expect(slugify("API & Design (v2)")).toBe("api--design-v2");
    expect(slugify("  Trailing  ")).toBe("trailing");
  });

  test("horizontal rule detection", () => {
    expect(isHorizontalRule("---")).toBe(true);
    expect(isHorizontalRule("***")).toBe(true);
    expect(isHorizontalRule("___")).toBe(true);
    expect(isHorizontalRule("- - -")).toBe(true);
    expect(isHorizontalRule("--")).toBe(false);
    expect(isHorizontalRule("text---")).toBe(false);
  });

  test("code block is highlighted when language is known", () => {
    const html = renderCodeBlock("const x = 1;", "ts");
    expect(html).toContain('<pre><code class="hljs language-ts">');
    expect(html).toContain('<span class="hljs-keyword">const</span>');
    const plain = renderCodeBlock("just text", "");
    expect(plain).toBe('<pre><code class="hljs">just text</code></pre>');
  });

  test("pipe tables render as real tables with alignment", () => {
    const warnings: ReviewWarning[] = [];
    const html = renderTable(
      ["| A | B | C |", "| :-- | :--: | --: |", "| 1 | 2 | 3 |"],
      warnings,
    );
    expect(html).toContain("<table><thead><tr>");
    expect(html).toContain('<th align="left">A</th>');
    expect(html).toContain('<th align="center">B</th>');
    expect(html).toContain('<th align="right">C</th>');
    expect(html).toContain("<tbody><tr>");
    expect(html).toContain('<td align="center">2</td>');
  });

  test("ordered, unordered, nested, and task lists", () => {
    const warnings: ReviewWarning[] = [];
    expect(renderList(["1. one", "2. two"], warnings)).toBe("<ol><li>one</li><li>two</li></ol>");
    expect(renderList(["3. three", "4. four"], warnings)).toBe(
      '<ol start="3"><li>three</li><li>four</li></ol>',
    );
    expect(renderList(["- a", "  - a1", "- b"], warnings)).toBe(
      "<ul><li>a<ul><li>a1</li></ul></li><li>b</li></ul>",
    );
    const tasks = renderList(["- [ ] todo", "- [x] done"], warnings);
    expect(tasks).toBe(
      '<ul class="contains-task-list"><li class="task-list-item"><input type="checkbox" disabled> todo</li>' +
        '<li class="task-list-item"><input type="checkbox" disabled checked> done</li></ul>',
    );
  });
});

describe("reference-style links resolve and definitions are hidden", () => {
  test("full, collapsed, and shortcut references render; definition lines disappear", () => {
    const file = tempMarkdown(
      [
        "See [the docs][docs], the [same][], and [shortcut].",
        "",
        "[docs]: https://example.com/docs",
        "[same]: https://example.com/same",
        "[shortcut]: https://example.com/shortcut",
        "",
      ].join("\n"),
    );
    const doc = loadReviewDocument(file);
    expect(doc.html).toContain('<a href="https://example.com/docs" rel="noreferrer noopener">the docs</a>');
    expect(doc.html).toContain('<a href="https://example.com/same" rel="noreferrer noopener">same</a>');
    expect(doc.html).toContain('<a href="https://example.com/shortcut" rel="noreferrer noopener">shortcut</a>');
    // Definition lines are not rendered as visible paragraphs.
    expect(doc.html).not.toContain("https://example.com/docs<");
    expect(doc.html).not.toContain("[docs]:");
  });
});

describe("document rendering wires the helpers end-to-end", () => {
  test("headings get slug ids and tables/hr/lists render richly", () => {
    const file = tempMarkdown(
      [
        "# Top Heading",
        "",
        "| Name | Qty |",
        "| --- | ---: |",
        "| Apples | 3 |",
        "",
        "---",
        "",
        "1. first",
        "2. second",
        "",
        "```js",
        "const y = 2;",
        "```",
        "",
      ].join("\n"),
    );
    const doc = loadReviewDocument(file);
    expect(doc.html).toContain('<h1 id="top-heading" data-stet-target=');
    expect(doc.html).toContain("<table><thead><tr><th>Name</th>");
    expect(doc.html).toContain('<th align="right">Qty</th>');
    expect(doc.html).toContain("<hr>");
    expect(doc.html).toContain("<ol><li>first</li><li>second</li></ol>");
    expect(doc.html).toContain('<pre><code class="hljs language-js">');
    expect(doc.html).not.toContain("<pre><code>const");
  });
});
