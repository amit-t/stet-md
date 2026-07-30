#!/usr/bin/env node
// Regenerates src/server/vendorCss.ts from upstream CSS.
// These are the exact stylesheets the `mdv` (mdview) tool loads from a CDN; we
// bundle them locally so Stet.md renders Markdown identically to a browser while
// keeping a strict CSP (no remote origins) and working fully offline.
//
// Usage: node scripts/vendor-css.mjs
import { writeFileSync } from "node:fs";

const SOURCES = {
  gh: "https://cdn.jsdelivr.net/npm/github-markdown-css@5.5.1/github-markdown.css",
  hlLight: "https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/styles/github.css",
  hlDark: "https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/styles/github-dark.css",
};

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} -> ${res.status}`);
  return (await res.text()).trim();
}

const [gh, hlLight, hlDark] = await Promise.all([
  fetchText(SOURCES.gh),
  fetchText(SOURCES.hlLight),
  fetchText(SOURCES.hlDark),
]);

const hljs = `${hlLight}\n@media (prefers-color-scheme: dark) {\n${hlDark}\n}\n`;

const header =
  `// AUTO-GENERATED — do not edit by hand.\n` +
  `// Vendored to render Markdown identically to a browser / the \`mdv\` (mdview) tool,\n` +
  `// which loads these exact stylesheets from jsDelivr. Bundled locally because the\n` +
  `// Stet.md server enforces a strict CSP (no remote origins) and works offline.\n` +
  `//   github-markdown-css@5.5.1  (github-markdown.css, auto light/dark)\n` +
  `//   highlight.js@11.9.0        (styles/github.css + styles/github-dark.css)\n` +
  `// Regenerate: node scripts/vendor-css.mjs\n\n`;

const out =
  header +
  `export const githubMarkdownCss = ${JSON.stringify(gh)};\n\n` +
  `export const hljsThemeCss = ${JSON.stringify(hljs)};\n`;

const target = new URL("../src/server/vendorCss.ts", import.meta.url);
writeFileSync(target, out);
console.log(`wrote ${target.pathname} (${out.length} bytes)`);
