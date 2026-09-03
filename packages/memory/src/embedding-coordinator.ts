import fs from "node:fs";
import type { MemoryDatabase } from "./db.js";
import { EMBEDDING_VERSION } from "./embedding-migration.js";
import { pickPendingEnrichment, commitEnrichment } from "./enrichment.js";
import {
  type VectorReadiness,
  assessVectorReadiness,
} from "./vector-readiness.js";

export interface EmbeddingCoordinator {
  ensureReady(): Promise<VectorReadiness>;
  runBatch(limit: number): Promise<VectorReadiness>;
}

export interface EmbeddingCoordinatorOptions {
  db: MemoryDatabase;
  dbPath: string;
  embedFn: (text: string) => Promise<Float32Array>;
  snapshotTaken?: boolean;
  capsuleVerified?: boolean;
}

export function createEmbeddingCoordinator(
  options: EmbeddingCoordinatorOptions,
): EmbeddingCoordinator {
  const { db, dbPath, embedFn } = options;
  let snapshotTaken = options.snapshotTaken ?? false;
  let capsuleVerified = options.capsuleVerified ?? false;

  return {
    async ensureReady(): Promise<VectorReadiness> {
      const readiness = assessVectorReadiness(db);

      if (!capsuleVerified && readiness.state !== "ready") {
        const capsulePath = `${dbPath}.snapshot-v2.json`;
        if (!fs.existsSync(capsulePath) && !snapshotTaken) {
          return {
            state: "blocked",
            reason: "Recovery capsule not verified — run snapshot preflight first",
            total: readiness.total,
            remaining: readiness.remaining,
            fromVersion: 2,
            toVersion: 3,
          };
        }
      }

      return readiness;
    },

    async runBatch(limit: number): Promise<VectorReadiness> {
      const readiness = assessVectorReadiness(db);
      if (readiness.state === "blocked") return readiness;
      if (readiness.state === "ready") return readiness;

      const pending = pickPendingEnrichment(db, limit);
      if (pending.length === 0) {
        return assessVectorReadiness(db);
      }

      const computed: Array<{
        item: (typeof pending)[0];
        vector: Float32Array;
      }> = [];

      for (const item of pending) {
        const vector = await embedFn(item.sourceText);
        computed.push({ item, vector });
      }

      for (const { item, vector } of computed) {
        commitEnrichment(db, item, vector);
      }

      return assessVectorReadiness(db);
    },
  };
}
