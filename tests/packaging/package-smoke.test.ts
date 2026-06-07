import { describe, expect, test } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

describe("package metadata and CLI smoke", () => {
  test("npm identity and binaries match PRD", () => {
    expect(packageJson.name).toBe("@amit-t/stet");
    expect(packageJson.bin.stet).toBe("dist/cli/main.js");
    expect(packageJson.bin.s).toBe("dist/cli/main.js");
    expect(packageJson.bin.redline).toBe("dist/cli/main.js");
    expect(packageJson.bin.rl).toBe("dist/cli/main.js");
  });

  test("built CLI exposes help, version, and agent protocol", () => {
    expect(existsSync("dist/cli/main.js")).toBe(true);
    const version = execFileSync("node", ["dist/cli/main.js", "--version"], { encoding: "utf8" }).trim();
    expect(version).toBe(packageJson.version);

    const help = execFileSync("node", ["dist/cli/main.js", "--help"], { encoding: "utf8" });
    expect(help).toContain("stet FILE.md");
    expect(help).toContain("stet list --json FILE.md");

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

  test("README documents local pnpm install plus no-clone npx and pnpm dlx usage", () => {
    const readme = readFileSync("README.md", "utf8");
    expect(readme).toContain("pnpm install");
    expect(readme).toContain("pnpm run build");
    expect(readme).toContain("pnpm link --global");
    expect(readme).toContain("npx @amit-t/stet@latest README.md");
    expect(readme).toContain("pnpm dlx @amit-t/stet README.md");
    expect(readme).toContain("npm install -g @amit-t/stet");
  });

});
