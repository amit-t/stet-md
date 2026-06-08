const repoUrl = "https://github.com/amit-t/stet.md";

/* ===== CONTENT ===== */
const features = [
  {
    slug: "browser-review-ui",
    name: "Browser review UI",
    category: "Review UI",
    usage: "stet FILE.md",
    tagline: "Threaded review comments in a hardened loopback browser UI.",
    detail:
      "Top bar with file name, dirty/saved state, open-thread count, Save, Reload, and patch preview. " +
      "Rendered Markdown body with commentable headings and paragraphs; + affordances, double-click " +
      "comments, keyboard c on focused blocks, and document-level comments. Side-panel thread cards with " +
      "replies, resolve/reopen controls, orphan and content-drift warnings. localStorage draft recovery " +
      "keyed by file path and loaded file hash. Conflict banner when the file changes on disk before save.",
    commands: [
      { label: "Open a file", code: "stet README.md" },
      { label: "Pick author + browser", code: 'stet --author "Amit" --app "Google Chrome" README.md' },
      { label: "Fixed port, no auto-open", code: "stet --no-open --port 43117 README.md" },
    ],
    links: [
      { label: "Browser UI PRD", href: "/blob/main/docs/prd/03-local-server-and-browser-ui-prd.md" },
    ],
  },
  {
    slug: "agent-cli",
    name: "Agent CLI",
    category: "Agent CLI",
    usage: "stet list|reply|resolve",
    tagline: "AI agents review through a safe CLI instead of hand-editing markers.",
    detail:
      "Agents never hand-edit the stet:thread markers. They list open threads as JSON, reply to a thread by " +
      "id, and resolve threads with an attribution message. stet --print-agent-protocol emits the full " +
      "machine-readable protocol. A comment helper exists for smoke tests and scripts.",
    commands: [
      { label: "List threads as JSON", code: "stet list --json FILE.md" },
      { label: "Reply to a thread", code: 'stet reply FILE.md --thread stt_... --author Claude --message "I updated the paragraph above."' },
      { label: "Resolve a thread", code: 'stet resolve FILE.md --thread stt_... --author Claude --message "Resolved by the edit above."' },
      { label: "Print the full protocol", code: "stet --print-agent-protocol" },
      { label: "Seed a comment (scripts)", code: 'stet comment FILE.md --target paragraph:0 --author Amit --message "Please tighten this."' },
    ],
    links: [
      { label: "AGENT_PROTOCOL.md", href: "/blob/main/docs/AGENT_PROTOCOL.md" },
      { label: "Agent CLI PRD", href: "/blob/main/docs/prd/02-agent-cli-prd.md" },
    ],
  },
  {
    slug: "storage-format",
    name: "Storage format",
    category: "Storage",
    usage: "stet:thread marker",
    tagline: "Threads stored inline as structured markers; the Markdown file is the source of truth.",
    detail:
      "Each thread is a structured stet:thread HTML-comment marker (version, id, status, timestamps, anchor " +
      "target, messages) plus a generated visible blockquote. The structured marker is the source of truth; " +
      "the blockquote is regenerated from marker data on save. Message bodies containing unsafe -- sequences " +
      "are escaped so they cannot terminate the HTML comment early, then decoded losslessly on parse. " +
      "Thread IDs look like stt_20260607_150015_7f3a9c.",
    commands: [
      { label: "Marker shape", code: "<!-- stet:thread\nversion: 1\nid: stt_...\nstatus: open\ntarget:\n  kind: paragraph\n  heading_path: [Product goals]\n  block_ordinal: 0\nmessages:\n  - author: Amit\n    body: |-\n      This needs a clearer agent workflow.\n-->" },
    ],
    links: [
      { label: "Storage + splice PRD", href: "/blob/main/docs/prd/01-storage-format-and-splice-prd.md" },
    ],
  },
  {
    slug: "write-safety",
    name: "Write safety",
    category: "Safety",
    usage: "byte splices only",
    tagline: "Saves by byte splices only — never full-stringifies your Markdown.",
    detail:
      "Stet.md never re-serializes the whole document to save a comment; it edits exact byte ranges. Tests cover " +
      "preservation of LF, CRLF, BOM, final-newline state, trailing spaces, list markers, reference links, and " +
      "paragraph wrapping outside the splice ranges. If an external formatter rewrites the file while Stet.md is " +
      "open, Stet.md detects the file-hash change and blocks the save; reload before saving staged comments. " +
      "Backups are written before replacement under .stet/backups/. MVP has no force-save by design.",
    commands: [
      { label: "Transient state layout", code: ".stet/\n  .gitignore   # contains *\n  backups/\n  locks/" },
    ],
    links: [
      { label: "Safety / conflict / drafts PRD", href: "/blob/main/docs/prd/04-safety-conflict-and-drafts-prd.md" },
    ],
  },
  {
    slug: "security-model",
    name: "Security model",
    category: "Security",
    usage: "loopback + hardened",
    tagline: "Local-only, no telemetry, hardened loopback server.",
    detail:
      "Binds to 127.0.0.1 and serves only the selected Markdown file plus bundled UI assets. Uses an HttpOnly " +
      "SameSite=Strict cookie token (never placed in the URL); missing or wrong tokens are rejected for API " +
      "routes. Validates the Host header to reject DNS-rebinding attempts. Sends Referrer-Policy: no-referrer " +
      "and a restrictive CSP (self-only scripts/styles, self/data images, no objects/forms/framing). Escapes " +
      "raw Markdown HTML and blocks remote Markdown images/resources by default.",
    commands: [
      { label: "Start hardened server only", code: "stet --no-open --port 43117 README.md" },
    ],
    links: [
      { label: "Packaging / testing / release PRD", href: "/blob/main/docs/prd/05-packaging-testing-and-release-prd.md" },
    ],
  },
];

const changes = [
  {
    date: "2026-06-07",
    items: [
      "Renamed the project to Stet.md; published under the @amit-t npm scope.",
      "Binaries stet and s, with legacy redline / rl aliases.",
      "Switched repository tooling to pnpm; pnpm-lock.yaml is the only lockfile.",
      "Scaffolded this GitHub Pages docs site with the gh-repo-mirror design system.",
    ],
  },
  {
    date: "MVP",
    items: [
      "Inline stet:thread storage with byte-splice persistence.",
      "Hardened loopback browser review UI with draft recovery and conflict detection.",
      "Agent CLI: list / reply / resolve / comment / --print-agent-protocol.",
      "Known limit: no list-item, table-row, or text-range comments yet.",
    ],
  },
];

/* ===== STATE ===== */
const state = { search: "", category: "All" };

/* ===== DOM REFS ===== */
const $ = (sel) => document.querySelector(sel);
const searchInput = $("#search-input");
const filtersEl = $("#category-filters");
const grid = $("#features-grid");
const changeList = $("#change-list");
const featureCountEl = $("#feature-count");
const drawer = $("#feature-drawer");
const drawerBackdrop = $("#drawer-backdrop");
const drawerCloseBtn = $("#drawer-close");
const drawerContent = $("#drawer-content");
const themeToggle = $("#theme-toggle");

/* ===== CATEGORIES ===== */
const categories = ["All", ...new Set(features.map((f) => f.category))];
featureCountEl.textContent = String(features.length);

/* ===== CATEGORY -> CSS CLASS MAPPING ===== */
function catClass(category) {
  const map = {
    "Review UI": "cat-ux-design",
    "Agent CLI": "cat-agent-behavior",
    "Storage": "cat-engineering",
    "Safety": "cat-ai-agent",
    "Security": "cat-product-management",
  };
  return map[category] || "";
}

/* ===== THEME ===== */
function initTheme() {
  const stored = localStorage.getItem("theme");
  if (stored === "dark" || (!stored && window.matchMedia("(prefers-color-scheme: dark)").matches)) {
    document.body.classList.add("dark");
  }
  updateThemeIcon();
}

function toggleTheme() {
  document.body.classList.toggle("dark");
  localStorage.setItem("theme", document.body.classList.contains("dark") ? "dark" : "light");
  updateThemeIcon();
}

function updateThemeIcon() {
  const isDark = document.body.classList.contains("dark");
  themeToggle.textContent = isDark ? "☀" : "☾";
  themeToggle.setAttribute("aria-label", isDark ? "Switch to light mode" : "Switch to dark mode");
}

themeToggle.addEventListener("click", toggleTheme);
initTheme();

/* ===== EVENTS ===== */
searchInput.addEventListener("input", (e) => {
  state.search = e.target.value.trim().toLowerCase();
  renderFeatures();
});

drawerBackdrop.addEventListener("click", closeDrawer);
drawerCloseBtn.addEventListener("click", closeDrawer);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && drawer.classList.contains("open")) closeDrawer();
});

/* ===== HELPERS ===== */
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function fullHref(href) {
  return href.startsWith("http") ? href : repoUrl + href;
}

/* ===== RENDER ===== */
function renderFilters() {
  filtersEl.innerHTML = "";
  for (const cat of categories) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `filter-btn${cat === state.category ? " active" : ""}`;
    btn.textContent = cat;
    btn.addEventListener("click", () => {
      state.category = cat;
      renderFilters();
      renderFeatures();
    });
    filtersEl.appendChild(btn);
  }
}

function renderFeatures() {
  const filtered = features.filter((f) => {
    const matchCat = state.category === "All" || f.category === state.category;
    const hay = `${f.name} ${f.category} ${f.tagline} ${f.detail}`.toLowerCase();
    const matchSearch = !state.search || hay.includes(state.search);
    return matchCat && matchSearch;
  });

  grid.innerHTML = "";

  if (!filtered.length) {
    const p = document.createElement("p");
    p.className = "empty-state";
    p.textContent = "No capabilities match the current filter.";
    grid.appendChild(p);
    return;
  }

  for (const feature of filtered) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "skill-card";
    card.innerHTML = `
      <span class="skill-card-cat ${catClass(feature.category)}">${feature.category}</span>
      <h3 class="skill-card-title">${feature.name}</h3>
      <p class="skill-card-tagline">${feature.tagline}</p>
      <p class="skill-card-detail">${feature.detail.slice(0, 160)}&hellip;</p>
      <span class="skill-card-footer">&rarr; Commands + Details</span>
    `;
    card.addEventListener("click", () => openDrawer(feature));
    grid.appendChild(card);
  }
}

function renderChanges() {
  changeList.innerHTML = "";
  if (!changes.length) {
    const p = document.createElement("p");
    p.className = "empty-state";
    p.textContent = "No changelog entries yet.";
    changeList.appendChild(p);
    return;
  }
  for (const change of changes) {
    const card = document.createElement("article");
    card.className = "change-card";
    card.innerHTML = `
      <span class="change-date">${change.date}</span>
      <ul>${change.items.map((i) => `<li>${i}</li>`).join("")}</ul>
    `;
    changeList.appendChild(card);
  }
}

/* ===== PERMALINK ===== */
const SHARE_ICON = `<svg viewBox="0 0 24 24"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>`;

function getFeaturePermalink(slug) {
  const url = new URL(window.location.href);
  url.hash = `feature=${slug}`;
  return url.toString();
}

function openFeatureFromHash() {
  const hash = window.location.hash;
  if (!hash.startsWith("#feature=")) return;
  const slug = decodeURIComponent(hash.slice(9));
  const feature = features.find((f) => f.slug === slug);
  if (feature) openDrawer(feature, true);
}

/* ===== DRAWER ===== */
function openDrawer(feature, fromHash) {
  if (!fromHash) {
    history.replaceState(null, "", `#feature=${feature.slug}`);
  }

  const commandsHtml = feature.commands
    .map(
      (c) => `
    <div class="drawer-cmd">
      <p style="margin:0 0 0.35rem;font-size:0.82rem;color:var(--muted-light)">${c.label}</p>
      <pre><code>${escapeHtml(c.code)}</code></pre>
    </div>`
    )
    .join("");

  const linksHtml = feature.links
    .map(
      (l) =>
        `<a class="neo-btn" href="${fullHref(l.href)}" target="_blank" rel="noreferrer">${l.label}</a>`
    )
    .join("");

  drawerContent.innerHTML = `
    <span class="section-eyebrow ${catClass(feature.category)}">Capability</span>
    <h2>${feature.name}</h2>

    <div class="drawer-meta">
      <span class="meta-pill meta-category">${feature.category}</span>
      <span class="meta-pill meta-usage">${feature.usage}</span>
    </div>

    <section class="drawer-section">
      <h3>What it does</h3>
      <p><strong>${feature.tagline}</strong></p>
      <p>${feature.detail}</p>
    </section>

    <section class="drawer-section">
      <h3>Commands</h3>
      ${commandsHtml}
    </section>

    <section class="drawer-section">
      <h3>Source files</h3>
      <div class="drawer-links">
        ${linksHtml}
        <a class="neo-btn" href="${repoUrl}/blob/main/README.md" target="_blank" rel="noreferrer">README</a>
      </div>
    </section>

    <section class="drawer-section">
      <h3>Share this capability</h3>
      <div class="drawer-links">
        <button class="neo-btn share-btn" type="button" data-slug="${feature.slug}">
          ${SHARE_ICON}<span>Copy link</span>
        </button>
      </div>
    </section>
  `;

  drawerContent.querySelector(".share-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    const btn = e.currentTarget;
    const link = getFeaturePermalink(btn.dataset.slug);
    copyText(link).then(() => {
      btn.innerHTML = `${CHECK_ICON}<span>Copied!</span>`;
      btn.classList.add("copied");
      setTimeout(() => {
        btn.innerHTML = `${SHARE_ICON}<span>Copy link</span>`;
        btn.classList.remove("copied");
      }, 1500);
    });
  });

  addCopyButtons(drawerContent);
  drawer.classList.add("open");
  document.body.classList.add("drawer-open");
  drawerCloseBtn.focus();
}

function closeDrawer() {
  drawer.classList.remove("open");
  document.body.classList.remove("drawer-open");
  if (window.location.hash.startsWith("#feature=")) {
    history.replaceState(null, "", window.location.pathname + window.location.search);
  }
}

/* ===== COPY TO CLIPBOARD ===== */
const COPY_ICON = `<svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
const CHECK_ICON = `<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>`;

function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text);
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.cssText = "position:fixed;left:-9999px;top:-9999px;opacity:0";
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand("copy"); } catch (_) { /* best-effort */ }
  document.body.removeChild(ta);
  return Promise.resolve();
}

function flashCopied(btn) {
  btn.innerHTML = `${CHECK_ICON}<span>Copied</span>`;
  btn.classList.add("copied");
  setTimeout(() => {
    btn.innerHTML = `${COPY_ICON}<span>Copy</span>`;
    btn.classList.remove("copied");
  }, 1500);
}

function addCopyButtons(root = document) {
  root.querySelectorAll("pre").forEach((pre) => {
    if (pre.querySelector(".copy-btn")) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "copy-btn";
    btn.setAttribute("aria-label", "Copy to clipboard");
    btn.innerHTML = `${COPY_ICON}<span>Copy</span>`;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const code = pre.querySelector("code");
      const text = (code || pre).textContent;
      copyText(text).then(() => flashCopied(btn)).catch(() => flashCopied(btn));
    });
    pre.appendChild(btn);
  });
}

/* ===== BOOT ===== */
renderFilters();
renderFeatures();
renderChanges();
addCopyButtons();
openFeatureFromHash();
window.addEventListener("hashchange", openFeatureFromHash);
