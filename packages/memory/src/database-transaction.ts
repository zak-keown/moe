import type { MemoryDatabase } from "./db.js";

export function withTransaction<T>(db: MemoryDatabase, body: () => T): T {
  db.exec("BEGIN");
  try {
    const value = body();
    db.exec("COMMIT");
    return value;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function withForeignKeysDisabled<T>(db: MemoryDatabase, body: () => T): T {
  const row = db.prepare("PRAGMA foreign_keys").get() as { foreign_keys: number };
  db.exec("PRAGMA foreign_keys = OFF");
  try {
    return body();
  } finally {
    db.exec(`PRAGMA foreign_keys = ${row.foreign_keys ? "ON" : "OFF"}`);
  }
}
