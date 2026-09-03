import type { MemoryDatabase } from "./db.js";

export type VectorReadiness =
  | { state: "ready"; total: number; remaining: 0; fromVersion: 2; toVersion: 3 }
  | { state: "upgrading"; total: number; remaining: number; fromVersion: 2; toVersion: 3 }
  | { state: "blocked"; reason: string; total: number; remaining: number; fromVersion: 2; toVersion: 3 };

export function assessVectorReadiness(db: MemoryDatabase): VectorReadiness {
  const exchangeTotal = (
    db.prepare("SELECT COUNT(*) AS c FROM exchanges").get() as { c: number }
  ).c;
  const journalTotal = (
    db.prepare("SELECT COUNT(*) AS c FROM journal_entries").get() as { c: number }
  ).c;
  const total = exchangeTotal + journalTotal;

  const exchangePending = (
    db.prepare("SELECT COUNT(*) AS c FROM exchanges WHERE embedding_version < 3").get() as {
      c: number;
    }
  ).c;
  const journalPending = (
    db.prepare("SELECT COUNT(*) AS c FROM journal_entries WHERE embedding_version < 3").get() as {
      c: number;
    }
  ).c;
  const remaining = exchangePending + journalPending;

  const futureExchanges = (
    db.prepare("SELECT COUNT(*) AS c FROM exchanges WHERE embedding_version > 3").get() as {
      c: number;
    }
  ).c;
  const futureJournals = (
    db.prepare("SELECT COUNT(*) AS c FROM journal_entries WHERE embedding_version > 3").get() as {
      c: number;
    }
  ).c;

  if (futureExchanges > 0 || futureJournals > 0) {
    return {
      state: "blocked",
      reason: "Database contains records with embedding version > 3 (from a newer runtime)",
      total,
      remaining,
      fromVersion: 2,
      toVersion: 3,
    };
  }

  if (remaining === 0) {
    return { state: "ready", total, remaining: 0, fromVersion: 2, toVersion: 3 };
  }

  return { state: "upgrading", total, remaining, fromVersion: 2, toVersion: 3 };
}

export function isVectorQueryAuthorized(db: MemoryDatabase): boolean {
  const readiness = assessVectorReadiness(db);
  return readiness.state === "ready";
}

export function vectorReadinessMessage(readiness: VectorReadiness): string {
  switch (readiness.state) {
    case "ready":
      return `Vector search ready (${readiness.total} records at version 3)`;
    case "upgrading":
      return `Vector search upgrading: ${readiness.remaining}/${readiness.total} records remaining`;
    case "blocked":
      return `Vector search blocked: ${readiness.reason}`;
  }
}
