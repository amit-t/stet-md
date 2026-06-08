import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli } from "../../src/cli/index.js";
import { loadDoc, saveDoc } from "../../src/cli/io.js";

const NOW = () => new Date("2026-06-07T15:00:15Z");

let dir: string;
let file: string;

interface RunOut {
  code: number;
  stdout: string;
  stderr: string;
}

async function run(argv: string[]): Promise<RunOut> {
  const outLines: string[] = [];
  const errLines: string[] = [];
  const code = await runCli(argv, {
    stdout: (l) => outLines.push(l),
    stderr: (l) => errLines.push(l),
    now: NOW,
    env: { STET_AUTHOR: "Amit" },
  });
  return { code, stdout: outLines.join("\n"), stderr: errLines.join("\n") };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "stet-cli-"));
  file = join(dir, "prd.md");
  writeFileSync(
    file,
    "# Spec\n\n## Product goals\n\nSupport block-level comments.\n\n## Non-goals\n\nNo real-time collab.\n",
    "utf8",
  );
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

async function seedThread(): Promise<string> {
  const r = await run([
    "comment",
    file,
    "--target",
    "heading:Product goals",
    "--author",
    "Amit",
    "--message",
    "Needs a goal about agents replying in-file.",
  ]);
  expect(r.code).toBe(0);
  const id = r.stdout.match(/stt_\w+/)![0];
  return id;
}

describe("informational commands", () => {
  it("--version prints a semver", async () => {
    const r = await run(["--version"]);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/^\d+\.\d+\.\d+$/);
  });
  it("--help prints usage", async () => {
    const r = await run(["--help"]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("Stet.md");
    expect(r.stdout).toContain("stet-md list --json FILE.md");
    expect(r.stdout).toContain("Alias: stmd");
  });
  it("--print-agent-protocol prints the protocol", async () => {
    const r = await run(["--print-agent-protocol"]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("Stet.md agent protocol");
    expect(r.stdout).toContain("stet-md reply FILE.md");
  });
});

describe("comment + list --json", () => {
  it("creates a thread and lists it as parseable JSON", async () => {
    const id = await seedThread();
    const r = await run(["list", "--json", file]);
    expect(r.code).toBe(0);
    const data = JSON.parse(r.stdout);
    expect(data.file).toContain("prd.md");
    expect(data.threads).toHaveLength(1);
    const t = data.threads[0];
    expect(t.id).toBe(id);
    expect(t.status).toBe("open");
    expect(t.target.kind).toBe("heading");
    expect(t.target.headingPath).toEqual(["Spec", "Product goals"]);
    expect(t.messages[0].author).toBe("Amit");
    expect(t.messages[0].bodyMarkdown).toContain("agents replying");
  });
});

describe("reply", () => {
  it("appends exactly one message and preserves bytes outside the block", async () => {
    const id = await seedThread();
    const before = readFileSync(file, "utf8");
    const r = await run([
      "reply",
      file,
      "--thread",
      id,
      "--author",
      "Claude",
      "--message",
      "Agreed — added goal 6.",
    ]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain(`Replied to ${id}`);

    const after = readFileSync(file, "utf8");
    // The original heading/body text is still present verbatim.
    expect(after).toContain("## Product goals");
    expect(after).toContain("## Non-goals\n\nNo real-time collab.\n");

    const data = JSON.parse((await run(["list", "--json", file])).stdout);
    expect(data.threads[0].messages).toHaveLength(2);
    expect(data.threads[0].messages[1].author).toBe("Claude");

    // Only the thread block region changed; non-goals section untouched.
    expect(before.slice(before.indexOf("## Non-goals"))).toBe(
      after.slice(after.indexOf("## Non-goals")),
    );
  });
});

describe("resolve", () => {
  it("marks resolved, updates timestamp, keeps prior messages", async () => {
    const id = await seedThread();
    const r = await run([
      "resolve",
      file,
      "--thread",
      id,
      "--author",
      "Claude",
      "--message",
      "Done in the edit above.",
    ]);
    expect(r.code).toBe(0);
    const data = JSON.parse((await run(["list", "--json", file])).stdout);
    const t = data.threads[0];
    expect(t.status).toBe("resolved");
    expect(t.messages).toHaveLength(2);
    expect(t.messages[0].bodyMarkdown).toContain("agents replying");
    expect(t.messages[1].bodyMarkdown).toContain("Done in the edit");
  });
});

describe("nonzero exit codes with useful errors", () => {
  it("missing file -> exit 1", async () => {
    const r = await run(["list", "--json", join(dir, "nope.md")]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("no such file");
  });

  it("unknown thread -> exit 1", async () => {
    await seedThread();
    const r = await run([
      "reply",
      file,
      "--thread",
      "stt_20990101_000000_ffffff",
      "--message",
      "hi",
    ]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("no thread with id");
  });

  it("malformed marker -> exit 1 with a line number", async () => {
    writeFileSync(
      file,
      "# Doc\n\n<!-- stet:thread\n: : broken : :\n-->\n> x\n<!-- /stet:thread -->\n",
      "utf8",
    );
    const r = await run(["list", "--json", file]);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/malformed|invalid|marker/i);
    expect(r.stderr).toMatch(/line \d+/);
  });

  it("missing required flag -> usage exit 2", async () => {
    const r = await run(["reply", file, "--message", "hi"]);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("--thread");
  });

  it("unknown target kind -> exit 2", async () => {
    const r = await run([
      "comment",
      file,
      "--target",
      "banana:x",
      "--message",
      "hi",
    ]);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("unknown target kind");
  });
});

describe("changed-file conflict (save pipeline)", () => {
  it("refuses to overwrite when the file changed since load", () => {
    const doc = loadDoc(file);
    // External edit between load and save.
    writeFileSync(file, readFileSync(file, "utf8") + "\nexternal edit\n", "utf8");
    expect(() => saveDoc(doc, "whatever", { now: NOW() })).toThrowError(
      /changed on disk/,
    );
  });
});

describe("bare-file launch (server subsystem not bundled)", () => {
  it("does not start a browser and points to the CLI", async () => {
    const r = await run([file]);
    expect(r.code).toBe(0);
    expect(r.stderr).toContain("not bundled in this core build");
  });
});
