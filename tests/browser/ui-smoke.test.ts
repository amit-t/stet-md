import { describe, expect, test, vi } from "vitest";
import { Window } from "happy-dom";
import { createStetApp } from "../../src/ui/app.js";

function createWindow() {
  const window = new Window({ url: "http://127.0.0.1:43117/" });
  window.document.body.innerHTML = `
    <div id="app">
      <header id="topbar"></header>
      <main><article id="document"></article><aside id="threads"></aside></main>
      <div id="banner"></div>
    </div>`;
  return window;
}

const documentPayload = {
  filePath: "/tmp/review.md",
  fileName: "review.md",
  fileHash: "sha256:loaded",
  html: `<h1 data-stet-target="t1" tabindex="0">Title</h1><p data-stet-target="t2" tabindex="0">Paragraph one.</p>`,
  targets: [
    { id: "doc", kind: "document", quote: "Document" },
    { id: "t1", kind: "heading", quote: "Title" },
    { id: "t2", kind: "paragraph", quote: "Paragraph one." },
  ],
  threads: [],
  dirty: false,
  conflict: { changedOnDisk: false },
  warnings: [],
  errors: [],
};

describe("browser UI smoke", () => {
  test("double-click paragraph stages comment and save refreshes clean state", async () => {
    const window = createWindow();
    const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
      if (path === "/api/document") return Response.json(documentPayload);
      if (path === "/api/comments") {
        const body = JSON.parse(String(init?.body));
        expect(body.action).toBe("comment");
        expect(body.targetId).toBe("t2");
        return Response.json({ ...documentPayload, dirty: true, threads: [{ id: "stt_1", status: "open", target: { quote: "Paragraph one." }, messages: [{ author: "Amit", createdAt: "2026-06-07T10:00:00Z", bodyMarkdown: body.bodyMarkdown }] }] });
      }
      if (path === "/api/save") return Response.json({ ...documentPayload, dirty: false, threads: [{ id: "stt_1", status: "open", target: { quote: "Paragraph one." }, messages: [{ author: "Amit", createdAt: "2026-06-07T10:00:00Z", bodyMarkdown: "Browser note" }] }] });
      throw new Error(`unexpected fetch ${path}`);
    });

    const app = createStetApp({ window: window as unknown as Window & typeof globalThis, fetch: fetchMock as unknown as typeof fetch });
    await app.start();

    window.document.querySelector<HTMLParagraphElement>("p[data-stet-target='t2']")!.dispatchEvent(new window.Event("dblclick", { bubbles: true }));
    const textarea = window.document.querySelector<HTMLTextAreaElement>("textarea")!;
    textarea.value = "Browser note";
    textarea.dispatchEvent(new window.Event("input", { bubbles: true }));
    window.document.querySelector<HTMLButtonElement>("button[data-action='stage-comment']")!.click();
    await app.flush();

    expect(window.document.querySelector("#topbar")!.textContent).toContain("Dirty");
    expect(window.document.querySelector("#threads")!.textContent).toContain("Browser note");

    window.document.querySelector<HTMLButtonElement>("button[data-action='save']")!.click();
    await app.flush();

    expect(fetchMock).toHaveBeenCalledWith("/api/save", expect.objectContaining({ method: "POST" }));
    expect(window.document.querySelector("#topbar")!.textContent).not.toContain("Dirty");
  });

  test("draft composer text survives app recreation through localStorage", async () => {
    const firstWindow = createWindow();
    const fetchMock = vi.fn(async () => Response.json(documentPayload));
    const firstApp = createStetApp({ window: firstWindow as unknown as Window & typeof globalThis, fetch: fetchMock as unknown as typeof fetch });
    await firstApp.start();

    firstWindow.document.querySelector<HTMLParagraphElement>("p[data-stet-target='t2']")!.dispatchEvent(new firstWindow.Event("dblclick", { bubbles: true }));
    const firstTextarea = firstWindow.document.querySelector<HTMLTextAreaElement>("textarea")!;
    firstTextarea.value = "Recovered draft";
    firstTextarea.dispatchEvent(new firstWindow.Event("input", { bubbles: true }));

    const secondWindow = createWindow();
    secondWindow.localStorage.setItem("stet:draft:/tmp/review.md:sha256:loaded:t2", "Recovered draft");
    const secondApp = createStetApp({ window: secondWindow as unknown as Window & typeof globalThis, fetch: fetchMock as unknown as typeof fetch });
    await secondApp.start();

    secondWindow.document.querySelector<HTMLParagraphElement>("p[data-stet-target='t2']")!.dispatchEvent(new secondWindow.Event("dblclick", { bubbles: true }));
    expect(secondWindow.document.querySelector<HTMLTextAreaElement>("textarea")!.value).toBe("Recovered draft");
  });

  test("open composer prevents accidental reload through beforeunload", async () => {
    const window = createWindow();
    const fetchMock = vi.fn(async () => Response.json(documentPayload));
    const app = createStetApp({ window: window as unknown as Window & typeof globalThis, fetch: fetchMock as unknown as typeof fetch });
    await app.start();

    window.document.querySelector<HTMLParagraphElement>("p[data-stet-target='t2']")!.dispatchEvent(new window.Event("dblclick", { bubbles: true }));
    const event = new window.Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  test("conflict banner is visible and save button disabled when file changed", async () => {
    const window = createWindow();
    const fetchMock = vi.fn(async () => Response.json({ ...documentPayload, conflict: { changedOnDisk: true, message: "File changed on disk" } }));
    const app = createStetApp({ window: window as unknown as Window & typeof globalThis, fetch: fetchMock as unknown as typeof fetch });

    await app.start();

    expect(window.document.querySelector("#banner")!.textContent).toContain("File changed on disk");
    expect(window.document.querySelector<HTMLButtonElement>("button[data-action='save']")!.disabled).toBe(true);
  });
});
