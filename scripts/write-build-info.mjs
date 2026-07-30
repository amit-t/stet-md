import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const packageJson = JSON.parse(readFileSync(resolve(repoRoot, "package.json"), "utf8"));
const outputPath = resolve(repoRoot, "dist/buildInfo.json");

function gitCommit() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "unknown";
  }
}

const buildInfo = {
  version: String(packageJson.version),
  builtAt: new Date().toISOString(),
  commit: gitCommit(),
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(buildInfo, null, 2)}\n`, "utf8");
console.log(`Build identity: v${buildInfo.version} · ${buildInfo.builtAt} · ${buildInfo.commit.slice(0, 12)}`);
