#!/usr/bin/env node
// @generated — do not edit; see scripts/build-runtime.mjs
import { createRequire as __createRequire } from 'module';
const require = __createRequire(import.meta.url);
import {
  resolveInstalledPackageRoot
} from "./chunks/chunk-RO2MBIC5.js";
import {
  setDefaultPackageRoot
} from "./chunks/chunk-X4QDSJ7Q.js";
import "./chunks/chunk-YFLZKW2J.js";
import "./chunks/chunk-OYWI4M6D.js";
import "./chunks/chunk-NH4NDHAK.js";
import "./chunks/chunk-XRZM5UX2.js";

// src/cli.ts
setDefaultPackageRoot(resolveInstalledPackageRoot(import.meta.url));
var HELP = `moe-memory - semantic recall over past sessions and journal entries

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
  rollback     Prepare or abort a rollback to a previous version
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
async function dispatch(command, args) {
  switch (command) {
    case "sync": {
      const { runSync } = await import("./chunks/sync-cli-RYHS7KOV.js");
      return runSync(args);
    }
    case "index": {
      const { runIndex } = await import("./chunks/index-cli-UD7JLLQP.js");
      return runIndex(args);
    }
    case "search": {
      const { runSearch } = await import("./chunks/search-cli-6E3U65FN.js");
      return runSearch(args);
    }
    case "show": {
      const { runShow } = await import("./chunks/show-cli-2E7W7RTI.js");
      return runShow(args);
    }
    case "stats": {
      const { runStats } = await import("./chunks/stats-cli-Z5WVOPQM.js");
      return runStats(args);
    }
    case "journal": {
      const { runJournal } = await import("./chunks/journal-cli-HVKPG4AC.js");
      return runJournal(args);
    }
    case "doctor": {
      const { runDoctor } = await import("./chunks/doctor-cli-MMNFWTX4.js");
      return runDoctor(args);
    }
    case "rollback": {
      const { runRollback } = await import("./chunks/rollback-cli-DHNOUMU2.js");
      return runRollback(args);
    }
    case "mcp-server": {
      const { runMemoryMcpServer } = await import("./chunks/mcp-server-BFPW4CCT.js");
      await runMemoryMcpServer(args);
      return 0;
    }
    case "--help":
    case "-h":
    case "help":
    case void 0:
      console.log(HELP);
      return 0;
    case "--version":
    case "-v": {
      const { VERSION } = await import("./chunks/version-K4ISJPNE.js");
      console.log(VERSION);
      return 0;
    }
    default:
      console.error(`Unknown command: ${command}`);
      console.error("Try: moe-memory --help");
      return 1;
  }
}
async function main(argv = process.argv.slice(2)) {
  const [command, ...args] = argv;
  try {
    return await dispatch(command, args);
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}
main().then((code) => {
  if (code !== 0) process.exit(code);
});
export {
  main
};
