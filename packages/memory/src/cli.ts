#!/usr/bin/env node
/**
 * `moe-memory` — the package's single bin, compiled to dist/cli.js.
 *
 * Replaces FIVE upstream entry points:
 *
 *   episodic-memory              -> moe-memory
 *   episodic-memory-index        -> moe-memory index
 *   episodic-memory-search       -> moe-memory search
 *   episodic-memory-mcp-server   -> moe-memory mcp-server
 *   private-journal-mcp          -> moe-memory mcp-server  (one server now)
 *
 * and, with them, an entire layer of shims. episodic-memory shipped four
 * extensionless files that spawned four `.js` dispatchers that spawned the
 * compiled `dist/*-cli.js` scripts — `join(__dirname, '../dist')`, three times,
 * two of them resolving `__dirname` through `realpathSync` and two not, so half
 * of them broke under a symlinked bin. All of that is gone: this file imports
 * the command modules and calls them in-process. There is no `../dist/` prefix
 * left in the package.
 *
 * Subcommands are dispatched through dynamic import so that `moe-memory show`
 * does not load node:sqlite or transformers.js just to render a JSONL file.
 */

import { resolveInstalledPackageRoot } from "./installed-package-root.js";
import { setDefaultPackageRoot } from "./db.js";

setDefaultPackageRoot(resolveInstalledPackageRoot(import.meta.url));

const HELP = `moe-memory - semantic recall over past sessions and journal entries

USAGE:
  moe-memory <command> [options]

COMMANDS:
  sync         Sync conversations from Claude Code and Codex and index them
  index        Index, verify, repair or rebuild the conversation index
  search       Search indexed conversations
  show         Display a conversation in readable format
  stats        Show index statistics for both record types
  journal      Index and search deliberately-written journal entries
  doctor       Diagnose Claude Code or Codex integration issues
  mcp-server   Run the moe-memory MCP server on stdio

Run 'moe-memory <command> --help' for command-specific help.

EXAMPLES:
  # Backfill the conversation index
  moe-memory index --cleanup

  # Search past conversations
  moe-memory search "React Router auth"

  # Search what you wrote down deliberately
  moe-memory journal search "why we dropped the sidecars"

  # Display a conversation
  moe-memory show path/to/conversation.jsonl
`;

async function dispatch(command: string | undefined, args: string[]): Promise<number> {
  switch (command) {
    case "sync": {
      const { runSync } = await import("./sync-cli.js");
      return runSync(args);
    }
    case "index": {
      const { runIndex } = await import("./index-cli.js");
      return runIndex(args);
    }
    case "search": {
      const { runSearch } = await import("./search-cli.js");
      return runSearch(args);
    }
    case "show": {
      const { runShow } = await import("./show-cli.js");
      return runShow(args);
    }
    case "stats": {
      const { runStats } = await import("./stats-cli.js");
      return runStats(args);
    }
    case "journal": {
      const { runJournal } = await import("./journal-cli.js");
      return runJournal(args);
    }
    case "doctor": {
      const { runDoctor } = await import("./doctor-cli.js");
      return runDoctor(args);
    }
    case "mcp-server": {
      const { runMemoryMcpServer } = await import("./mcp-server.js");
      await runMemoryMcpServer(args);
      // The stdio transport owns the process from here.
      return 0;
    }
    case "--help":
    case "-h":
    case "help":
    case undefined:
      console.log(HELP);
      return 0;
    case "--version":
    case "-v": {
      const { VERSION } = await import("./version.js");
      console.log(VERSION);
      return 0;
    }
    default:
      console.error(`Unknown command: ${command}`);
      console.error("Try: moe-memory --help");
      return 1;
  }
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const [command, ...args] = argv;
  try {
    return await dispatch(command, args);
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

main().then((code) => {
  // `mcp-server` keeps the event loop alive through its transport; every other
  // command has finished by the time we get here, so an explicit exit is only
  // needed for a non-zero status.
  if (code !== 0) process.exit(code);
});
