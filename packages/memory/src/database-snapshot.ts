import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { MemoryDatabase } from "./db.js";
import { acquireExclusiveMaintenanceLease, type DatabaseLease } from "./database-lease.js";

export interface SnapshotSourceRecord {
  family: "transcript" | "journal";
  identity: string;
  canonicalPath: string;
  sha256: string;
}

export interface SnapshotSidecar {
  schema: 1;
  dbIdentity: string;
  dbSha256: string;
  dbBytes: number;
  fromVersion: number;
  toVersion: number;
  sourceArtifactIntegrity: string;
  sources: SnapshotSourceRecord[];
  createdAt: string;
}

export interface SnapshotResult {
  snapshotPath: string;
  sidecarPath: string;
  sidecar: SnapshotSidecar;
  lease: DatabaseLease;
}

function hashFile(filePath: string): string {
  const hash = crypto.createHash("sha256");
  const data = fs.readFileSync(filePath);
  hash.update(data);
  return hash.digest("hex");
}

function hashContent(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

export function validateSnapshotSources(sources: SnapshotSourceRecord[]): void {
  const seen = new Set<string>();
  for (const src of sources) {
    if (seen.has(src.identity)) {
      throw new Error(`Duplicate source identity: ${src.identity}`);
    }
    seen.add(src.identity);

    if (src.canonicalPath.includes("..")) {
      throw new Error(`Path escape detected in source: ${src.canonicalPath}`);
    }

    if (!src.sha256 || src.sha256.length !== 64) {
      throw new Error(`Invalid SHA-256 for source ${src.identity}: ${src.sha256}`);
    }
  }
}

export function collectSnapshotSources(db: MemoryDatabase): SnapshotSourceRecord[] {
  const sources: SnapshotSourceRecord[] = [];

  const exchanges = db
    .prepare("SELECT id, archive_path FROM exchanges ORDER BY id")
    .all() as Array<{ id: string; archive_path: string }>;

  for (const row of exchanges) {
    let sha256 = "";
    try {
      if (fs.existsSync(row.archive_path)) {
        sha256 = hashFile(row.archive_path);
      }
    } catch {}
    sources.push({
      family: "transcript",
      identity: row.id,
      canonicalPath: row.archive_path,
      sha256,
    });
  }

  const journals = db
    .prepare("SELECT id, path FROM journal_entries ORDER BY id")
    .all() as Array<{ id: string; path: string }>;

  for (const row of journals) {
    let sha256 = "";
    try {
      if (fs.existsSync(row.path)) {
        sha256 = hashFile(row.path);
      }
    } catch {}
    sources.push({
      family: "journal",
      identity: row.id,
      canonicalPath: row.path,
      sha256,
    });
  }

  sources.sort((a, b) => a.identity.localeCompare(b.identity));
  return sources;
}

export function createDatabaseSnapshot(
  db: MemoryDatabase,
  dbPath: string,
  options: {
    fromVersion: number;
    toVersion: number;
    sourceArtifactIntegrity?: string;
    callerLease?: DatabaseLease;
  },
): SnapshotResult {
  if (options.callerLease) options.callerLease.release();
  const lease = acquireExclusiveMaintenanceLease(dbPath);

  try {
    const snapshotPath = `${dbPath}.snapshot-v${options.fromVersion}`;
    const sidecarPath = `${snapshotPath}.json`;

    db.exec(`VACUUM INTO '${snapshotPath.replace(/'/g, "''")}'`);

    const dbSha256 = hashFile(snapshotPath);
    const dbBytes = fs.statSync(snapshotPath).size;
    const dbIdentity = hashContent(`${dbPath}:${Date.now()}`).slice(0, 16);

    const sources = collectSnapshotSources(db);
    validateSnapshotSources(sources);

    const sidecar: SnapshotSidecar = {
      schema: 1,
      dbIdentity,
      dbSha256,
      dbBytes,
      fromVersion: options.fromVersion,
      toVersion: options.toVersion,
      sourceArtifactIntegrity: options.sourceArtifactIntegrity ?? "",
      sources,
      createdAt: new Date().toISOString(),
    };

    fs.writeFileSync(sidecarPath, JSON.stringify(sidecar, null, 2));

    return { snapshotPath, sidecarPath, sidecar, lease };
  } catch (error) {
    lease.release();
    throw error;
  }
}

export function verifySnapshot(sidecarPath: string): SnapshotSidecar {
  const raw = fs.readFileSync(sidecarPath, "utf-8");
  const sidecar = JSON.parse(raw) as SnapshotSidecar;

  if (sidecar.schema !== 1) {
    throw new Error(`Unsupported snapshot schema: ${sidecar.schema}`);
  }
  if (!sidecar.dbSha256 || sidecar.dbSha256.length !== 64) {
    throw new Error("Invalid snapshot database hash");
  }

  const snapshotPath = sidecarPath.replace(/\.json$/, "");
  if (fs.existsSync(snapshotPath)) {
    const actualHash = hashFile(snapshotPath);
    if (actualHash !== sidecar.dbSha256) {
      throw new Error(
        `Snapshot database hash mismatch: expected ${sidecar.dbSha256}, got ${actualHash}`,
      );
    }
  }

  validateSnapshotSources(sidecar.sources);
  return sidecar;
}
