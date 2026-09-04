#!/usr/bin/env node
/**
 * Simulates a legacy v2 database holder — a process that opens the SQLite
 * database and holds it open until told to stop.
 *
 * Usage: node legacy-v2-holder.mjs <db-path>
 *
 * The process writes "READY\n" to stdout once the database is open,
 * then holds it open until it receives "STOP\n" on stdin or the process
 * is killed.
 */

import { DatabaseSync } from "node:sqlite";

const dbPath = process.argv[2];
if (!dbPath) {
  process.stderr.write("Usage: legacy-v2-holder.mjs <db-path>\n");
  process.exit(1);
}

const db = new DatabaseSync(dbPath);
db.exec("PRAGMA journal_mode = WAL");
// Write a row to force WAL file creation
db.exec("CREATE TABLE IF NOT EXISTS _legacy_holder (pid INTEGER)");
db.exec(`INSERT INTO _legacy_holder VALUES (${process.pid})`);

process.stdout.write("READY\n");

process.stdin.setEncoding("utf-8");
process.stdin.on("data", (data) => {
  if (data.trim() === "STOP") {
    db.close();
    process.exit(0);
  }
});

// Keep process alive
process.stdin.resume();
