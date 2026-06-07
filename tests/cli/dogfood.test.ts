import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runCli } from "../../src/cli/index.js";

/**
 * End-to-end dogfood over the real fixture: create -> reply -> resolve, then
 * prove the file is byte-identical to the original once the inserted block is
 * removed. Also exercises the `-->` / `--` escaping on a real document.
 */

const NOW = () => new Date("2026-06-07T15:00:15Z");
const fixture = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "fixtures",
  "sample-prd.md",
);

let dir: string;
let file: string;
let original: string;

async function run(argv: string[]): Promise<{ code: number; out: string }> {
  const lines: string[] = [];
  const code = await runCli(argv, {
    stdout: (l) => lines.push(l),
    stderr: () => {},
    now: NOW,
    env: { STET_AUTHOR: "Amit" },
  });
  return { code, out: lines.join("\n") };
}

beforeEach(() => {
  original = readFileSync(fixture, "utf8");
  dir = mkdtempSync(join(tmpdir(), "stet-dogfood-"));
  file = join(dir, "prd.md");
  writeFileSync(file, original, "utf8");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("dogfood full loop on a real fixture", () => {
  it("create -> reply -> resolve and restore the file byte-for-byte", async () => {
    const create = await run([
      "comment",
      file,
      "--target",
      "heading:Product goals",
      "--author",
      "Amit",
      "--message",
      "Round-trip danger: --> and -- and C:\\path must survive.",
    ]);
    expect(create.code).toBe(0);
    const id = create.out.match(/stt_\w+/)![0];

    expect((await run(["reply", file, "--thread", id, "--author", "Claude", "--message", "Agreed."])).code).toBe(0);
    expect((await run(["resolve", file, "--thread", id, "--author", "Claude", "--message", "Done."])).code).toBe(0);

    // The example block inside the fenced code must NOT be parsed as a thread:
    // exactly one real thread exists.
    const data = JSON.parse((await run(["list", "--json", file])).out);
    expect(data.threads).toHaveLength(1);
    expect(data.threads[0].status).toBe("resolved");
    expect(data.threads[0].messages).toHaveLength(3);
    expect(data.threads[0].messages[0].bodyMarkdown).toContain("-->");
    expect(data.threads[0].messages[0].bodyMarkdown).toContain("C:\\path");

    // Remove the single inserted block (plus the blank-line padding we added)
    // and the file must be byte-identical to the original.
    const current = readFileSync(file, "utf8");
    const restored = current.replace(
      /\n\n<!-- stet:thread[\s\S]*?<!-- \/stet:thread -->\n/,
      "\n",
    );
    expect(restored).toBe(original);
  });
});
