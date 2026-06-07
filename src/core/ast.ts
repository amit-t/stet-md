import { unified } from "unified";
import remarkParse from "remark-parse";
import type { Root, RootContent } from "mdast";

/**
 * Shared Markdown AST helpers. The AST is used only to discover source
 * positions (targets, code regions); saves are byte splices, never AST
 * stringification.
 */

const parser = unified().use(remarkParse);

export function parseAst(source: string): Root {
  return parser.parse(source) as Root;
}

/** Plain-text content of an mdast node (recursive). */
export function nodeText(node: RootContent | Root): string {
  if ("value" in node && typeof node.value === "string") return node.value;
  if ("children" in node && Array.isArray(node.children)) {
    return node.children.map((c) => nodeText(c as RootContent)).join("");
  }
  return "";
}

export interface OffsetRange {
  start: number;
  end: number;
}

/**
 * Ranges of `code` (fenced/indented) and `inlineCode` nodes. The redline
 * marker token can appear inside these legitimately (docs, examples) and must
 * not be parsed as a real thread block.
 */
export function codeRanges(tree: Root): OffsetRange[] {
  const ranges: OffsetRange[] = [];
  const visit = (node: { type: string; position?: { start: { offset?: number }; end: { offset?: number } }; children?: unknown[] }): void => {
    if (
      (node.type === "code" || node.type === "inlineCode") &&
      node.position?.start.offset !== undefined &&
      node.position.end.offset !== undefined
    ) {
      ranges.push({
        start: node.position.start.offset,
        end: node.position.end.offset,
      });
    }
    if (Array.isArray(node.children)) {
      for (const child of node.children) visit(child as typeof node);
    }
  };
  visit(tree as unknown as Parameters<typeof visit>[0]);
  return ranges;
}
