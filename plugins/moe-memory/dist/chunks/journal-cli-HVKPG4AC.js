// @generated — do not edit; see scripts/build-runtime.mjs
import { createRequire as __createRequire } from 'module';
const require = __createRequire(import.meta.url);
import {
  JournalSearchService
} from "./chunk-TPANDLU7.js";
import {
  JournalStore
} from "./chunk-XQQVRDY6.js";
import "./chunk-22YHH63V.js";
import "./chunk-ESBWE2AP.js";
import "./chunk-TD4KRVGL.js";
import {
  initDatabase
} from "./chunk-X4QDSJ7Q.js";
import {
  resolveProjectJournalPath,
  resolveUserJournalPath
} from "./chunk-YFLZKW2J.js";
import "./chunk-OYWI4M6D.js";
import "./chunk-NH4NDHAK.js";
import "./chunk-YAXDOI5O.js";
import "./chunk-XRZM5UX2.js";

// src/journal-cli.ts
var HELP = `
Usage: moe-memory journal <command> [options]

COMMANDS:
  index                Re-scan both journal directories and update the index
  search <query>       Semantic search over journal entries
  recent               List the most recent entries
  paths                Print the resolved project and user journal directories

OPTIONS:
  --journal-path DIR   Override the project journal directory
  --scope SCOPE        project | user | both (default: both)
  --limit N            Max results (default: 10)
  --help, -h           Show this help

The user-global journal lives under the Moe Memory data directory alongside the
conversation index; the project journal is <project>/.moe-journal. Set
MOE_MEMORY_JOURNAL_PATH to point both at one directory.
`;
var VALUE_FLAGS = /* @__PURE__ */ new Set(["--journal-path", "--scope", "--limit"]);
var DEFAULT_LIMIT = 10;
function parseJournalArgs(args) {
  const positionals = [];
  const values = /* @__PURE__ */ new Map();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }
    if (!VALUE_FLAGS.has(arg)) continue;
    const value = args[i + 1];
    if (value === void 0 || value.startsWith("--")) continue;
    values.set(arg, value);
    i++;
  }
  const rawScope = values.get("--scope");
  const scope = rawScope === "project" || rawScope === "user" || rawScope === "both" ? rawScope : "both";
  const rawLimit = values.get("--limit");
  const parsedLimit = rawLimit === void 0 ? Number.NaN : Number.parseInt(rawLimit, 10);
  const limit = Number.isFinite(parsedLimit) && parsedLimit >= 1 ? parsedLimit : DEFAULT_LIMIT;
  return {
    query: positionals.join(" ").trim(),
    limit,
    scope,
    journalPath: values.get("--journal-path")
  };
}
async function runJournal(args) {
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
        `\u2705 Journal index updated: ${result.indexed} indexed, ${result.pruned} pruned, ${result.failed} failed, ${result.total} entries on disk`
      );
      return result.failed > 0 ? 1 : 0;
    }
    const search = new JournalSearchService(
      db,
      store.roots().map((root) => root.path)
    );
    if (command === "search") {
      const query = parsed.query;
      if (!query) {
        console.error("Usage: moe-memory journal search <query>");
        return 1;
      }
      const results = await search.search(query, {
        limit: parsed.limit,
        scope: parsed.scope
      });
      if (results.length === 0) {
        console.log("No relevant entries found.");
        return 0;
      }
      for (const [i, result] of results.entries()) {
        console.log(
          `${i + 1}. [${result.score.toFixed(3)}] ${new Date(
            result.entry.timestamp
          ).toISOString()} (${result.entry.scope})`
        );
        console.log(`   Sections: ${result.entry.sections.join(", ")}`);
        console.log(`   ${result.entry.path}`);
        console.log(`   ${result.excerpt}
`);
      }
      return 0;
    }
    if (command === "recent") {
      const results = search.listRecent({
        limit: parsed.limit,
        scope: parsed.scope
      });
      if (results.length === 0) {
        console.log("No entries found.");
        return 0;
      }
      for (const [i, result] of results.entries()) {
        console.log(
          `${i + 1}. ${new Date(result.entry.timestamp).toISOString()} (${result.entry.scope})`
        );
        console.log(`   ${result.entry.path}`);
        console.log(`   ${result.excerpt}
`);
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
export {
  parseJournalArgs,
  runJournal
};
