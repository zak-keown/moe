import crypto from "node:crypto";
import fs from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import type { SnapshotSidecar, SnapshotSourceRecord } from "../database-snapshot.js";
import { withTransaction } from "../database-transaction.js";

export interface SourceChange {
  family: "transcript" | "journal";
  identity: string;
  canonicalPath: string;
}

export interface ReconciliationPlan {
  created: readonly SourceChange[];
  modified: readonly SourceChange[];
  deleted: readonly SourceChange[];
  unchanged: readonly SourceChange[];
}

function hashFileContent(filePath: string): string | null {
  try {
    const data = fs.readFileSync(filePath);
    return crypto.createHash("sha256").update(data).digest("hex");
  } catch {
    return null;
  }
}

export function planSourceReconciliation(
  sidecar: SnapshotSidecar,
  currentSourcePaths: Map<string, { family: "transcript" | "journal"; canonicalPath: string }>,
): ReconciliationPlan {
  const created: SourceChange[] = [];
  const modified: SourceChange[] = [];
  const deleted: SourceChange[] = [];
  const unchanged: SourceChange[] = [];

  const snapshotSources = new Map<string, SnapshotSourceRecord>();
  for (const src of sidecar.sources) {
    snapshotSources.set(src.identity, src);
  }

  // Check each current source against the snapshot
  for (const [identity, current] of currentSourcePaths) {
    const snapshot = snapshotSources.get(identity);
    if (!snapshot) {
      created.push({
        family: current.family,
        identity,
        canonicalPath: current.canonicalPath,
      });
      continue;
    }

    const currentHash = hashFileContent(current.canonicalPath);
    if (currentHash === null) {
      continue;
    }

    if (currentHash !== snapshot.sha256) {
      modified.push({
        family: current.family,
        identity,
        canonicalPath: current.canonicalPath,
      });
    } else {
      unchanged.push({
        family: current.family,
        identity,
        canonicalPath: current.canonicalPath,
      });
    }
  }

  // Check for deleted sources (in snapshot but not in current)
  for (const [identity, snapshot] of snapshotSources) {
    if (!currentSourcePaths.has(identity)) {
      deleted.push({
        family: snapshot.family,
        identity,
        canonicalPath: snapshot.canonicalPath,
      });
    }
  }

  return { created, modified, deleted, unchanged };
}

export function applySourceReconciliation(stagedDb: DatabaseSync, plan: ReconciliationPlan): void {
  withTransaction(stagedDb, () => {
    // Delete removed sources
    for (const change of plan.deleted) {
      if (change.family === "transcript") {
        stagedDb.prepare("DELETE FROM vec_exchanges WHERE id = ?").run(change.identity);
        stagedDb.prepare("DELETE FROM tool_calls WHERE exchange_id = ?").run(change.identity);
        stagedDb.prepare("DELETE FROM exchanges WHERE id = ?").run(change.identity);
      } else {
        stagedDb.prepare("DELETE FROM vec_journal_entries WHERE id = ?").run(change.identity);
        stagedDb.prepare("DELETE FROM journal_entries WHERE id = ?").run(change.identity);
      }
    }

    // Reset modified sources to version 0 (text only, no vector)
    for (const change of plan.modified) {
      if (change.family === "transcript") {
        stagedDb.prepare("DELETE FROM vec_exchanges WHERE id = ?").run(change.identity);
        stagedDb
          .prepare("UPDATE exchanges SET embedding_version = 0 WHERE id = ?")
          .run(change.identity);
      } else {
        stagedDb.prepare("DELETE FROM vec_journal_entries WHERE id = ?").run(change.identity);
        stagedDb
          .prepare("UPDATE journal_entries SET embedding_version = 0 WHERE id = ?")
          .run(change.identity);
      }
    }

    // Mark created sources as version 0 too (they may have been inserted into
    // the staged DB after the snapshot; if not, they won't exist and the updates
    // are harmless)
    for (const change of plan.created) {
      if (change.family === "transcript") {
        stagedDb.prepare("DELETE FROM vec_exchanges WHERE id = ?").run(change.identity);
        stagedDb
          .prepare("UPDATE exchanges SET embedding_version = 0 WHERE id = ?")
          .run(change.identity);
      } else {
        stagedDb.prepare("DELETE FROM vec_journal_entries WHERE id = ?").run(change.identity);
        stagedDb
          .prepare("UPDATE journal_entries SET embedding_version = 0 WHERE id = ?")
          .run(change.identity);
      }
    }
  });
}
