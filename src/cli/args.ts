import { StetError } from "../core/errors.js";

/**
 * Minimal argv parser. Supports `--flag value`, `--flag=value`, boolean flags,
 * and positional arguments. No external dependency so the CLI stays light.
 */

export interface ParsedArgs {
  positionals: string[];
  flags: Record<string, string | true>;
}

const BOOLEAN_FLAGS = new Set([
  "json",
  "no-open",
  "help",
  "version",
  "print-agent-protocol",
]);

export function parseArgs(argv: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags: Record<string, string | true> = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--") {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    if (arg.startsWith("--")) {
      const body = arg.slice(2);
      const eq = body.indexOf("=");
      if (eq !== -1) {
        flags[body.slice(0, eq)] = body.slice(eq + 1);
        continue;
      }
      if (BOOLEAN_FLAGS.has(body)) {
        flags[body] = true;
        continue;
      }
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) {
        // Treat as a valueless flag rather than swallowing the next flag.
        flags[body] = true;
      } else {
        flags[body] = next;
        i++;
      }
    } else if (arg.startsWith("-") && arg.length > 1) {
      // Short flags: -h, -v.
      const short = arg.slice(1);
      if (short === "h") flags["help"] = true;
      else if (short === "v") flags["version"] = true;
      else throw new StetError("usage", `unknown option "-${short}"`);
    } else {
      positionals.push(arg);
    }
  }

  return { positionals, flags };
}

export function requireFlag(
  flags: Record<string, string | true>,
  name: string,
): string {
  const v = flags[name];
  if (typeof v !== "string" || v.length === 0) {
    throw new StetError("usage", `missing required option --${name}`);
  }
  return v;
}

export function optionalFlag(
  flags: Record<string, string | true>,
  name: string,
): string | undefined {
  const v = flags[name];
  return typeof v === "string" ? v : undefined;
}
