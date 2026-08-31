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

/**
 * Flags that consume the NEXT argument as their value.
 *
 * This set is the whole fix for a real defect. The query used to be built as
 * `rest.filter((arg) => !arg.startsWith("--")).join(" ")`, which drops flag
 * names but keeps their values — so every value-taking flag leaked into the
 * search string:
 *
 *   journal search --limit 5 foo          searched for "5 foo"
 *   journal search --scope user foo       searched for "user foo"
 *   journal search --journal-path /x foo  searched for "/x foo"
 *
 * A semantic search does not fail on a polluted query, it silently returns
 * worse results, which is why nothing caught it. Parsing positionals and flags
 * in one pass is the only way the two cannot disagree.
 */
const VALUE_FLAGS = new Set(["--journal-path", "--scope", "--limit"]);

const DEFAULT_LIMIT = 10;

export interface JournalArgs {
  /** Positional arguments joined — the search query. */
  query: string;
  limit: number;
  scope: JournalScopeFilter;
  journalPath: string | undefined;
  remove: boolean;
}

export function parseJournalArgs(args: string[]): JournalArgs {
  const positionals: string[] = [];
  const values = new Map<string, string>();
  const booleans = new Set<string>();

  for (let i = 0; i < args.length; i++) {
    const arg = args[i] as string;
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }
    if (!VALUE_FLAGS.has(arg)) {
      booleans.add(arg);
      continue;
    }
    const value = args[i + 1];
    // A value flag at the end of the line, or one followed by another flag,
    // consumes nothing — so a missing value can never eat the query.
    if (value === undefined || value.startsWith("--")) continue;
    values.set(arg, value);
    i++;
  }

  const rawScope = values.get("--scope");
  const scope: JournalScopeFilter =
    rawScope === "project" || rawScope === "user" || rawScope === "both" ? rawScope : "both";

  const rawLimit = values.get("--limit");
  const parsedLimit = rawLimit === undefined ? Number.NaN : Number.parseInt(rawLimit, 10);
  const limit = Number.isFinite(parsedLimit) && parsedLimit >= 1 ? parsedLimit : DEFAULT_LIMIT;

  return {
    query: positionals.join(" ").trim(),
    limit,
    scope,
    journalPath: values.get("--journal-path"),
    remove: booleans.has("--remove"),
  };
}

export async function runJournal(args: string[]): Promise<number> {
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    console.log(HELP);
    return 0;
  }

  const command = args[0];
  const rest = args.slice(1);
  const parsed = parseJournalArgs(rest);
  const journalPath = parsed.journalPath;
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
        remove: parsed.remove,
      });
      console.log(`Legacy .embedding sidecars found:  ${result.found}`);
      console.log(`  with an entry now in the index:  ${result.indexed}`);
      console.log(`  removed:                         ${result.removed}`);
      if (result.orphaned.length > 0) {
        console.log(`  orphaned (no .md beside them):   ${result.orphaned.length}`);
        for (const orphan of result.orphaned) console.log(`    ${orphan}`);
      }
      if (!parsed.remove && result.indexed > 0) {
        console.log("\nRe-run with --remove to delete the sidecars that are now indexed.");
      }
      // An upstream journal that is still at its old path is the reason this
      // command would otherwise report 0 and look finished. Say so, and say
      // what to do about it.
      if (result.legacy.length > 0) {
        console.log("\n⚠️  Found an upstream journal that is NOT indexed:");
        for (const legacy of result.legacy) {
          console.log(
            `    ${legacy.root}  (${legacy.entries} entries, ${legacy.sidecars} sidecars)`,
          );
        }
        console.log(
          "\n    The journal directories moved on import, and nothing is copied for you:\n" +
            "      project  <project>/.private-journal  →  <project>/.moe-journal\n" +
            "      user     ~/.private-journal          →  the Moe Memory data directory\n" +
            "\n    Copy the entries across, then re-run this command:\n",
        );
        for (const legacy of result.legacy) {
          console.log(`      cp -a ${legacy.root}/. <destination>/`);
        }
        console.log("\n    `moe-memory journal paths` prints the destinations.");
      }
      return 0;
    }

    const search = new JournalSearchService(
      db,
      store.roots().map((root) => root.path),
    );

    if (command === "search") {
      const query = parsed.query;
      if (!query) {
        console.error("Usage: moe-memory journal search <query>");
        return 1;
      }
      const results = await search.search(query, {
        limit: parsed.limit,
        scope: parsed.scope,
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
        limit: parsed.limit,
        scope: parsed.scope,
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
