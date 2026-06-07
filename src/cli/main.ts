#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  appendReply,
  createCommentBySelector,
  loadReviewDocument,
  resolveThread,
  reopenThread,
  type ReviewThread,
} from "../core/index.js";
import { createReviewServer } from "../server/index.js";
import { agentProtocol } from "./protocol.js";

function packageVersion(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const packageJson = JSON.parse(readFileSync(resolve(here, "../../package.json"), "utf8"));
  return packageJson.version;
}

function help(): string {
  return `Stet — local Markdown review comments

Usage:
  stet FILE.md [--author NAME] [--app APP] [--port PORT] [--no-open]
  stet list --json FILE.md
  stet reply FILE.md --thread THREAD_ID --author NAME --message MESSAGE
  stet resolve FILE.md --thread THREAD_ID --author NAME [--message MESSAGE]
  stet reopen FILE.md --thread THREAD_ID --author NAME [--message MESSAGE]
  stet comment FILE.md --target paragraph:0 --author NAME --message MESSAGE
  stet --print-agent-protocol
  stet --version
  stet --help

Storage:
  Threads are stored inside the Markdown file as stet:thread blocks.
`;
}

type ParsedArgs = {
  _: string[];
  flags: Map<string, string | true>;
};

function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags = new Map<string, string | true>();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg.startsWith("--")) {
      const eq = arg.indexOf("=");
      if (eq > -1) {
        flags.set(arg.slice(2, eq), arg.slice(eq + 1));
        continue;
      }
      const name = arg.slice(2);
      const next = argv[index + 1];
      if (next && !next.startsWith("--") && !["help", "version", "json", "no-open", "print-agent-protocol"].includes(name)) {
        flags.set(name, next);
        index += 1;
      } else {
        flags.set(name, true);
      }
    } else {
      positional.push(arg);
    }
  }
  return { _: positional, flags };
}

function flagString(args: ParsedArgs, name: string, fallback = ""): string {
  const value = args.flags.get(name);
  if (value === undefined || value === true) return fallback;
  return value;
}

function requireFlag(args: ParsedArgs, name: string): string {
  const value = flagString(args, name);
  if (!value) throw new Error(`Missing required --${name}`);
  return value;
}

function toAgentJson(filePath: string, threads: ReviewThread[]) {
  return {
    file: resolve(filePath),
    threads: threads.map((thread) => ({
      id: thread.id,
      status: thread.status,
      target: {
        kind: thread.target.kind,
        headingPath: thread.target.headingPath,
        quote: thread.target.quote,
        anchor: thread.anchor,
      },
      messages: thread.messages.map((message) => ({
        author: message.author,
        createdAt: message.createdAt,
        bodyMarkdown: message.bodyMarkdown,
        editedAt: message.editedAt,
      })),
    })),
  };
}

async function launch(filePath: string, args: ParsedArgs): Promise<void> {
  const portFlag = flagString(args, "port");
  const server = await createReviewServer({
    filePath,
    author: flagString(args, "author", process.env.USER || "Amit"),
    app: flagString(args, "app") || undefined,
    port: portFlag ? Number.parseInt(portFlag, 10) : undefined,
    openBrowser: !args.flags.has("no-open"),
  });
  console.log(`Stet server: ${server.url}`);
  if (server.lockStatus.message) console.warn(server.lockStatus.message);
  await new Promise<void>((resolveStop) => {
    const stop = async () => {
      await server.close();
      resolveStop();
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
}

async function main(argv = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  if (args.flags.has("help") || argv.length === 0) {
    console.log(help());
    return;
  }
  if (args.flags.has("version")) {
    console.log(packageVersion());
    return;
  }
  if (args.flags.has("print-agent-protocol")) {
    console.log(agentProtocol);
    return;
  }

  const command = args._[0];
  if (command === "list") {
    const file = args._.at(-1);
    if (!file) throw new Error("Missing FILE.md");
    const doc = loadReviewDocument(resolve(file), { allowMalformed: true });
    if (doc.errors.length > 0) throw new Error(doc.errors.map((error) => error.message).join("\n"));
    if (args.flags.has("json")) console.log(JSON.stringify(toAgentJson(file, doc.threads), null, 2));
    else for (const thread of doc.threads) console.log(`${thread.id}\t${thread.status}\t${thread.target.quote}`);
    return;
  }

  if (command === "reply") {
    const file = args._[1];
    if (!file) throw new Error("Missing FILE.md");
    const result = appendReply(resolve(file), requireFlag(args, "thread"), { author: requireFlag(args, "author"), bodyMarkdown: requireFlag(args, "message") });
    const thread = result.threads.find((candidate) => candidate.id === requireFlag(args, "thread"));
    console.log(`${thread?.id}\t${thread?.status}`);
    return;
  }

  if (command === "resolve" || command === "reopen") {
    const file = args._[1];
    if (!file) throw new Error("Missing FILE.md");
    const payload = flagString(args, "message") ? { author: requireFlag(args, "author"), bodyMarkdown: flagString(args, "message") } : undefined;
    const result = command === "resolve" ? resolveThread(resolve(file), requireFlag(args, "thread"), payload) : reopenThread(resolve(file), requireFlag(args, "thread"), payload);
    const thread = result.threads.find((candidate) => candidate.id === requireFlag(args, "thread"));
    console.log(`${thread?.id}\t${thread?.status}`);
    return;
  }

  if (command === "comment") {
    const file = args._[1];
    if (!file) throw new Error("Missing FILE.md");
    const result = createCommentBySelector(resolve(file), requireFlag(args, "target"), requireFlag(args, "author"), requireFlag(args, "message"));
    const thread = result.threads.at(-1);
    console.log(`${thread?.id}\t${thread?.status}`);
    return;
  }

  const maybeFile = args._[0];
  if (!maybeFile) throw new Error("Missing FILE.md");
  await launch(resolve(maybeFile), args);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
