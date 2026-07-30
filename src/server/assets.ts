import { githubMarkdownCss, hljsThemeCss } from "./vendorCss.js";

// Browser-grade Markdown rendering: the document pane is `.markdown-body`, styled
// by the exact github-markdown-css + highlight.js GitHub theme the `mdv` tool uses
// (bundled locally — the CSP forbids remote origins). Stet's own chrome (topbar,
// threads, composer) is layered on top below.
const stetChromeCss = `
:root { color-scheme: light dark; --border: #d0d7de; --muted: #57606a; --accent: #0969da; --danger: #cf222e; --bg: #ffffff; --panel: #f6f8fa; --surface: #ffffff; --topbar: rgba(255,255,255,0.96); --text: #24292f; --outline: rgba(9,105,218,0.25); }
@media (prefers-color-scheme: dark) {
  :root { --border: #30363d; --muted: #8b949e; --accent: #2f81f7; --danger: #f85149; --bg: #0d1117; --panel: #161b22; --surface: #161b22; --topbar: rgba(13,17,23,0.96); --text: #c9d1d9; --outline: rgba(56,139,253,0.4); }
}
* { box-sizing: border-box; }
body { margin: 0; font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: var(--text); background: var(--bg); }
/* The document pane is .markdown-body — github-markdown-css owns its typography. */
#document.markdown-body { min-width: 0; background: transparent; padding: 1rem 2rem 4rem; font-size: 16px; }
/* Match the mdv (mdview) tool's code-block treatment exactly. */
#document.markdown-body pre code.hljs { display: block; overflow: auto; padding: 1em; border-radius: 6px; }
/* Frontmatter is metadata, not prose: muted, compact, and visibly not a body
   <details> collapsible. It is never a comment target, so it gets no hover affordance. */
#document .stet-frontmatter { margin: 0 0 1.5rem; border: 1px solid var(--border); border-radius: 6px; background: var(--panel); color: var(--muted); font-size: 0.85rem; }
#document .stet-frontmatter > summary { padding: 0.4rem 0.7rem; color: var(--muted); font-size: 0.72rem; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; cursor: pointer; list-style: none; }
#document .stet-frontmatter > summary::-webkit-details-marker { display: none; }
#document .stet-frontmatter > summary::before { content: "\\25B8"; display: inline-block; width: 1em; }
#document .stet-frontmatter[open] > summary { border-bottom: 1px solid var(--border); }
#document .stet-frontmatter[open] > summary::before { content: "\\25BE"; }
#document .stet-frontmatter > table { display: table; width: 100%; margin: 0; border: 0; font-size: 0.85rem; }
#document .stet-frontmatter > table tr { background: transparent; border-top: 0; }
#document .stet-frontmatter > table th, #document .stet-frontmatter > table td { border: 0; border-bottom: 1px solid var(--border); padding: 0.3rem 0.7rem; text-align: left; vertical-align: top; }
#document .stet-frontmatter > table th { color: var(--muted); font-size: 0.72rem; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; }
#document .stet-frontmatter > table tbody tr:last-child td { border-bottom: 0; }
#document .stet-frontmatter > table td:first-child { width: 1%; white-space: nowrap; color: var(--muted); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
#document .stet-frontmatter > table td:last-child { color: var(--text); }
#document .stet-frontmatter > pre { margin: 0; }
#document.markdown-body .stet-frontmatter > pre code.hljs { padding: 0.55rem 0.7rem; background: transparent; font-size: 0.8rem; }
#document p, #document h1, #document h2, #document h3, #document h4, #document h5, #document h6, #document li, #document .stet-block { position: relative; }
#document [data-stet-target] { cursor: crosshair; border-radius: 6px; }
#document [data-stet-target]:hover, #document [data-stet-target]:focus { outline: 2px solid var(--outline); }
.target-plus { position: absolute; margin-left: 0.4rem; padding: 0.1rem 0.4rem; color: var(--accent); font-weight: 700; background: var(--surface); }
.stet-block > .target-plus { top: 0.15rem; right: 0.3rem; margin-left: 0; }
#topbar { position: sticky; top: 0; z-index: 10; display: flex; gap: 0.75rem; align-items: center; padding: 0.7rem 1rem; border-bottom: 1px solid var(--border); background: var(--topbar); backdrop-filter: blur(6px); }
#topbar strong { margin-right: auto; }
.build-identity { margin-left: 0.35rem; color: var(--muted); font-size: 0.72rem; font-weight: 400; white-space: nowrap; }
#topbar button, .thread-card button, .composer button, .target-plus { border: 1px solid var(--border); background: var(--surface); color: var(--text); border-radius: 6px; padding: 0.35rem 0.6rem; cursor: pointer; }
#topbar button.primary, .composer button.primary { background: var(--accent); border-color: var(--accent); color: white; }
#topbar button:disabled { opacity: 0.45; cursor: not-allowed; }
.dirty { color: #9a6700; font-weight: 700; }
.clean { color: #1a7f37; }
#banner { display: none; padding: 0.75rem 1rem; background: #fff8c5; border-bottom: 1px solid #d4a72c; color: #7d4e00; }
#banner.visible { display: block; }
.layout { display: grid; grid-template-columns: minmax(0, 1fr) 360px; gap: 1.5rem; max-width: 1280px; margin: 0 auto; padding: 1.5rem; }
#threads { position: sticky; top: 4rem; align-self: start; max-height: calc(100vh - 5rem); overflow: auto; border-left: 1px solid var(--border); padding-left: 1rem; }
.thread-card, .composer { border: 1px solid var(--border); border-radius: 10px; background: var(--surface); padding: 0.8rem; margin-bottom: 0.8rem; box-shadow: 0 1px 2px rgba(27,31,36,0.04); }
.thread-card.resolved { background: var(--panel); }
.thread-card.orphan, .thread-card.drift { border-color: #d4a72c; }
.thread-header { display: flex; gap: 0.4rem; align-items: center; justify-content: space-between; font-weight: 700; }
.status { font-size: 0.75rem; text-transform: uppercase; color: var(--muted); }
.quote { color: var(--muted); font-size: 0.85rem; margin: 0.25rem 0 0.5rem; }
.message { border-top: 1px solid var(--border); padding-top: 0.5rem; margin-top: 0.5rem; white-space: pre-wrap; }
.message-meta { color: var(--muted); font-size: 0.8rem; margin-bottom: 0.25rem; }
textarea { width: 100%; min-height: 5rem; border: 1px solid var(--border); border-radius: 8px; padding: 0.5rem; font: inherit; color: var(--text); background: var(--surface); resize: vertical; }
.blocked-resource { color: var(--danger); font-weight: 700; }
.warning-list { color: #7d4e00; font-size: 0.85rem; }
@media (max-width: 900px) { .layout { grid-template-columns: 1fr; } #threads { position: static; max-height: none; border-left: 0; padding-left: 0; } }
`;

export const styleCss = `${githubMarkdownCss}\n${hljsThemeCss}\n${stetChromeCss}`;

export function shellHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Stet.md</title>
  <link rel="stylesheet" href="/assets/style.css">
</head>
<body>
  <div id="app">
    <header id="topbar">Loading Stet.md…</header>
    <div id="banner"></div>
    <div class="layout">
      <article id="document" class="markdown-body" aria-label="Markdown document"></article>
      <aside id="threads" aria-label="Review threads"></aside>
    </div>
  </div>
  <script type="module" src="/assets/app.js"></script>
</body>
</html>`;
}
