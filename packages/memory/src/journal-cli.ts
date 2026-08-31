/**
 * `moe-memory journal <subcommand>` — the journal half from the terminal.
 *
 * private-journal-mcp had no CLI beyond `--journal-path`: its single bin was the
 * MCP server and nothing else. These subcommands are new surface, and they exist
 * because the journal is no longer self-indexing through sidecars — if the index
 * can be rebuilt, something has to be able to rebuild it.
 */

import { initDatabase } from "./db.js";
import { importLegacyJournalSidecars } from "./journal/legacy-sidecars.js";
import type { JournalScopeFilter } from "./journal/search.js";
import { JournalSearchService } from "./journal/search.js";
import { JournalStore } from "./journal/store.js";
import { resolveProjectJournalPath, resolveUserJournalPath } from "./paths.js";

const HELP = `
Usage: moe-memory journal <command> [options]

COMMANDS:
  index                Re-scan both journal directories and update the index
  search <query>       Semantic search over journal entries
  recent               List the most recent entries
  paths                Print the resolved project and user journal directories
  import-legacy        Reconcile private-journal-mcp's .embedding sidecars
                       (--remove deletes them once the entry is indexed)

OPTIONS:
  --journal-path DIR   Override the project journal directory
  --scope SCOPE        project | user | both (default: both)
  --limit N            Max results (default: 10)
  --help, -h           Show this help

The user-global journal lives under the Moe Memory data directory alongside the
conversation index; the project journal is <project>/.moe-journal. Set
MOE_MEMORY_JOURNAL_PATH to point both at one directory.
`;

function readFlag(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx === -1) return undefined;
  return args[idx + 1];
}

function readScope(args: string[]): JournalScopeFilter {
  const raw = readFlag(args, "--scope");
  if (raw === "project" || raw === "user" || raw === "both") return raw;
  return "both";
}

function readLimit(args: string[], fallback: number): number {
  const raw = readFlag(args, "--limit");
  if (raw === undefined) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : fallback;
}

export async function runJournal(args: string[]): Promise<number> {
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    console.log(HELP);
    return 0;
  }

  const command = args[0];
  const rest = args.slice(1);
  const journalPath = readFlag(rest, "--journal-path");
  const store = new JournalStore({ projectPath: journalPath });

  if (command === "paths") {
    console.log(`project: ${journalPath ?? resolveProjectJournalPath()}`);
    console.log(`user:    ${resolveUserJournalPath()}`);
    for (const root of store.roots()) {
      console.log(`root:    ${root.path} (${root.scope})`);
    }
    return 0;
  }

  const db = initDatabase();
  try {
    if (command === "index") {
      const result = await store.indexJournal(db);
      console.log(
        `✅ Journal index updated: ${result.indexed} indexed, ${result.pruned} pruned, ${result.failed} failed, ${result.total} entries on disk`,
      );
      return result.failed > 0 ? 1 : 0;
    }

    if (command === "import-legacy") {
      const result = await importLegacyJournalSidecars(db, store, {
        remove: rest.includes("--remove"),
      });
      console.log(`Legacy .embedding sidecars found:  ${result.found}`);
      console.log(`  with an entry now in the index:  ${result.indexed}`);
      console.log(`  removed:                         ${result.removed}`);
      if (result.orphaned.length > 0) {
        console.log(`  orphaned (no .md beside them):   ${result.orphaned.length}`);
        for (const orphan of result.orphaned) console.log(`    ${orphan}`);
      }
      if (!rest.includes("--remove") && result.indexed > 0) {
        console.log("\nRe-run with --remove to delete the sidecars that are now indexed.");
      }
      return 0;
    }

    const search = new JournalSearchService(
      db,
      store.roots().map((root) => root.path),
    );

    if (command === "search") {
      const query = rest
        .filter((arg) => !arg.startsWith("--"))
        .join(" ")
        .trim();
      if (!query) {
        console.error("Usage: moe-memory journal search <query>");
        return 1;
      }
      const results = await search.search(query, {
        limit: readLimit(rest, 10),
        scope: readScope(rest),
      });
      if (results.length === 0) {
        console.log("No relevant entries found.");
        return 0;
      }
      for (const [i, result] of results.entries()) {
        console.log(
          `${i + 1}. [${result.score.toFixed(3)}] ${new Date(
            result.entry.timestamp,
          ).toISOString()} (${result.entry.scope})`,
        );
        console.log(`   Sections: ${result.entry.sections.join(", ")}`);
        console.log(`   ${result.entry.path}`);
        console.log(`   ${result.excerpt}\n`);
      }
      return 0;
    }

    if (command === "recent") {
      const results = search.listRecent({
        limit: readLimit(rest, 10),
        scope: readScope(rest),
      });
      if (results.length === 0) {
        console.log("No entries found.");
        return 0;
      }
      for (const [i, result] of results.entries()) {
        console.log(
          `${i + 1}. ${new Date(result.entry.timestamp).toISOString()} (${result.entry.scope})`,
        );
        console.log(`   ${result.entry.path}`);
        console.log(`   ${result.excerpt}\n`);
      }
      return 0;
    }

    console.error(`Unknown journal command: ${command}`);
    console.error("Try: moe-memory journal --help");
    return 1;
  } finally {
    db.close();
  }
}
