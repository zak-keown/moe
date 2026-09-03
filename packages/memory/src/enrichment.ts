import type { MemoryDatabase } from "./db.js";
import { EMBEDDING_VERSION } from "./embedding-migration.js";
import { withTransaction } from "./database-transaction.js";

export interface PendingEnrichment {
  family: "exchange" | "journal";
  id: string;
  sourceText: string;
  epoch: number;
}

export interface JournalTextResult {
  id: string;
  path: string;
  root: string;
  scope: string;
  timestamp: number;
  text: string;
  sections: string[];
  embeddingVersion: number;
  excerpt: string;
}

export function pickPendingEnrichment(
  db: MemoryDatabase,
  limit = 50,
): PendingEnrichment[] {
  const results: PendingEnrichment[] = [];

  const exchanges = db
    .prepare(
      `SELECT id, user_message, assistant_message FROM exchanges
       WHERE embedding_version = 0
       ORDER BY timestamp DESC
       LIMIT ?`,
    )
    .all(limit) as Array<{
    id: string;
    user_message: string;
    assistant_message: string;
  }>;

  for (const row of exchanges) {
    results.push({
      family: "exchange",
      id: row.id,
      sourceText: `User: ${row.user_message}\n\nAssistant: ${row.assistant_message}`,
      epoch: 0,
    });
  }

  const remaining = limit - results.length;
  if (remaining > 0) {
    const journals = db
      .prepare(
        `SELECT id, text FROM journal_entries
         WHERE embedding_version = 0
         ORDER BY timestamp DESC
         LIMIT ?`,
      )
      .all(remaining) as Array<{ id: string; text: string }>;

    for (const row of journals) {
      results.push({
        family: "journal",
        id: row.id,
        sourceText: row.text,
        epoch: 0,
      });
    }
  }

  return results;
}

export function commitEnrichment(
  db: MemoryDatabase,
  item: PendingEnrichment,
  vector: Float32Array,
): void {
  withTransaction(db, () => {
    if (item.family === "exchange") {
      db.prepare("DELETE FROM vec_exchanges WHERE id = ?").run(item.id);
      db.prepare("INSERT INTO vec_exchanges (id, embedding) VALUES (?, ?)").run(
        item.id,
        new Uint8Array(vector.buffer, vector.byteOffset, vector.byteLength),
      );
      db.prepare("UPDATE exchanges SET embedding_version = ? WHERE id = ?").run(
        EMBEDDING_VERSION,
        item.id,
      );
    } else {
      db.prepare("DELETE FROM vec_journal_entries WHERE id = ?").run(item.id);
      db.prepare("INSERT INTO vec_journal_entries (id, embedding) VALUES (?, ?)").run(
        item.id,
        new Uint8Array(vector.buffer, vector.byteOffset, vector.byteLength),
      );
      db.prepare("UPDATE journal_entries SET embedding_version = ? WHERE id = ?").run(
        EMBEDDING_VERSION,
        item.id,
      );
    }
  });
}

function generateExcerptFromText(text: string, query: string, maxLength = 200): string {
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

export function searchJournalText(
  db: MemoryDatabase,
  query: string,
  options: {
    roots?: readonly string[];
    scope?: "project" | "user" | "both";
    dateRange?: { start?: Date; end?: Date };
    limit?: number;
  } = {},
): JournalTextResult[] {
  const limit = options.limit ?? 10;
  const parts: string[] = ["j.text LIKE ?"];
  const params: Array<string | number> = [`%${query}%`];

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

  const rows = db
    .prepare(
      `SELECT j.id, j.path, j.root, j.scope, j.timestamp, j.text, j.sections, j.embedding_version
       FROM journal_entries AS j
       WHERE ${whereClause}
       ORDER BY j.timestamp DESC
       LIMIT ?`,
    )
    .all(...params, limit) as Array<{
    id: string;
    path: string;
    root: string;
    scope: string;
    timestamp: number;
    text: string;
    sections: string;
    embedding_version: number;
  }>;

  return rows.map((row) => {
    let sections: string[] = [];
    try {
      const parsed: unknown = JSON.parse(row.sections);
      if (Array.isArray(parsed)) sections = parsed.filter((s): s is string => typeof s === "string");
    } catch {}
    return {
      id: row.id,
      path: row.path,
      root: row.root,
      scope: row.scope,
      timestamp: row.timestamp,
      text: row.text,
      sections,
      embeddingVersion: row.embedding_version,
      excerpt: generateExcerptFromText(row.text, query),
    };
  });
}
