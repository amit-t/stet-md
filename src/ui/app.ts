type StetFetch = (input: string, init?: RequestInit) => Promise<Response>;

type UiTarget = {
  id: string;
  kind: string;
  quote: string;
};

type UiMessage = {
  author: string;
  createdAt: string;
  bodyMarkdown: string;
};

type UiThread = {
  id: string;
  status: "open" | "resolved";
  target: { quote: string; kind?: string };
  messages: UiMessage[];
  anchor?: { state: "attached" | "content_drifted" | "orphan"; targetId?: string; message?: string };
};

type UiDocument = {
  filePath: string;
  fileName: string;
  fileHash: string;
  html: string;
  targets: UiTarget[];
  threads: UiThread[];
  dirty: boolean;
  conflict: { changedOnDisk: boolean; message?: string };
  warnings: { kind: string; message: string; threadId?: string }[];
  errors: { message: string; lineStart?: number; lineEnd?: number }[];
};

export type StetApp = {
  start(): Promise<void>;
  flush(): Promise<void>;
};

type AppOptions = {
  window: Window & typeof globalThis;
  fetch: StetFetch;
};

export function createStetApp(options: AppOptions): StetApp {
  const win = options.window;
  const doc = win.document;
  const fetcher = options.fetch;
  const topbar = doc.querySelector<HTMLElement>("#topbar")!;
  const documentRoot = doc.querySelector<HTMLElement>("#document")!;
  const threadsRoot = doc.querySelector<HTMLElement>("#threads")!;
  const banner = doc.querySelector<HTMLElement>("#banner")!;
  const pending = new Set<Promise<unknown>>();
  let state: UiDocument | undefined;
  let openComposerTargetId: string | undefined;
  let openComposerQuote = "";

  function track<T>(promise: Promise<T>): Promise<T> {
    pending.add(promise);
    promise.finally(() => pending.delete(promise));
    return promise;
  }

  async function flush(): Promise<void> {
    while (pending.size > 0) await Promise.all([...pending]);
  }

  function escapeHtml(value: string): string {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function draftKey(targetId: string): string {
    if (!state) return `stet:draft:unknown:${targetId}`;
    return `stet:draft:${state.filePath}:${state.fileHash}:${targetId}`;
  }

  function hasOpenDraft(): boolean {
    return Boolean(doc.querySelector("textarea[data-composer='comment']"));
  }

  function selectedText(): string {
    return win.getSelection?.()?.toString() || "";
  }

  function renderTopbar(): void {
    if (!state) return;
    const openCount = state.threads.filter((thread) => thread.status === "open").length;
    const dirty = state.dirty || hasOpenDraft();
    topbar.innerHTML = `
      <strong>${escapeHtml(state.fileName)}</strong>
      <span class="${dirty ? "dirty" : "clean"}">${dirty ? "Dirty" : "Saved"}</span>
      <span>${openCount} open</span>
      <button data-action="document-comment">Comment on document</button>
      <button data-action="save" class="primary" ${state.conflict.changedOnDisk ? "disabled" : ""}>Save</button>
      <button data-action="reload">Reload</button>
      <button data-action="patch">Patch</button>
    `;
  }

  function renderBanner(): void {
    if (!state) return;
    const messages: string[] = [];
    if (state.conflict.changedOnDisk) messages.push(state.conflict.message || "File changed on disk.");
    if (state.errors.length > 0) messages.push(`Malformed Stet marker: ${state.errors.map((error) => error.message).join("; ")}`);
    const warningText = state.warnings.map((warning) => warning.message).join(" ");
    if (warningText) messages.push(warningText);
    banner.textContent = messages.join(" ");
    banner.className = messages.length > 0 ? "visible" : "";
  }

  function enhanceTargets(): void {
    for (const element of Array.from(documentRoot.querySelectorAll<HTMLElement>("[data-stet-target]"))) {
      if (element.querySelector(".target-plus")) continue;
      const targetId = element.dataset.stetTarget;
      const button = doc.createElement("button");
      button.type = "button";
      button.className = "target-plus";
      button.dataset.action = "quick-comment";
      button.dataset.targetId = targetId;
      button.title = "Add Stet comment";
      button.textContent = "+";
      element.appendChild(button);
    }
  }

  function renderDocument(): void {
    if (!state) return;
    documentRoot.innerHTML = state.html;
    enhanceTargets();
  }

  function localTime(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    return new win.Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
  }

  function threadClass(thread: UiThread): string {
    const classes = ["thread-card", thread.status];
    if (thread.anchor?.state === "orphan") classes.push("orphan");
    if (thread.anchor?.state === "content_drifted") classes.push("drift");
    return classes.join(" ");
  }

  function renderThread(thread: UiThread): string {
    const collapsed = thread.status === "resolved" ? "<details><summary>Resolved thread</summary>" : "";
    const collapsedEnd = thread.status === "resolved" ? "</details>" : "";
    const anchor = thread.anchor?.state === "orphan" ? "Needs re-attach" : thread.anchor?.state === "content_drifted" ? "content drifted" : "";
    return `<section class="${threadClass(thread)}" data-thread-id="${escapeHtml(thread.id)}">
      ${collapsed}
      <div class="thread-header"><span>${escapeHtml(thread.id)}</span><span class="status">${thread.status}</span></div>
      <div class="quote">${anchor ? `<strong>${anchor}</strong> · ` : ""}${escapeHtml(thread.target?.quote || "Document")}</div>
      ${thread.messages.map((message) => `<div class="message"><div class="message-meta"><strong>${escapeHtml(message.author)}</strong> · ${escapeHtml(localTime(message.createdAt))}</div>${escapeHtml(message.bodyMarkdown)}</div>`).join("")}
      <textarea data-composer="reply" placeholder="Reply"></textarea>
      <button data-action="stage-reply">Reply</button>
      <button data-action="${thread.status === "resolved" ? "reopen" : "resolve"}">${thread.status === "resolved" ? "Reopen" : "Resolve"}</button>
      ${collapsedEnd}
    </section>`;
  }

  function renderComposer(targetId: string): string {
    const target = state?.targets.find((candidate) => candidate.id === targetId);
    const key = draftKey(targetId);
    const draft = win.localStorage.getItem(key) || "";
    return `<section class="composer" data-target-id="${escapeHtml(targetId)}">
      <div class="thread-header"><span>New comment</span><span class="status">${escapeHtml(target?.kind || "target")}</span></div>
      <div class="quote">${escapeHtml(openComposerQuote ? `Selected: ${openComposerQuote}` : target?.quote || "Document")}</div>
      <textarea data-composer="comment" data-draft-key="${escapeHtml(key)}" placeholder="Write a review comment">${escapeHtml(draft)}</textarea>
      <button data-action="stage-comment" class="primary">Stage comment</button>
      <button data-action="cancel-comment">Cancel</button>
    </section>`;
  }

  function renderThreads(): void {
    if (!state) return;
    const orphaned = state.threads.filter((thread) => thread.anchor?.state === "orphan");
    const attached = state.threads.filter((thread) => thread.anchor?.state !== "orphan");
    threadsRoot.innerHTML = `
      ${openComposerTargetId ? renderComposer(openComposerTargetId) : ""}
      ${orphaned.length > 0 ? `<h2>Needs re-attach</h2>${orphaned.map(renderThread).join("")}` : ""}
      <h2>Threads</h2>
      ${attached.length === 0 ? "<p>No review threads yet.</p>" : attached.map(renderThread).join("")}
    `;
  }

  function renderAll(): void {
    renderTopbar();
    renderBanner();
    renderDocument();
    renderThreads();
  }

  async function load(): Promise<void> {
    const response = await fetcher("/api/document");
    if (!response.ok) throw new Error(await response.text());
    state = (await response.json()) as UiDocument;
    renderAll();
  }

  function openComposer(targetId: string, quotedText = ""): void {
    openComposerTargetId = targetId;
    openComposerQuote = quotedText.trim().slice(0, 240);
    renderThreads();
    renderTopbar();
    threadsRoot.querySelector<HTMLTextAreaElement>("textarea[data-composer='comment']")?.focus();
  }

  async function stageComment(): Promise<void> {
    if (!state || !openComposerTargetId) return;
    const textarea = threadsRoot.querySelector<HTMLTextAreaElement>("textarea[data-composer='comment']");
    const bodyMarkdown = textarea?.value.trim() || "";
    if (!bodyMarkdown) return;
    const response = await fetcher("/api/comments", { method: "POST", body: JSON.stringify({ action: "comment", targetId: openComposerTargetId, bodyMarkdown, quotedText: openComposerQuote }) });
    if (!response.ok) throw new Error(await response.text());
    win.localStorage.removeItem(draftKey(openComposerTargetId));
    openComposerTargetId = undefined;
    openComposerQuote = "";
    state = (await response.json()) as UiDocument;
    renderAll();
  }

  async function threadAction(threadId: string, action: "reply" | "resolve" | "reopen"): Promise<void> {
    const card = threadsRoot.querySelector<HTMLElement>(`[data-thread-id='${CSS.escape(threadId)}']`);
    const textarea = card?.querySelector<HTMLTextAreaElement>("textarea[data-composer='reply']");
    const bodyMarkdown = textarea?.value.trim() || (action === "reply" ? "" : action === "resolve" ? "Resolved." : "Reopened.");
    if (!bodyMarkdown) return;
    const response = await fetcher("/api/comments", { method: "POST", body: JSON.stringify({ action, threadId, bodyMarkdown }) });
    if (!response.ok) throw new Error(await response.text());
    state = (await response.json()) as UiDocument;
    renderAll();
  }

  async function save(): Promise<void> {
    const response = await fetcher("/api/save", { method: "POST", body: "{}" });
    if (!response.ok) {
      banner.textContent = await response.text();
      banner.className = "visible";
      return;
    }
    state = (await response.json()) as UiDocument;
    renderAll();
  }

  async function showPatch(): Promise<void> {
    const response = await fetcher("/api/patch");
    const text = await response.text();
    banner.innerHTML = `<pre>${escapeHtml(text || "No pending patch.")}</pre>`;
    banner.className = "visible";
  }

  documentRoot.addEventListener("dblclick", (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-stet-target]");
    if (target?.dataset.stetTarget) openComposer(target.dataset.stetTarget, selectedText());
  });

  documentRoot.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-action='quick-comment']");
    if (button?.dataset.targetId) openComposer(button.dataset.targetId);
  });

  documentRoot.addEventListener("keydown", (event) => {
    if (!(event instanceof win.KeyboardEvent)) return;
    if (event.key.toLowerCase() !== "c") return;
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-stet-target]");
    if (target?.dataset.stetTarget) {
      event.preventDefault();
      openComposer(target.dataset.stetTarget, selectedText());
    }
  });

  topbar.addEventListener("click", (event) => {
    const action = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-action]")?.dataset.action;
    if (action === "document-comment") openComposer("document");
    if (action === "save") track(save());
    if (action === "reload") track(load());
    if (action === "patch") track(showPatch());
  });

  threadsRoot.addEventListener("input", (event) => {
    const textarea = (event.target as HTMLElement).closest<HTMLTextAreaElement>("textarea[data-composer='comment']");
    if (!textarea) return;
    win.localStorage.setItem(textarea.dataset.draftKey || draftKey(openComposerTargetId || "document"), textarea.value);
    renderTopbar();
  });

  threadsRoot.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-action]");
    if (!button) return;
    const action = button.dataset.action;
    if (action === "stage-comment") track(stageComment());
    if (action === "cancel-comment") {
      if (openComposerTargetId) win.localStorage.removeItem(draftKey(openComposerTargetId));
      openComposerTargetId = undefined;
      openComposerQuote = "";
      renderAll();
    }
    const card = button.closest<HTMLElement>("[data-thread-id]");
    const threadId = card?.dataset.threadId;
    if (threadId && (action === "stage-reply" || action === "resolve" || action === "reopen")) {
      track(threadAction(threadId, action === "stage-reply" ? "reply" : action));
    }
  });

  win.addEventListener("beforeunload", (event) => {
    if (state?.dirty || hasOpenDraft()) {
      event.preventDefault();
      event.returnValue = "Unsaved Stet comments will be lost.";
    }
  });

  return { start: load, flush };
}

declare const window: (Window & typeof globalThis) | undefined;

if (typeof window !== "undefined" && window.document?.querySelector("#app")) {
  createStetApp({ window, fetch: window.fetch.bind(window) }).start().catch((error) => {
    const banner = window.document.querySelector<HTMLElement>("#banner");
    if (banner) {
      banner.textContent = error instanceof Error ? error.message : String(error);
      banner.className = "visible";
    }
  });
}
