export const styleCss = `
:root { color-scheme: light; --border: #d0d7de; --muted: #57606a; --accent: #0969da; --danger: #cf222e; --bg: #ffffff; --panel: #f6f8fa; }
* { box-sizing: border-box; }
body { margin: 0; font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #24292f; background: var(--bg); }
#topbar { position: sticky; top: 0; z-index: 10; display: flex; gap: 0.75rem; align-items: center; padding: 0.7rem 1rem; border-bottom: 1px solid var(--border); background: rgba(255,255,255,0.96); backdrop-filter: blur(6px); }
#topbar strong { margin-right: auto; }
#topbar button, .thread-card button, .composer button, .target-plus { border: 1px solid var(--border); background: #fff; border-radius: 6px; padding: 0.35rem 0.6rem; cursor: pointer; }
#topbar button.primary, .composer button.primary { background: var(--accent); border-color: var(--accent); color: white; }
#topbar button:disabled { opacity: 0.45; cursor: not-allowed; }
.dirty { color: #9a6700; font-weight: 700; }
.clean { color: #1a7f37; }
#banner { display: none; padding: 0.75rem 1rem; background: #fff8c5; border-bottom: 1px solid #d4a72c; color: #7d4e00; }
#banner.visible { display: block; }
.layout { display: grid; grid-template-columns: minmax(0, 1fr) 360px; gap: 1.5rem; max-width: 1280px; margin: 0 auto; padding: 1.5rem; }
#document { min-width: 0; padding: 1rem 2rem 4rem; }
#document h1, #document h2, #document h3 { border-bottom: 1px solid #d8dee4; padding-bottom: 0.3rem; }
#document p, #document h1, #document h2, #document h3, #document h4, #document h5, #document h6 { position: relative; }
#document [data-redline-target] { cursor: crosshair; border-radius: 6px; }
#document [data-redline-target]:hover, #document [data-redline-target]:focus { outline: 2px solid rgba(9,105,218,0.25); }
.target-plus { position: absolute; margin-left: 0.4rem; padding: 0.1rem 0.4rem; color: var(--accent); font-weight: 700; }
pre { padding: 1rem; background: #f6f8fa; border-radius: 8px; overflow: auto; }
code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
blockquote { border-left: 4px solid var(--border); margin-left: 0; padding-left: 1rem; color: var(--muted); }
#threads { position: sticky; top: 4rem; align-self: start; max-height: calc(100vh - 5rem); overflow: auto; border-left: 1px solid var(--border); padding-left: 1rem; }
.thread-card, .composer { border: 1px solid var(--border); border-radius: 10px; background: #fff; padding: 0.8rem; margin-bottom: 0.8rem; box-shadow: 0 1px 2px rgba(27,31,36,0.04); }
.thread-card.resolved { background: var(--panel); }
.thread-card.orphan, .thread-card.drift { border-color: #d4a72c; }
.thread-header { display: flex; gap: 0.4rem; align-items: center; justify-content: space-between; font-weight: 700; }
.status { font-size: 0.75rem; text-transform: uppercase; color: var(--muted); }
.quote { color: var(--muted); font-size: 0.85rem; margin: 0.25rem 0 0.5rem; }
.message { border-top: 1px solid var(--border); padding-top: 0.5rem; margin-top: 0.5rem; white-space: pre-wrap; }
.message-meta { color: var(--muted); font-size: 0.8rem; margin-bottom: 0.25rem; }
textarea { width: 100%; min-height: 5rem; border: 1px solid var(--border); border-radius: 8px; padding: 0.5rem; font: inherit; resize: vertical; }
.blocked-resource { color: var(--danger); font-weight: 700; }
.warning-list { color: #7d4e00; font-size: 0.85rem; }
@media (max-width: 900px) { .layout { grid-template-columns: 1fr; } #threads { position: static; max-height: none; border-left: 0; padding-left: 0; } }
`;

export function shellHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Redline</title>
  <link rel="stylesheet" href="/assets/style.css">
</head>
<body>
  <div id="app">
    <header id="topbar">Loading Redline…</header>
    <div id="banner"></div>
    <div class="layout">
      <article id="document" aria-label="Markdown document"></article>
      <aside id="threads" aria-label="Review threads"></aside>
    </div>
  </div>
  <script type="module" src="/assets/app.js"></script>
</body>
</html>`;
}
