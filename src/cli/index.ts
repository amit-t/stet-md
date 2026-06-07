import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs, type ParsedArgs } from "./args.js";
import {
  cmdList,
  cmdReply,
  cmdResolve,
  cmdComment,
  type CliContext,
} from "./commands.js";
import { AGENT_PROTOCOL } from "./protocol.js";
import { isRedlineError, RedlineError } from "../core/errors.js";

/**
 * CLI entry. `runCli` returns an exit code instead of calling process.exit so
 * it is testable in-process; the bin shim maps the code onto the process.
 */

export interface RunOptions {
  stdout?: (line: string) => void;
  stderr?: (line: string) => void;
  now?: () => Date;
  env?: NodeJS.ProcessEnv;
}

function packageVersion(): string {
  try {
    const url = new URL("../../package.json", import.meta.url);
    const pkg = JSON.parse(readFileSync(fileURLToPath(url), "utf8")) as {
      version?: string;
    };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

const HELP = `redline — Markdown review comments that live inside the file

Usage:
  redline list --json FILE.md                 List threads as deterministic JSON
  redline reply FILE.md --thread ID --author NAME --message "..."
                                              Append a reply to a thread
  redline resolve FILE.md --thread ID [--author NAME] [--message "..."]
                                              Mark a thread resolved
  redline comment FILE.md --target KIND:VALUE --author NAME --message "..."
                                              Create a new thread (KIND = heading|paragraph|document)
  redline --print-agent-protocol              Print the agent collaboration protocol
  redline --version                           Print version
  redline --help                              Print this help

Browser review UI:
  redline FILE.md [--author NAME] [--app APP] [--port N] [--no-open]
                                              Opens the local review server (provided by the
                                              server subsystem; not bundled in this core build).

Exit codes: 0 ok · 1 runtime error (missing file, malformed marker, unknown
thread, changed file) · 2 usage error.
`;

function exitCodeFor(err: RedlineError): number {
  switch (err.code) {
    case "usage":
    case "invalid_target":
      return 2;
    default:
      return 1;
  }
}

function bareFileNotice(file: string, ctx: CliContext): number {
  ctx.err(
    `redline: the browser review server is provided by the server subsystem ` +
      `and is not bundled in this core build.`,
  );
  ctx.err(
    `Use the agent CLI instead, e.g.:  redline list --json ${file}`,
  );
  ctx.err(`See 'redline --print-agent-protocol' for the agent workflow.`);
  return 0;
}

export async function runCli(
  argv: string[],
  options: RunOptions = {},
): Promise<number> {
  const env = options.env ?? process.env;
  const out = options.stdout ?? ((l: string) => process.stdout.write(l + "\n"));
  const err = options.stderr ?? ((l: string) => process.stderr.write(l + "\n"));
  const ctx: CliContext = {
    out,
    err,
    now: options.now ?? (() => new Date()),
    defaultAuthor: () => env.REDLINE_AUTHOR || env.USER || env.USERNAME || "Agent",
  };

  let parsed: ParsedArgs;
  try {
    parsed = parseArgs(argv);
  } catch (e) {
    return handleError(e, err);
  }

  // Top-level informational flags take precedence.
  if (parsed.flags["help"]) {
    out(HELP.trimEnd());
    return 0;
  }
  if (parsed.flags["version"]) {
    out(packageVersion());
    return 0;
  }
  if (parsed.flags["print-agent-protocol"]) {
    out(AGENT_PROTOCOL.trimEnd());
    return 0;
  }

  const command = parsed.positionals[0];
  if (command === undefined) {
    out(HELP.trimEnd());
    return 0;
  }

  // Subcommand dispatch. The first positional is the command; the rest (file +
  // args) are handled by each command via the original parsed flags.
  const rest: ParsedArgs = {
    positionals: parsed.positionals.slice(1),
    flags: parsed.flags,
  };

  try {
    switch (command) {
      case "list":
        return cmdList(rest, ctx);
      case "reply":
        return cmdReply(rest, ctx);
      case "resolve":
        return cmdResolve(rest, ctx);
      case "comment":
        return cmdComment(rest, ctx);
      default: {
        // Not a known subcommand: treat the first positional as a file to open
        // in the browser review UI (server subsystem).
        if (/\.(md|markdown|mdx)$/i.test(command) || parsed.positionals.length >= 1) {
          return bareFileNotice(command, ctx);
        }
        err(`redline: unknown command "${command}"`);
        err(`Run 'redline --help' for usage.`);
        return 2;
      }
    }
  } catch (e) {
    return handleError(e, err);
  }
}

function handleError(e: unknown, err: (l: string) => void): number {
  if (isRedlineError(e)) {
    const where = e.line ? ` (line ${e.line})` : "";
    err(`redline: ${e.message}${where}`);
    return exitCodeFor(e);
  }
  err(`redline: ${(e as Error)?.message ?? String(e)}`);
  return 1;
}
