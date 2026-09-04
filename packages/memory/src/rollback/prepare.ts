import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { acquireExclusiveMaintenanceLease, inspectLegacyDatabaseUsers } from "../database-lease.js";
import { type SnapshotSidecar, verifySnapshot } from "../database-snapshot.js";
import { getDefaultPackageRoot } from "../db.js";
import { resolveNativeAsset } from "../native-assets.js";
import { getDbPath, getMemoryDataDir } from "../paths.js";
import { ensureRecoveryCapsule, type VerifiedRecoveryCapsule } from "../recovery-capsule.js";
import {
  applySourceReconciliation,
  planSourceReconciliation,
  type ReconciliationPlan,
} from "./reconcile.js";
import {
  advanceRollbackState,
  createRollbackState,
  type RollbackState,
  RollbackStateError,
  readRollbackState,
} from "./state.js";

export interface PrepareRollbackOptions {
  to: string;
  dataDir?: string;
  dbPath?: string;
  capsuleDir?: string;
  catalogPath?: string;
  skipCapsuleExecution?: boolean;
}

export interface PrepareRollbackResult {
  phase: RollbackState["phase"];
  activeDatabase: string;
  retainedV3Database: string;
  reconciliation: ReconciliationPlan;
}

function hashFile(filePath: string): string {
  const data = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(data).digest("hex");
}

function preflightChecks(options: PrepareRollbackOptions): void {
  if (options.to !== "0.1.5") {
    throw new RollbackStateError(
      `only rollback to 0.1.5 is supported, got "${options.to}"`,
      "UNSUPPORTED_TARGET_VERSION",
    );
  }

  const nodeVersion = parseInt(process.versions.node, 10);
  if (nodeVersion < 24) {
    throw new RollbackStateError(
      `Node >= 24 required for rollback, got ${process.versions.node}`,
      "NODE_TOO_OLD",
    );
  }

  if (process.platform === "win32") {
    throw new RollbackStateError(
      "native Windows is not supported for rollback; use WSL2",
      "WINDOWS_UNSUPPORTED",
    );
  }
}

function findSnapshot(
  dbPath: string,
  fromVersion: number,
): { sidecarPath: string; sidecar: SnapshotSidecar } {
  const sidecarPath = `${dbPath}.snapshot-v${fromVersion}.json`;
  if (!fs.existsSync(sidecarPath)) {
    throw new RollbackStateError(
      `snapshot sidecar not found at ${sidecarPath} — run the v3 migration first`,
      "MISSING_SNAPSHOT",
    );
  }
  const sidecar = verifySnapshot(sidecarPath);
  return { sidecarPath, sidecar };
}

function copyStagedDatabase(snapshotPath: string, stagedPath: string): void {
  if (fs.existsSync(stagedPath)) {
    fs.unlinkSync(stagedPath);
  }
  fs.copyFileSync(snapshotPath, stagedPath);
}

export function prepareRollback(options: PrepareRollbackOptions): PrepareRollbackResult {
  preflightChecks(options);

  const dataDir = options.dataDir ?? getMemoryDataDir();
  const dbPath = options.dbPath ?? getDbPath();

  // Check for existing rollback state (resume support)
  const existing = readRollbackState(dataDir);
  if (existing) {
    if (existing.phase === "swapped") {
      return {
        phase: "swapped",
        activeDatabase: existing.stagedDatabase,
        retainedV3Database: existing.retainedV3Database,
        reconciliation: { created: [], modified: [], deleted: [], unchanged: [] },
      };
    }
    if (existing.phase === "fenced") {
      // Already fenced — proceed to swap
      return performSwap(dataDir, dbPath, existing);
    }
  }

  // Verify the capsule exists and is valid
  let capsule: VerifiedRecoveryCapsule;
  try {
    const capsuleOpts: Parameters<typeof ensureRecoveryCapsule>[0] = {
      fromVersion: "0.1.5",
      platform: process.platform as string,
      arch: process.arch as string,
    };
    if (options.catalogPath !== undefined) capsuleOpts.catalogPath = options.catalogPath;
    if (options.capsuleDir !== undefined) capsuleOpts.capsuleDir = options.capsuleDir;
    capsule = ensureRecoveryCapsule(capsuleOpts);
  } catch (err) {
    throw new RollbackStateError(
      `recovery capsule verification failed: ${err instanceof Error ? err.message : String(err)}`,
      "CAPSULE_VERIFICATION_FAILED",
    );
  }

  // Find and verify the snapshot
  const { sidecar } = findSnapshot(dbPath, 2);
  const snapshotPath = `${dbPath}.snapshot-v2`;

  if (!fs.existsSync(snapshotPath)) {
    throw new RollbackStateError(
      `snapshot database not found at ${snapshotPath}`,
      "MISSING_SNAPSHOT_DB",
    );
  }

  // Acquire exclusive maintenance lease
  const legacyUsers = inspectLegacyDatabaseUsers(dbPath);
  const aliveLegacy = legacyUsers.filter((d) => d.alive);
  if (aliveLegacy.length > 0) {
    throw new RollbackStateError(
      `active database users detected (PIDs: ${aliveLegacy.map((d) => d.pid).join(", ")}); stop all MCP servers and sync processes first`,
      "DATABASE_IN_USE",
    );
  }

  const lease = acquireExclusiveMaintenanceLease(dbPath);

  try {
    // Set up paths
    const stagedDbName = `rollback-staged-${Date.now()}.db`;
    const stagedPath = path.join(dataDir, stagedDbName);
    const retainedName = `retained-v3-${Date.now()}.db`;
    const dbIdentity = crypto
      .createHash("sha256")
      .update(`${dbPath}:${Date.now()}`)
      .digest("hex")
      .slice(0, 16);

    const snapshotHash = hashFile(snapshotPath);
    const capsuleManifestPath = path.join(capsule.root, "manifest.json");
    const capsuleHash = hashFile(capsuleManifestPath);

    // Copy snapshot to staged database
    copyStagedDatabase(snapshotPath, stagedPath);

    // Create rollback state
    const state = createRollbackState(dataDir, {
      phase: "staging",
      databaseId: dbIdentity,
      snapshotSha256: snapshotHash,
      capsuleSha256: capsuleHash,
      stagedDatabase: stagedDbName,
      retainedV3Database: retainedName,
    });

    const currentSources = new Map<
      string,
      { family: "transcript" | "journal"; canonicalPath: string }
    >();
    for (const src of sidecar.sources) {
      if (fs.existsSync(src.canonicalPath)) {
        currentSources.set(src.identity, {
          family: src.family,
          canonicalPath: src.canonicalPath,
        });
      }
    }

    const reconciliation = planSourceReconciliation(sidecar, currentSources);

    // Open the staged database and apply reconciliation
    const packageRoot = getDefaultPackageRoot();
    const stagedDb = new DatabaseSync(stagedPath, { allowExtension: true });
    try {
      if (packageRoot) {
        const asset = resolveNativeAsset(packageRoot);
        stagedDb.loadExtension(asset.absolutePath);
        stagedDb.enableLoadExtension(false);
      }
      stagedDb.exec("PRAGMA foreign_keys = ON");
      applySourceReconciliation(stagedDb, reconciliation);
    } finally {
      stagedDb.close();
    }

    // Fence writes
    advanceRollbackState(dataDir, "staging", "fenced");

    // Perform the swap
    return performSwap(dataDir, dbPath, readRollbackState(dataDir)!, reconciliation);
  } finally {
    lease.release();
  }
}

function performSwap(
  dataDir: string,
  dbPath: string,
  state: RollbackState,
  reconciliation?: ReconciliationPlan,
): PrepareRollbackResult {
  const stagedPath = path.join(dataDir, state.stagedDatabase);
  const retainedPath = path.join(dataDir, state.retainedV3Database);

  if (!fs.existsSync(stagedPath)) {
    throw new RollbackStateError(`staged database missing at ${stagedPath}`, "MISSING_STAGED_DB");
  }

  // Rename active v3 database to retained path
  if (fs.existsSync(dbPath)) {
    fs.renameSync(dbPath, retainedPath);
    // Also preserve WAL and SHM if they exist
    for (const suffix of ["-wal", "-shm"]) {
      const walPath = dbPath + suffix;
      if (fs.existsSync(walPath)) {
        fs.renameSync(walPath, retainedPath + suffix);
      }
    }
  }

  // Move staged to active
  fs.renameSync(stagedPath, dbPath);

  // Advance to swapped
  advanceRollbackState(dataDir, "fenced", "swapped");

  return {
    phase: "swapped",
    activeDatabase: dbPath,
    retainedV3Database: retainedPath,
    reconciliation: reconciliation ?? { created: [], modified: [], deleted: [], unchanged: [] },
  };
}
