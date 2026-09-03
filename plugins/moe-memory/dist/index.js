// @generated — do not edit; see scripts/build-runtime.mjs
import { createRequire as __createRequire } from 'module';
const require = __createRequire(import.meta.url);
import {
  JOURNAL_SECTION_HEADINGS
} from "./chunks/chunk-22YHH63V.js";
import {
  assessVectorReadiness,
  formatMultiConceptResults,
  formatResults,
  isVectorQueryAuthorized,
  l2DistanceToCosineSimilarity,
  searchConversations,
  searchMultipleConcepts,
  vectorReadinessMessage
} from "./chunks/chunk-HIE7CIAX.js";
import {
  RecoveryCapsuleError,
  collectSnapshotSources,
  createDatabaseSnapshot,
  ensureRecoveryCapsule,
  loadCatalog,
  validateManifest,
  validateSnapshotSources,
  verifyRecoveryCapsule,
  verifySnapshot
} from "./chunks/chunk-DIF2OON7.js";
import {
  resolveInstalledPackageRoot
} from "./chunks/chunk-RO2MBIC5.js";
import "./chunks/chunk-QGTMUDP7.js";
import {
  DatabaseBusyError,
  EMBEDDING_VERSION,
  acquireDatabaseWriter,
  acquireExclusiveMaintenanceLease,
  acquireSharedDatabaseLease,
  assertWritableEpoch,
  assertWritesAllowed,
  inspectLegacyDatabaseUsers,
  readDatabaseEpoch,
  setDefaultPackageRoot,
  withDatabaseWriter,
  withForeignKeysDisabled,
  withTransaction
} from "./chunks/chunk-LUAEQ7DI.js";
import {
  JOURNAL_DIR_NAME,
  findJsonlFiles,
  getArchiveDir,
  getClaudeDir,
  getCodexDir,
  getConversationSourceDirs,
  getDbPath,
  getExcludeConfigPath,
  getExcludedProjects,
  getIndexDir,
  getMemoryDataDir,
  getModelCacheDir,
  journalRoots,
  resolveJournalPath,
  resolveProjectJournalPath,
  resolveUserJournalPath
} from "./chunks/chunk-YFLZKW2J.js";
import {
  EMBEDDING_DIMENSIONS,
  SUMMARIZER_CONTEXT_MARKER
} from "./chunks/chunk-NH4NDHAK.js";
import "./chunks/chunk-YAXDOI5O.js";
import {
  parseConversation,
  parseConversationFile
} from "./chunks/chunk-NSDW7PUB.js";
import "./chunks/chunk-XRZM5UX2.js";

// src/embedding-coordinator.ts
import fs from "node:fs";

// src/enrichment.ts
function pickPendingEnrichment(db, limit = 50) {
  const results = [];
  const exchanges = db.prepare(
    `SELECT id, user_message, assistant_message FROM exchanges
       WHERE embedding_version = 0
       ORDER BY timestamp DESC
       LIMIT ?`
  ).all(limit);
  for (const row of exchanges) {
    results.push({
      family: "exchange",
      id: row.id,
      sourceText: `User: ${row.user_message}

Assistant: ${row.assistant_message}`,
      epoch: 0
    });
  }
  const remaining = limit - results.length;
  if (remaining > 0) {
    const journals = db.prepare(
      `SELECT id, text FROM journal_entries
         WHERE embedding_version = 0
         ORDER BY timestamp DESC
         LIMIT ?`
    ).all(remaining);
    for (const row of journals) {
      results.push({
        family: "journal",
        id: row.id,
        sourceText: row.text,
        epoch: 0
      });
    }
  }
  return results;
}
function commitEnrichment(db, item, vector) {
  assertWritesAllowed();
  withTransaction(db, () => {
    if (item.family === "exchange") {
      db.prepare("DELETE FROM vec_exchanges WHERE id = ?").run(item.id);
      db.prepare("INSERT INTO vec_exchanges (id, embedding) VALUES (?, ?)").run(
        item.id,
        new Uint8Array(vector.buffer, vector.byteOffset, vector.byteLength)
      );
      db.prepare("UPDATE exchanges SET embedding_version = ? WHERE id = ?").run(
        EMBEDDING_VERSION,
        item.id
      );
    } else {
      db.prepare("DELETE FROM vec_journal_entries WHERE id = ?").run(item.id);
      db.prepare("INSERT INTO vec_journal_entries (id, embedding) VALUES (?, ?)").run(
        item.id,
        new Uint8Array(vector.buffer, vector.byteOffset, vector.byteLength)
      );
      db.prepare("UPDATE journal_entries SET embedding_version = ? WHERE id = ?").run(
        EMBEDDING_VERSION,
        item.id
      );
    }
  });
}
function generateExcerptFromText(text, query, maxLength = 200) {
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const idx = lowerText.indexOf(lowerQuery);
  if (idx === -1) {
    return text.length <= maxLength ? text : `${text.slice(0, maxLength)}...`;
  }
  const start = Math.max(0, idx - 40);
  const end = Math.min(text.length, idx + query.length + maxLength - 40);
  let excerpt = text.slice(start, end);
  if (start > 0) excerpt = `...${excerpt}`;
  if (end < text.length) excerpt = `${excerpt}...`;
  return excerpt;
}
function searchJournalText(db, query, options = {}) {
  const limit = options.limit ?? 10;
  const parts = ["j.text LIKE ?"];
  const params = [`%${query}%`];
  if (options.roots && options.roots.length > 0) {
    parts.push(`j.root IN (${options.roots.map(() => "?").join(", ")})`);
    params.push(...options.roots);
  }
  if (options.scope && options.scope !== "both") {
    parts.push("j.scope = ?");
    params.push(options.scope);
  }
  if (options.dateRange?.start) {
    parts.push("j.timestamp >= ?");
    params.push(options.dateRange.start.getTime());
  }
  if (options.dateRange?.end) {
    parts.push("j.timestamp <= ?");
    params.push(options.dateRange.end.getTime());
  }
  const whereClause = parts.join(" AND ");
  const rows = db.prepare(
    `SELECT j.id, j.path, j.root, j.scope, j.timestamp, j.text, j.sections, j.embedding_version
       FROM journal_entries AS j
       WHERE ${whereClause}
       ORDER BY j.timestamp DESC
       LIMIT ?`
  ).all(...params, limit);
  return rows.map((row) => {
    let sections = [];
    try {
      const parsed = JSON.parse(row.sections);
      if (Array.isArray(parsed))
        sections = parsed.filter((s) => typeof s === "string");
    } catch {
    }
    return {
      id: row.id,
      path: row.path,
      root: row.root,
      scope: row.scope,
      timestamp: row.timestamp,
      text: row.text,
      sections,
      embeddingVersion: row.embedding_version,
      excerpt: generateExcerptFromText(row.text, query)
    };
  });
}

// src/embedding-coordinator.ts
function createEmbeddingCoordinator(options) {
  const { db, dbPath, embedFn } = options;
  const snapshotTaken = options.snapshotTaken ?? false;
  const capsuleVerified = options.capsuleVerified ?? false;
  return {
    async ensureReady() {
      const readiness = assessVectorReadiness(db);
      if (!capsuleVerified && readiness.state !== "ready") {
        const capsulePath = `${dbPath}.snapshot-v2.json`;
        if (!fs.existsSync(capsulePath) && !snapshotTaken) {
          return {
            state: "blocked",
            reason: "Recovery capsule not verified \u2014 run snapshot preflight first",
            total: readiness.total,
            remaining: readiness.remaining,
            fromVersion: 2,
            toVersion: 3
          };
        }
      }
      return readiness;
    },
    async runBatch(limit) {
      const readiness = assessVectorReadiness(db);
      if (readiness.state === "blocked") return readiness;
      if (readiness.state === "ready") return readiness;
      const pending = pickPendingEnrichment(db, limit);
      if (pending.length === 0) {
        return assessVectorReadiness(db);
      }
      const computed = [];
      for (const item of pending) {
        const vector = await embedFn(item.sourceText);
        computed.push({ item, vector });
      }
      for (const { item, vector } of computed) {
        commitEnrichment(db, item, vector);
      }
      return assessVectorReadiness(db);
    }
  };
}

// src/index.ts
setDefaultPackageRoot(resolveInstalledPackageRoot(import.meta.url));
export {
  DatabaseBusyError,
  EMBEDDING_DIMENSIONS,
  JOURNAL_DIR_NAME,
  JOURNAL_SECTION_HEADINGS,
  RecoveryCapsuleError,
  SUMMARIZER_CONTEXT_MARKER,
  acquireDatabaseWriter,
  acquireExclusiveMaintenanceLease,
  acquireSharedDatabaseLease,
  assertWritableEpoch,
  assessVectorReadiness,
  collectSnapshotSources,
  commitEnrichment,
  createDatabaseSnapshot,
  createEmbeddingCoordinator,
  ensureRecoveryCapsule,
  findJsonlFiles,
  formatMultiConceptResults,
  formatResults,
  getArchiveDir,
  getClaudeDir,
  getCodexDir,
  getConversationSourceDirs,
  getDbPath,
  getExcludeConfigPath,
  getExcludedProjects,
  getIndexDir,
  getMemoryDataDir,
  getModelCacheDir,
  inspectLegacyDatabaseUsers,
  isVectorQueryAuthorized,
  journalRoots,
  l2DistanceToCosineSimilarity,
  loadCatalog as loadRecoveryCatalog,
  parseConversation,
  parseConversationFile,
  pickPendingEnrichment,
  readDatabaseEpoch,
  resolveJournalPath,
  resolveProjectJournalPath,
  resolveUserJournalPath,
  searchConversations,
  searchJournalText as searchJournalTextDb,
  searchMultipleConcepts,
  validateManifest as validateCapsuleManifest,
  validateSnapshotSources,
  vectorReadinessMessage,
  verifyRecoveryCapsule,
  verifySnapshot,
  withDatabaseWriter,
  withForeignKeysDisabled,
  withTransaction
};
