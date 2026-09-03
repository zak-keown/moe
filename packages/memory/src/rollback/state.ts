import fs from "node:fs";
import path from "node:path";

export type RollbackPhase = "staging" | "fenced" | "swapped";

export interface RollbackState {
  schema: 1;
  phase: RollbackPhase;
  databaseId: string;
  snapshotSha256: string;
  capsuleSha256: string;
  stagedDatabase: string;
  retainedV3Database: string;
}

const VALID_TRANSITIONS: ReadonlyMap<RollbackPhase, RollbackPhase> = new Map([
  ["staging", "fenced"],
  ["fenced", "swapped"],
]);

export class RollbackStateError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "RollbackStateError";
  }
}

function rollbackStatePath(dataDir: string): string {
  return path.join(dataDir, "rollback-state.json");
}

function validateState(raw: unknown): raw is RollbackState {
  if (!raw || typeof raw !== "object") return false;
  const s = raw as Record<string, unknown>;
  if (s.schema !== 1) return false;
  if (typeof s.phase !== "string") return false;
  if (!["staging", "fenced", "swapped"].includes(s.phase)) return false;
  if (typeof s.databaseId !== "string" || s.databaseId.length === 0) return false;
  if (typeof s.snapshotSha256 !== "string" || s.snapshotSha256.length !== 64) return false;
  if (typeof s.capsuleSha256 !== "string" || s.capsuleSha256.length !== 64) return false;
  if (typeof s.stagedDatabase !== "string" || s.stagedDatabase.length === 0) return false;
  if (typeof s.retainedV3Database !== "string" || s.retainedV3Database.length === 0) return false;

  if (
    path.normalize(s.stagedDatabase as string).startsWith("..") ||
    path.isAbsolute(s.stagedDatabase as string)
  ) {
    return false;
  }
  if (
    path.normalize(s.retainedV3Database as string).startsWith("..") ||
    path.isAbsolute(s.retainedV3Database as string)
  ) {
    return false;
  }

  return true;
}

function atomicWriteFile(filePath: string, content: string): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmpPath = `${filePath}.tmp.${process.pid}`;
  const fd = fs.openSync(tmpPath, "w");
  try {
    fs.writeSync(fd, content);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
  } catch (err) {
    try {
      fs.closeSync(fd);
    } catch {}
    try {
      fs.unlinkSync(tmpPath);
    } catch {}
    throw err;
  }
  fs.renameSync(tmpPath, filePath);
  const dirFd = fs.openSync(dir, "r");
  try {
    fs.fsyncSync(dirFd);
  } catch {
  } finally {
    fs.closeSync(dirFd);
  }
}

export function readRollbackState(dataDir: string): RollbackState | null {
  const p = rollbackStatePath(dataDir);
  try {
    const content = fs.readFileSync(p, "utf-8");
    const parsed = JSON.parse(content);
    if (!validateState(parsed)) {
      throw new RollbackStateError("malformed rollback state file", "MALFORMED_STATE");
    }
    return parsed;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export function createRollbackState(
  dataDir: string,
  init: Omit<RollbackState, "schema">,
): RollbackState {
  const existing = readRollbackState(dataDir);
  if (existing) {
    throw new RollbackStateError(
      `rollback state already exists in phase "${existing.phase}"`,
      "STATE_EXISTS",
    );
  }

  if (init.phase !== "staging") {
    throw new RollbackStateError(
      `initial rollback state must be "staging", got "${init.phase}"`,
      "INVALID_INITIAL_PHASE",
    );
  }

  const state: RollbackState = { schema: 1, ...init };
  if (!validateState(state)) {
    throw new RollbackStateError("invalid rollback state fields", "INVALID_STATE");
  }

  atomicWriteFile(rollbackStatePath(dataDir), JSON.stringify(state, null, 2));
  return state;
}

export function advanceRollbackState(
  dataDir: string,
  expected: RollbackPhase,
  next: RollbackPhase,
): RollbackState {
  const current = readRollbackState(dataDir);
  if (!current) {
    throw new RollbackStateError("no rollback state exists", "NO_STATE");
  }

  if (current.phase !== expected) {
    throw new RollbackStateError(
      `expected phase "${expected}", got "${current.phase}"`,
      "PHASE_MISMATCH",
    );
  }

  const allowed = VALID_TRANSITIONS.get(expected);
  if (allowed !== next) {
    throw new RollbackStateError(
      `invalid transition: "${expected}" -> "${next}"`,
      "INVALID_TRANSITION",
    );
  }

  const updated: RollbackState = { ...current, phase: next };
  atomicWriteFile(rollbackStatePath(dataDir), JSON.stringify(updated, null, 2));
  return updated;
}

export function clearRollbackState(dataDir: string): void {
  const current = readRollbackState(dataDir);
  if (current && current.phase === "swapped") {
    throw new RollbackStateError(
      "cannot clear rollback state after swap — the v3 database has been replaced",
      "CANNOT_CLEAR_AFTER_SWAP",
    );
  }

  const p = rollbackStatePath(dataDir);
  try {
    fs.unlinkSync(p);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}
