import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { readFileSync } from "node:fs";

const PACKAGE_ROOT = join(import.meta.dirname, "..");

const snapshot = JSON.parse(
  readFileSync(join(PACKAGE_ROOT, "test/fixtures/public-api-0.1.5.json"), "utf-8"),
) as { version: string; exports: string[] };

const RETAINED = new Set([
  // constants.ts
  "SUMMARIZER_CONTEXT_MARKER",
  "EMBEDDING_DIMENSIONS",
  // parser.ts
  "parseConversation",
  "parseConversationFile",
  // paths.ts
  "JOURNAL_DIR_NAME",
  "getClaudeDir",
  "getCodexDir",
  "getConversationSourceDirs",
  "findJsonlFiles",
  "getMemoryDataDir",
  "getArchiveDir",
  "getIndexDir",
  "getModelCacheDir",
  "getDbPath",
  "getExcludeConfigPath",
  "getExcludedProjects",
  "resolveJournalPath",
  "resolveProjectJournalPath",
  "resolveUserJournalPath",
  "journalRoots",
  // database-lease.ts
  "DatabaseBusyError",
  "acquireSharedDatabaseLease",
  "acquireDatabaseWriter",
  "acquireExclusiveMaintenanceLease",
  "assertWritableEpoch",
  "inspectLegacyDatabaseUsers",
  "readDatabaseEpoch",
  "withDatabaseWriter",
  // database-transaction.ts
  "withTransaction",
  "withForeignKeysDisabled",
  // search.ts
  "l2DistanceToCosineSimilarity",
  "searchConversations",
  "formatResults",
  "searchMultipleConcepts",
  "formatMultiConceptResults",
  // types.ts (only runtime values, not type-only exports)
  "JOURNAL_SECTION_HEADINGS",
]);

const REMOVED = new Set(snapshot.exports.filter((s) => !RETAINED.has(s)));

function comparePublicApi(
  snapshotExports: string[],
  currentExports: string[],
): { retained: string[]; removed: string[]; unclassified: string[] } {
  const current = new Set(currentExports);
  const retained: string[] = [];
  const removed: string[] = [];
  const unclassified: string[] = [];

  for (const sym of snapshotExports) {
    if (RETAINED.has(sym)) {
      if (current.has(sym)) retained.push(sym);
      else unclassified.push(sym);
    } else if (REMOVED.has(sym)) {
      if (!current.has(sym)) removed.push(sym);
      else unclassified.push(sym);
    } else {
      unclassified.push(sym);
    }
  }

  for (const sym of currentExports) {
    if (!snapshotExports.includes(sym) && !RETAINED.has(sym)) {
      unclassified.push(sym);
    }
  }

  return { retained, removed, unclassified };
}

describe("public API contract", () => {
  it("does not export raw sqlite handles", async () => {
    const api = await import("../src/index.js");
    const keys = Object.keys(api);
    expect(keys).not.toContain("initDatabase");
    expect(keys).not.toContain("migrateSchema");
    expect(keys).not.toContain("migrateToolCallsCascade");
    expect(keys).not.toContain("migrateJournalRoot");
    expect(keys).not.toContain("insertExchange");
    expect(keys).not.toContain("deleteExchange");
    expect(keys).not.toContain("getAllExchanges");
  });

  it("does not export embedding internals", async () => {
    const api = await import("../src/index.js");
    const keys = Object.keys(api);
    expect(keys).not.toContain("initEmbeddings");
    expect(keys).not.toContain("resetEmbeddings");
    expect(keys).not.toContain("generateEmbedding");
  });

  it("does not export indexer internals", async () => {
    const api = await import("../src/index.js");
    const keys = Object.keys(api);
    expect(keys).not.toContain("indexConversations");
    expect(keys).not.toContain("indexSession");
    expect(keys).not.toContain("indexUnprocessed");
  });

  it("accounts for every 0.1.5 export", async () => {
    const api = await import("../src/index.js");
    const currentExports = Object.keys(api);
    const result = comparePublicApi(snapshot.exports, currentExports);
    expect(result.unclassified).toEqual([]);
    expect(result.retained.length).toBeGreaterThan(0);
    expect(result.removed.length).toBeGreaterThan(0);
  });

  it("typechecks the retained package-owned API", () => {
    const consumerDir = join(PACKAGE_ROOT, "test/fixtures/public-consumer");
    const result = execFileSync("npx", ["tsc", "-p", join(consumerDir, "tsconfig.json"), "--noEmit"], {
      cwd: PACKAGE_ROOT,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    expect(result).toBe("");
  });
});
