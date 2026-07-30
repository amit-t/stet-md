import { readFileSync } from "node:fs";

export type BuildInfo = {
  version: string;
  builtAt: string;
  commit: string;
};

function validBuildInfo(value: unknown): value is BuildInfo {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<BuildInfo>;
  return typeof candidate.version === "string"
    && candidate.version.length > 0
    && typeof candidate.builtAt === "string"
    && candidate.builtAt.length > 0
    && typeof candidate.commit === "string"
    && candidate.commit.length > 0;
}

function packageVersion(): string {
  try {
    const value = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as { version?: unknown };
    return typeof value.version === "string" && value.version.length > 0 ? value.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

export function readBuildInfo(): BuildInfo {
  const candidates = [
    new URL("../buildInfo.json", import.meta.url),
    new URL("../../dist/buildInfo.json", import.meta.url),
  ];

  for (const candidate of candidates) {
    try {
      const value: unknown = JSON.parse(readFileSync(candidate, "utf8"));
      if (validBuildInfo(value)) return value;
    } catch {
      // Source-mode and incomplete-build callers fall through to next location.
    }
  }

  return {
    version: packageVersion(),
    builtAt: "unknown",
    commit: "unknown",
  };
}

export function formatBuildIdentity(buildInfo: BuildInfo): string {
  return `stet-md ${buildInfo.version} (built ${buildInfo.builtAt}, commit ${buildInfo.commit})`;
}
