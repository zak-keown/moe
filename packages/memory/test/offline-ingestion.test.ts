import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { insertExchange, upsertJournalEntry } from "../src/db.js";
import { commitEnrichment, pickPendingEnrichment, searchJournalText } from "../src/enrichment.js";
import type { ConversationExchange, JournalEntry } from "../src/types.js";
import { openTestDatabase } from "./test-utils.js";

describe("offline ingestion — text-first persistence", () => {
  let dataDir: string;
  let dbPath: string;

  beforeEach(async () => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "moe-offline-"));
    dbPath = path.join(dataDir, "test.db");
  });

  afterEach(async () => {
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  function makeExchange(id: string, text: string): ConversationExchange {
    return {
      id,
      project: "test-project",
      timestamp: new Date().toISOString(),
      userMessage: text,
      assistantMessage: `Response about ${text}`,
      archivePath: "/fake/archive.jsonl",
      lineStart: 1,
      lineEnd: 10,
    };
  }

  function makeJournalEntry(id: string, text: string): JournalEntry {
    return {
      id,
      path: `/fake/journal/${id}.md`,
      root: "/fake/journal",
      scope: "user",
      timestamp: Date.now(),
      text,
      sections: ["Technical Insights"],
    };
  }

  it("commits raw exchange text when embeddings are unavailable", () => {
    const db = openTestDatabase(dbPath);

    const exchange = makeExchange("ex-1", "atomic swap implementation");
    insertExchange(db, exchange, null);

    const row = db.prepare("SELECT embedding_version FROM exchanges WHERE id = ?").get("ex-1") as {
      embedding_version: number;
    };
    expect(row.embedding_version).toBe(0);

    // Verify no vec row was created
    const vecRow = db
      .prepare("SELECT count(*) AS c FROM vec_exchanges WHERE id = ?")
      .get("ex-1") as {
      c: number;
    };
    expect(vecRow.c).toBe(0);

    db.close();
  });

  it("commits raw journal text when embeddings are unavailable", () => {
    const db = openTestDatabase(dbPath);

    const entry = makeJournalEntry("j-1", "atomic swap design notes for the consensus layer");
    upsertJournalEntry(db, entry, Date.now(), null);

    const row = db
      .prepare("SELECT embedding_version FROM journal_entries WHERE id = ?")
      .get("j-1") as { embedding_version: number };
    expect(row.embedding_version).toBe(0);

    const vecRow = db
      .prepare("SELECT count(*) AS c FROM vec_journal_entries WHERE id = ?")
      .get("j-1") as { c: number };
    expect(vecRow.c).toBe(0);

    db.close();
  });

  it("finds journal text with SQL LIKE when no embeddings exist", () => {
    const db = openTestDatabase(dbPath);

    upsertJournalEntry(
      db,
      makeJournalEntry("j-1", "atomic swap design notes for the consensus layer"),
      Date.now(),
      null,
    );
    upsertJournalEntry(
      db,
      makeJournalEntry("j-2", "merkle tree verification approach"),
      Date.now(),
      null,
    );

    const results = searchJournalText(db, "atomic swap");
    expect(results.length).toBe(1);
    expect(results[0]!.embeddingVersion).toBe(0);
    expect(results[0]!.excerpt).toContain("atomic swap");

    db.close();
  });

  it("picks pending enrichment items with version 0", () => {
    const db = openTestDatabase(dbPath);

    insertExchange(db, makeExchange("ex-1", "first exchange"), null);
    insertExchange(db, makeExchange("ex-2", "second exchange"), null);
    upsertJournalEntry(db, makeJournalEntry("j-1", "journal text"), Date.now(), null);

    const pending = pickPendingEnrichment(db, 10);
    expect(pending.length).toBe(3);
    expect(pending.filter((p) => p.family === "exchange").length).toBe(2);
    expect(pending.filter((p) => p.family === "journal").length).toBe(1);

    db.close();
  });

  it("commits enrichment with vector and bumps version", () => {
    const db = openTestDatabase(dbPath);

    insertExchange(db, makeExchange("ex-1", "something to enrich"), null);

    // Verify version 0 initially
    const before = db
      .prepare("SELECT embedding_version FROM exchanges WHERE id = ?")
      .get("ex-1") as {
      embedding_version: number;
    };
    expect(before.embedding_version).toBe(0);

    // Commit enrichment
    const fakeVector = new Float32Array(384).fill(0.01);
    const pending = pickPendingEnrichment(db, 1);
    expect(pending.length).toBe(1);
    commitEnrichment(db, pending[0]!, fakeVector);

    // Verify version bumped
    const after = db
      .prepare("SELECT embedding_version FROM exchanges WHERE id = ?")
      .get("ex-1") as {
      embedding_version: number;
    };
    expect(after.embedding_version).toBeGreaterThan(0);

    // Verify vec row exists
    const vecRow = db
      .prepare("SELECT count(*) AS c FROM vec_exchanges WHERE id = ?")
      .get("ex-1") as {
      c: number;
    };
    expect(vecRow.c).toBe(1);

    // Should no longer be pending
    const stillPending = pickPendingEnrichment(db, 10);
    expect(stillPending.filter((p) => p.id === "ex-1").length).toBe(0);

    db.close();
  });

  it("commits journal enrichment with vector and bumps version", () => {
    const db = openTestDatabase(dbPath);

    upsertJournalEntry(db, makeJournalEntry("j-1", "enrich this journal"), Date.now(), null);

    const fakeVector = new Float32Array(384).fill(0.02);
    const pending = pickPendingEnrichment(db, 1);
    expect(pending.length).toBe(1);
    commitEnrichment(db, pending[0]!, fakeVector);

    const after = db
      .prepare("SELECT embedding_version FROM journal_entries WHERE id = ?")
      .get("j-1") as { embedding_version: number };
    expect(after.embedding_version).toBeGreaterThan(0);

    const vecRow = db
      .prepare("SELECT count(*) AS c FROM vec_journal_entries WHERE id = ?")
      .get("j-1") as { c: number };
    expect(vecRow.c).toBe(1);

    db.close();
  });

  it("searchJournalText respects scope filter", () => {
    const db = openTestDatabase(dbPath);

    const projectEntry = makeJournalEntry("j-p", "project notes about protocols");
    projectEntry.scope = "project";
    upsertJournalEntry(db, projectEntry, Date.now(), null);

    const userEntry = makeJournalEntry("j-u", "user notes about protocols");
    userEntry.scope = "user";
    upsertJournalEntry(db, userEntry, Date.now(), null);

    const all = searchJournalText(db, "protocols");
    expect(all.length).toBe(2);

    const projectOnly = searchJournalText(db, "protocols", { scope: "project" });
    expect(projectOnly.length).toBe(1);
    expect(projectOnly[0]!.scope).toBe("project");

    db.close();
  });

  it("searchJournalText respects date range filter", () => {
    const db = openTestDatabase(dbPath);

    const old = makeJournalEntry("j-old", "old entry about protocols");
    old.timestamp = new Date("2024-01-01").getTime();
    upsertJournalEntry(db, old, Date.now(), null);

    const recent = makeJournalEntry("j-new", "new entry about protocols");
    recent.timestamp = new Date("2025-06-01").getTime();
    upsertJournalEntry(db, recent, Date.now(), null);

    const filtered = searchJournalText(db, "protocols", {
      dateRange: { start: new Date("2025-01-01") },
    });
    expect(filtered.length).toBe(1);
    expect(filtered[0]!.id).toBe("j-new");

    db.close();
  });

  it("insertExchange with embedding still works (backwards compatible)", () => {
    const db = openTestDatabase(dbPath);

    const exchange = makeExchange("ex-embed", "embedded exchange");
    const embedding = new Array(384).fill(0.05);
    insertExchange(db, exchange, embedding);

    const row = db
      .prepare("SELECT embedding_version FROM exchanges WHERE id = ?")
      .get("ex-embed") as { embedding_version: number };
    expect(row.embedding_version).toBeGreaterThan(0);

    const vecRow = db
      .prepare("SELECT count(*) AS c FROM vec_exchanges WHERE id = ?")
      .get("ex-embed") as { c: number };
    expect(vecRow.c).toBe(1);

    db.close();
  });
});
