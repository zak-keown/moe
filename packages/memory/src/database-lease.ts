import fs from "node:fs";
import path from "node:path";
import type { MemoryDatabase } from "./db.js";
import {
  acquireFileLock,
  type FileLockHandle,
  readLockHolder,
  releaseFileLock,
} from "./file-lock.js";

export class DatabaseBusyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseBusyError";
  }
}

export interface DatabaseLease {
  mode: "shared" | "exclusive";
  epoch: number;
  release(): void;
}

export interface DatabaseWriter {
  epoch: number;
  release(): void;
}

export interface LegacyUserDiagnostic {
  pid: number;
  alive: boolean;
}

const LEASE_DIR_SUFFIX = ".leases";
const EPOCH_FILE_SUFFIX = ".epoch";
const WRITER_LOCK_SUFFIX = ".writer.lock";

function leaseDir(dbPath: string): string {
  return dbPath + LEASE_DIR_SUFFIX;
}

function epochFile(dbPath: string): string {
  return dbPath + EPOCH_FILE_SUFFIX;
}

function writerLockPath(dbPath: string): string {
  return dbPath + WRITER_LOCK_SUFFIX;
}

function sharedLockPath(dbPath: string, id: string): string {
  return path.join(leaseDir(dbPath), `shared-${id}.lock`);
}

function generateLeaseId(): string {
  return `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function readDatabaseEpoch(dbPath: string): number {
  const ep = epochFile(dbPath);
  try {
    const content = fs.readFileSync(ep, "utf-8").trim();
    const n = parseInt(content, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

function writeDatabaseEpoch(dbPath: string, epoch: number): void {
  const ep = epochFile(dbPath);
  fs.mkdirSync(path.dirname(ep), { recursive: true });
  fs.writeFileSync(ep, String(epoch), "utf-8");
}

function listSharedLeases(dbPath: string): string[] {
  const dir = leaseDir(dbPath);
  try {
    return fs.readdirSync(dir).filter((f) => f.startsWith("shared-") && f.endsWith(".lock"));
  } catch {
    return [];
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function cleanStaleSharedLeases(dbPath: string): void {
  const dir = leaseDir(dbPath);
  for (const file of listSharedLeases(dbPath)) {
    const lockPath = path.join(dir, file);
    const pid = readLockHolder(lockPath);
    if (pid !== null && !isProcessAlive(pid)) {
      try {
        fs.unlinkSync(lockPath);
      } catch {}
      try {
        fs.rmSync(lockPath + ".lock", { recursive: true, force: true });
      } catch {}
    }
  }
}

export function acquireSharedDatabaseLease(dbPath: string): DatabaseLease {
  const dir = leaseDir(dbPath);
  fs.mkdirSync(dir, { recursive: true });

  const id = generateLeaseId();
  const lockPath = sharedLockPath(dbPath, id);
  const handle = acquireFileLock(lockPath);
  if (!handle) {
    throw new DatabaseBusyError(`Failed to acquire shared lease for ${dbPath}`);
  }

  const epoch = readDatabaseEpoch(dbPath);
  let released = false;

  return {
    mode: "shared",
    epoch,
    release() {
      if (released) return;
      released = true;
      releaseFileLock(handle);
    },
  };
}

export function acquireDatabaseWriter(dbPath: string, shared: DatabaseLease): DatabaseWriter {
  if (shared.mode !== "shared") {
    throw new Error("acquireDatabaseWriter requires a shared lease");
  }

  const lockPath = writerLockPath(dbPath);
  const handle = acquireFileLock(lockPath);
  if (!handle) {
    throw new DatabaseBusyError(`Database writer lock is held by another process for ${dbPath}`);
  }

  const epoch = readDatabaseEpoch(dbPath);
  let released = false;

  return {
    epoch,
    release() {
      if (released) return;
      released = true;
      releaseFileLock(handle);
    },
  };
}

export function withDatabaseWriter<T>(db: MemoryDatabase, expectedEpoch: number, body: () => T): T {
  const dbPath = (db as any).__leasePath as string | undefined;
  if (!dbPath) {
    return body();
  }

  const currentEpoch = readDatabaseEpoch(dbPath);
  if (currentEpoch !== expectedEpoch) {
    throw new DatabaseBusyError(
      `Database epoch changed (expected ${expectedEpoch}, got ${currentEpoch}) — a maintenance operation may have replaced the database`,
    );
  }

  return body();
}

export function inspectLegacyDatabaseUsers(dbPath: string): LegacyUserDiagnostic[] {
  const diagnostics: LegacyUserDiagnostic[] = [];

  // Check for WAL/SHM files indicating open database handles
  const walPath = dbPath + "-wal";
  const shmPath = dbPath + "-shm";

  const walExists = fs.existsSync(walPath);
  const shmExists = fs.existsSync(shmPath);

  if (!walExists && !shmExists) {
    return diagnostics;
  }

  // Check the sync lock file which records the PID of active sync processes
  const syncLockPath = path.join(path.dirname(dbPath), "sync.lock");
  const syncPid = readLockHolder(syncLockPath);
  if (syncPid !== null && isProcessAlive(syncPid)) {
    diagnostics.push({ pid: syncPid, alive: true });
  }

  // On macOS/Linux, check for processes holding the database file open via lsof
  if (process.platform === "darwin" || process.platform === "linux") {
    try {
      const { execSync } = require("node:child_process");
      const output = execSync(`lsof -t "${dbPath}" 2>/dev/null`, {
        encoding: "utf-8",
        timeout: 5000,
      }).trim();
      if (output) {
        for (const line of output.split("\n")) {
          const pid = parseInt(line.trim(), 10);
          if (Number.isFinite(pid) && pid > 0 && pid !== process.pid) {
            if (!diagnostics.some((d) => d.pid === pid)) {
              diagnostics.push({ pid, alive: isProcessAlive(pid) });
            }
          }
        }
      }
    } catch {
      // lsof not available or failed — continue without it
    }
  }

  return diagnostics;
}

export function acquireExclusiveMaintenanceLease(dbPath: string): DatabaseLease {
  // Clean up stale shared leases from dead processes
  cleanStaleSharedLeases(dbPath);

  // Check for active shared leases
  const activeLeases = listSharedLeases(dbPath);
  if (activeLeases.length > 0) {
    // Verify at least one is actually held (not just stale files)
    const dir = leaseDir(dbPath);
    for (const file of activeLeases) {
      const lockPath = path.join(dir, file);
      const pid = readLockHolder(lockPath);
      if (pid !== null && isProcessAlive(pid)) {
        throw new DatabaseBusyError(
          `Cannot acquire exclusive maintenance lease: shared lease held by PID ${pid}`,
        );
      }
    }
    // All remaining are stale — clean them up
    for (const file of activeLeases) {
      const lockPath = path.join(dir, file);
      try {
        fs.unlinkSync(lockPath);
      } catch {}
      try {
        fs.rmSync(lockPath + ".lock", { recursive: true, force: true });
      } catch {}
    }
  }

  // Check for legacy database users
  const legacyUsers = inspectLegacyDatabaseUsers(dbPath);
  const aliveLegacy = legacyUsers.filter((d) => d.alive);
  if (aliveLegacy.length > 0) {
    const pids = aliveLegacy.map((d) => d.pid).join(", ");
    throw new DatabaseBusyError(
      `Cannot acquire exclusive maintenance lease: legacy database users detected (PIDs: ${pids})`,
    );
  }

  // Acquire the writer lock to ensure no concurrent writers
  const writerHandle = acquireFileLock(writerLockPath(dbPath));
  if (!writerHandle) {
    throw new DatabaseBusyError(`Cannot acquire exclusive maintenance lease: writer lock is held`);
  }

  // Bump the epoch
  const newEpoch = readDatabaseEpoch(dbPath) + 1;
  writeDatabaseEpoch(dbPath, newEpoch);

  let released = false;

  return {
    mode: "exclusive",
    epoch: newEpoch,
    release() {
      if (released) return;
      released = true;
      releaseFileLock(writerHandle);
    },
  };
}

export function assertWritableEpoch(dbPath: string, expected: number): void {
  const current = readDatabaseEpoch(dbPath);
  if (current !== expected) {
    throw new DatabaseBusyError(
      `Database epoch mismatch (expected ${expected}, got ${current}) — the database may have been replaced by a maintenance operation`,
    );
  }
}
