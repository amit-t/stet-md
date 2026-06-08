import { describe, expect, test } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

describe("package metadata and CLI smoke", () => {
  test("npm identity and binaries match PRD", () => {
    expect(packageJson.name).toBe("@amit-t/stet-md");
    expect(packageJson.repository.url).toBe("git+https://github.com/amit-t/stet-md.git");
    expect(packageJson.homepage).toBe("https://github.com/amit-t/stet-md#readme");
    expect(packageJson.bugs.url).toBe("https://github.com/amit-t/stet-md/issues");
    expect(packageJson.bin["stet-md"]).toBe("dist/cli/main.js");
    expect(packageJson.bin.stmd).toBe("dist/cli/main.js");
    expect(packageJson.bin.stet).toBeUndefined();
    expect(packageJson.bin.s).toBeUndefined();
    expect(packageJson.bin.redline).toBeUndefined();
    expect(packageJson.bin.rl).toBeUndefined();
  });

  test("source bin shim uses renamed primary command", () => {
    expect(existsSync("bin/stet-md")).toBe(true);
    expect(existsSync("bin/stet")).toBe(false);
    expect(statSync("bin/stet-md").mode & 0o111).toBeGreaterThan(0);
    const shim = readFileSync("bin/stet-md", "utf8");
    expect(shim).toContain("stet-md");
    expect(shim).not.toContain("stet: internal error");
  });

  test("built CLI exposes help, version, and agent protocol", () => {
    expect(existsSync("dist/cli/main.js")).toBe(true);
    const version = execFileSync("node", ["dist/cli/main.js", "--version"], { encoding: "utf8" }).trim();
    expect(version).toBe(packageJson.version);

    const help = execFileSync("node", ["dist/cli/main.js", "--help"], { encoding: "utf8" });
    expect(help).toContain("Stet.md");
    expect(help).toContain("stet-md FILE.md");
    expect(help).toContain("stet-md list --json FILE.md");
    expect(help).toContain("Alias: stmd");

    const protocol = execFileSync("node", ["dist/cli/main.js", "--print-agent-protocol"], { encoding: "utf8" });
    expect(protocol).toContain("Do not delete `stet:thread` blocks");
  });

  test("list, reply, resolve commands work without browser server", () => {
    const dir = mkdtempSync(join(tmpdir(), "stet-cli-"));
    const file = join(dir, "fixture.md");
    writeFileSync(file, "# Title\n\nParagraph.\n");

    execFileSync("node", ["dist/cli/main.js", "comment", file, "--target", "paragraph:0", "--author", "Amit", "--message", "CLI comment"], { encoding: "utf8" });
    const listed = JSON.parse(execFileSync("node", ["dist/cli/main.js", "list", "--json", file], { encoding: "utf8" }));
    expect(listed.threads).toHaveLength(1);
    const threadId = listed.threads[0].id;

    execFileSync("node", ["dist/cli/main.js", "reply", file, "--thread", threadId, "--author", "Claude", "--message", "Agent reply"], { encoding: "utf8" });
    execFileSync("node", ["dist/cli/main.js", "resolve", file, "--thread", threadId, "--author", "Claude", "--message", "Resolved"], { encoding: "utf8" });
    const resolved = JSON.parse(execFileSync("node", ["dist/cli/main.js", "list", "--json", file], { encoding: "utf8" }));

    expect(resolved.threads[0].status).toBe("resolved");
    expect(resolved.threads[0].messages.map((message: { bodyMarkdown: string }) => message.bodyMarkdown)).toEqual(["CLI comment", "Agent reply", "Resolved"]);
  });

  test("CLI exits nonzero for unknown thread and malformed marker", () => {
    const dir = mkdtempSync(join(tmpdir(), "stet-cli-error-"));
    const file = join(dir, "fixture.md");
    writeFileSync(file, "# Title\n\nParagraph.\n");

    expect(() => execFileSync("node", ["dist/cli/main.js", "reply", file, "--thread", "stt_missing", "--author", "Claude", "--message", "Nope"], { encoding: "utf8", stdio: "pipe" })).toThrow();

    const malformed = join(dir, "malformed.md");
    writeFileSync(malformed, "# Title\n\n<!-- stet:thread\nid: broken\n-->\n<!-- /stet:thread -->\n");
    expect(() => execFileSync("node", ["dist/cli/main.js", "list", "--json", malformed], { encoding: "utf8", stdio: "pipe" })).toThrow();
  });

  test("repo uses pnpm as the package manager", () => {
    expect(packageJson.packageManager).toMatch(/^pnpm@/);
    expect(packageJson.scripts["test:packaging"]).toContain("pnpm run build");
    expect(packageJson.scripts.ci).toContain("pnpm run typecheck");
    expect(existsSync("pnpm-lock.yaml")).toBe(true);
    expect(existsSync("package-lock.json")).toBe(false);
  });

  test("PRDs document Stet.md repo and npm identity", () => {
    const master = readFileSync("docs/prd/00-stet-master-prd.md", "utf8");
    const packaging = readFileSync("docs/prd/05-packaging-testing-and-release-prd.md", "utf8");
    expect(master).toContain("**GitHub repo:** `stet-md`");
    expect(master).toContain("**npm package:** `@amit-t/stet-md`");
    expect(master).toContain("**Binary:** `stet-md` (alias `stmd`)");
    expect(packaging).toContain("- Repo: `stet-md`");
    expect(packaging).toContain("- npm package: `@amit-t/stet-md`");
    expect(packaging).toContain("- Binary: `stet-md`");
    expect(packaging).toContain("- Alias: `stmd`");
  });

  test("README documents local checkout install plus after-publish package install", () => {
    const readme = readFileSync("README.md", "utf8");
    expect(readme).toContain("Package metadata targets [`@amit-t/stet-md`]");
    expect(readme).toContain("### Install from local checkout");
    expect(readme).toContain("pnpm install");
    expect(readme).toContain("pnpm run build");
    expect(readme).toContain("pnpm link --global");
    expect(readme).toContain("npx @amit-t/stet-md@latest README.md");
    expect(readme).toContain("pnpm dlx @amit-t/stet-md README.md");
    expect(readme).toContain("pnpm add --global @amit-t/stet-md");
    expect(readme).toContain("npm install -g @amit-t/stet-md");
    expect(readme).toContain("stet-md --version");
    expect(readme).toContain("stmd README.md");
    expect(readme).not.toContain("Amit's local checkout");
    expect(readme).not.toContain("Stet.md is published to npm");
  });

  test("docs site labels package install commands as post-publish", () => {
    const docsIndex = readFileSync("docs/index.html", "utf8");
    expect(docsIndex).toContain("<h3>Local checkout</h3>");
    expect(docsIndex).toContain("pnpm link --global");
    expect(docsIndex).toContain("<h3 style=\"margin-top:1rem\">After npm publish</h3>");
    expect(docsIndex).toContain("<h3 style=\"margin-top:1rem\">Persistent install after publish</h3>");
  });

  test("user-facing package and repo identity references use stet-md spelling", () => {
    const files = [
      "README.md",
      "docs/RELEASE_NOTES.md",
      "docs/index.html",
      "docs/site.js",
      "docs/prd/00-stet-master-prd.md",
      "docs/prd/05-packaging-testing-and-release-prd.md",
    ];

    for (const file of files) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toContain("@amit-t/stet.md");
      expect(text, file).not.toContain("github.com/amit-t/stet.md");
      expect(text, file).not.toContain("github.io/stet.md");
      expect(text, file).not.toContain("`stet.md`");
    }
  });
});
