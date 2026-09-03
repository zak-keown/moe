// @generated — do not edit; see scripts/build-runtime.mjs
import { createRequire as __createRequire } from 'module';
const require = __createRequire(import.meta.url);
import {
  ensureRecoveryCapsule,
  verifySnapshot
} from "./chunk-DIF2OON7.js";
import {
  RollbackStateError,
  acquireExclusiveMaintenanceLease,
  advanceRollbackState,
  clearRollbackState,
  createRollbackState,
  getDefaultPackageRoot,
  inspectLegacyDatabaseUsers,
  readRollbackState,
  resolveNativeAsset,
  withTransaction
} from "./chunk-LUAEQ7DI.js";
import {
  getDbPath,
  getMemoryDataDir
} from "./chunk-YFLZKW2J.js";
import "./chunk-NH4NDHAK.js";
import "./chunk-XRZM5UX2.js";

// src/rollback/abort.ts
import fs from "node:fs";
import path from "node:path";
function abortRollback(options = {}) {
  const dataDir = options.dataDir ?? getMemoryDataDir();
  const state = readRollbackState(dataDir);
  if (!state) {
    return { aborted: false, message: "no rollback in progress" };
  }
  if (state.phase === "swapped") {
    throw new RollbackStateError(
      "cannot abort after swap \u2014 the v3 database has already been replaced",
      "CANNOT_ABORT_AFTER_SWAP"
    );
  }
  const stagedPath = path.join(dataDir, state.stagedDatabase);
  try {
    if (fs.existsSync(stagedPath)) {
      fs.unlinkSync(stagedPath);
    }
  } catch {
  }
  clearRollbackState(dataDir);
  return {
    aborted: true,
    message: `rollback aborted from phase "${state.phase}"`
  };
}

// src/rollback/prepare.ts
import crypto2 from "node:crypto";
import fs3 from "node:fs";
import path2 from "node:path";
import { DatabaseSync } from "node:sqlite";

// src/rollback/reconcile.ts
import crypto from "node:crypto";
import fs2 from "node:fs";
function hashFileContent(filePath) {
  try {
    const data = fs2.readFileSync(filePath);
    return crypto.createHash("sha256").update(data).digest("hex");
  } catch {
    return null;
  }
}
function planSourceReconciliation(sidecar, currentSourcePaths) {
  const created = [];
  const modified = [];
  const deleted = [];
  const unchanged = [];
  const snapshotSources = /* @__PURE__ */ new Map();
  for (const src of sidecar.sources) {
    snapshotSources.set(src.identity, src);
  }
  for (const [identity, current] of currentSourcePaths) {
    const snapshot = snapshotSources.get(identity);
    if (!snapshot) {
      created.push({
        family: current.family,
        identity,
        canonicalPath: current.canonicalPath
      });
      continue;
    }
    const currentHash = hashFileContent(current.canonicalPath);
    if (currentHash === null) {
      continue;
    }
    if (currentHash !== snapshot.sha256) {
      modified.push({
        family: current.family,
        identity,
        canonicalPath: current.canonicalPath
      });
    } else {
      unchanged.push({
        family: current.family,
        identity,
        canonicalPath: current.canonicalPath
      });
    }
  }
  for (const [identity, snapshot] of snapshotSources) {
    if (!currentSourcePaths.has(identity)) {
      deleted.push({
        family: snapshot.family,
        identity,
        canonicalPath: snapshot.canonicalPath
      });
    }
  }
  return { created, modified, deleted, unchanged };
}
function applySourceReconciliation(stagedDb, plan) {
  withTransaction(stagedDb, () => {
    for (const change of plan.deleted) {
      if (change.family === "transcript") {
        stagedDb.prepare("DELETE FROM vec_exchanges WHERE id = ?").run(change.identity);
        stagedDb.prepare("DELETE FROM tool_calls WHERE exchange_id = ?").run(change.identity);
        stagedDb.prepare("DELETE FROM exchanges WHERE id = ?").run(change.identity);
      } else {
        stagedDb.prepare("DELETE FROM vec_journal_entries WHERE id = ?").run(change.identity);
        stagedDb.prepare("DELETE FROM journal_entries WHERE id = ?").run(change.identity);
      }
    }
    for (const change of plan.modified) {
      if (change.family === "transcript") {
        stagedDb.prepare("DELETE FROM vec_exchanges WHERE id = ?").run(change.identity);
        stagedDb.prepare("UPDATE exchanges SET embedding_version = 0 WHERE id = ?").run(change.identity);
      } else {
        stagedDb.prepare("DELETE FROM vec_journal_entries WHERE id = ?").run(change.identity);
        stagedDb.prepare("UPDATE journal_entries SET embedding_version = 0 WHERE id = ?").run(change.identity);
      }
    }
    for (const change of plan.created) {
      if (change.family === "transcript") {
        stagedDb.prepare("DELETE FROM vec_exchanges WHERE id = ?").run(change.identity);
        stagedDb.prepare("UPDATE exchanges SET embedding_version = 0 WHERE id = ?").run(change.identity);
      } else {
        stagedDb.prepare("DELETE FROM vec_journal_entries WHERE id = ?").run(change.identity);
        stagedDb.prepare("UPDATE journal_entries SET embedding_version = 0 WHERE id = ?").run(change.identity);
      }
    }
  });
}

// src/rollback/prepare.ts
function hashFile(filePath) {
  const data = fs3.readFileSync(filePath);
  return crypto2.createHash("sha256").update(data).digest("hex");
}
function preflightChecks(options) {
  if (options.to !== "0.1.5") {
    throw new RollbackStateError(
      `only rollback to 0.1.5 is supported, got "${options.to}"`,
      "UNSUPPORTED_TARGET_VERSION"
    );
  }
  const nodeVersion = parseInt(process.versions.node, 10);
  if (nodeVersion < 24) {
    throw new RollbackStateError(
      `Node >= 24 required for rollback, got ${process.versions.node}`,
      "NODE_TOO_OLD"
    );
  }
  if (process.platform === "win32") {
    throw new RollbackStateError(
      "native Windows is not supported for rollback; use WSL2",
      "WINDOWS_UNSUPPORTED"
    );
  }
}
function findSnapshot(dbPath, fromVersion) {
  const sidecarPath = `${dbPath}.snapshot-v${fromVersion}.json`;
  if (!fs3.existsSync(sidecarPath)) {
    throw new RollbackStateError(
      `snapshot sidecar not found at ${sidecarPath} \u2014 run the v3 migration first`,
      "MISSING_SNAPSHOT"
    );
  }
  const sidecar = verifySnapshot(sidecarPath);
  return { sidecarPath, sidecar };
}
function copyStagedDatabase(snapshotPath, stagedPath) {
  if (fs3.existsSync(stagedPath)) {
    fs3.unlinkSync(stagedPath);
  }
  fs3.copyFileSync(snapshotPath, stagedPath);
}
function prepareRollback(options) {
  preflightChecks(options);
  const dataDir = options.dataDir ?? getMemoryDataDir();
  const dbPath = options.dbPath ?? getDbPath();
  const existing = readRollbackState(dataDir);
  if (existing) {
    if (existing.phase === "swapped") {
      return {
        phase: "swapped",
        activeDatabase: existing.stagedDatabase,
        retainedV3Database: existing.retainedV3Database,
        reconciliation: { created: [], modified: [], deleted: [], unchanged: [] }
      };
    }
    if (existing.phase === "fenced") {
      return performSwap(dataDir, dbPath, existing);
    }
  }
  let capsule;
  try {
    const capsuleOpts = {
      fromVersion: "0.1.5",
      platform: process.platform,
      arch: process.arch
    };
    if (options.catalogPath !== void 0) capsuleOpts.catalogPath = options.catalogPath;
    if (options.capsuleDir !== void 0) capsuleOpts.capsuleDir = options.capsuleDir;
    capsule = ensureRecoveryCapsule(capsuleOpts);
  } catch (err) {
    throw new RollbackStateError(
      `recovery capsule verification failed: ${err instanceof Error ? err.message : String(err)}`,
      "CAPSULE_VERIFICATION_FAILED"
    );
  }
  const { sidecar } = findSnapshot(dbPath, 2);
  const snapshotPath = `${dbPath}.snapshot-v2`;
  if (!fs3.existsSync(snapshotPath)) {
    throw new RollbackStateError(
      `snapshot database not found at ${snapshotPath}`,
      "MISSING_SNAPSHOT_DB"
    );
  }
  const legacyUsers = inspectLegacyDatabaseUsers(dbPath);
  const aliveLegacy = legacyUsers.filter((d) => d.alive);
  if (aliveLegacy.length > 0) {
    throw new RollbackStateError(
      `active database users detected (PIDs: ${aliveLegacy.map((d) => d.pid).join(", ")}); stop all MCP servers and sync processes first`,
      "DATABASE_IN_USE"
    );
  }
  const lease = acquireExclusiveMaintenanceLease(dbPath);
  try {
    const stagedDbName = `rollback-staged-${Date.now()}.db`;
    const stagedPath = path2.join(dataDir, stagedDbName);
    const retainedName = `retained-v3-${Date.now()}.db`;
    const dbIdentity = crypto2.createHash("sha256").update(`${dbPath}:${Date.now()}`).digest("hex").slice(0, 16);
    const snapshotHash = hashFile(snapshotPath);
    const capsuleManifestPath = path2.join(capsule.root, "manifest.json");
    const capsuleHash = hashFile(capsuleManifestPath);
    copyStagedDatabase(snapshotPath, stagedPath);
    const state = createRollbackState(dataDir, {
      phase: "staging",
      databaseId: dbIdentity,
      snapshotSha256: snapshotHash,
      capsuleSha256: capsuleHash,
      stagedDatabase: stagedDbName,
      retainedV3Database: retainedName
    });
    const currentSources = /* @__PURE__ */ new Map();
    for (const src of sidecar.sources) {
      if (fs3.existsSync(src.canonicalPath)) {
        currentSources.set(src.identity, {
          family: src.family,
          canonicalPath: src.canonicalPath
        });
      }
    }
    const reconciliation = planSourceReconciliation(sidecar, currentSources);
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
    advanceRollbackState(dataDir, "staging", "fenced");
    return performSwap(dataDir, dbPath, readRollbackState(dataDir), reconciliation);
  } finally {
    lease.release();
  }
}
function performSwap(dataDir, dbPath, state, reconciliation) {
  const stagedPath = path2.join(dataDir, state.stagedDatabase);
  const retainedPath = path2.join(dataDir, state.retainedV3Database);
  if (!fs3.existsSync(stagedPath)) {
    throw new RollbackStateError(`staged database missing at ${stagedPath}`, "MISSING_STAGED_DB");
  }
  if (fs3.existsSync(dbPath)) {
    fs3.renameSync(dbPath, retainedPath);
    for (const suffix of ["-wal", "-shm"]) {
      const walPath = dbPath + suffix;
      if (fs3.existsSync(walPath)) {
        fs3.renameSync(walPath, retainedPath + suffix);
      }
    }
  }
  fs3.renameSync(stagedPath, dbPath);
  advanceRollbackState(dataDir, "fenced", "swapped");
  return {
    phase: "swapped",
    activeDatabase: dbPath,
    retainedV3Database: retainedPath,
    reconciliation: reconciliation ?? { created: [], modified: [], deleted: [], unchanged: [] }
  };
}

// src/rollback-cli.ts
var HELP = `moe-memory rollback - manage rollback to a previous version

USAGE:
  moe-memory rollback <subcommand> [options]

SUBCOMMANDS:
  prepare --to <version>   Prepare a safe rollback (currently only 0.1.5)
  abort                    Abort a pending rollback (only before swap)
  status                   Show current rollback state

OPTIONS:
  --to <version>   Target version for rollback (required for prepare)
  --help, -h       Show this help message
`;
async function runRollback(args) {
  const subcommand = args[0];
  switch (subcommand) {
    case "prepare": {
      const toIndex = args.indexOf("--to");
      if (toIndex === -1 || toIndex + 1 >= args.length) {
        console.error("Error: --to <version> is required for rollback prepare");
        return 1;
      }
      const targetVersion = args[toIndex + 1];
      try {
        console.log(`Preparing rollback to ${targetVersion}...`);
        const result = prepareRollback({ to: targetVersion });
        console.log(`Rollback ${result.phase}.`);
        if (result.phase === "swapped") {
          console.log(`Active database: ${result.activeDatabase}`);
          console.log(`Retained v3 database: ${result.retainedV3Database}`);
          console.log(`
The database is now safe for the 0.1.5 runtime.`);
          console.log(`Downgrade the host plugin to complete the rollback.`);
        }
        return 0;
      } catch (error) {
        if (error instanceof RollbackStateError) {
          console.error(`Rollback error [${error.code}]: ${error.message}`);
        } else {
          console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
        }
        return 1;
      }
    }
    case "abort": {
      try {
        const result = abortRollback();
        console.log(result.message);
        return result.aborted ? 0 : 0;
      } catch (error) {
        if (error instanceof RollbackStateError) {
          console.error(`Abort error [${error.code}]: ${error.message}`);
        } else {
          console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
        }
        return 1;
      }
    }
    case "status": {
      const dataDir = getMemoryDataDir();
      const state = readRollbackState(dataDir);
      if (!state) {
        console.log("No rollback in progress.");
      } else {
        console.log(`Rollback state:`);
        console.log(`  Phase: ${state.phase}`);
        console.log(`  Database ID: ${state.databaseId}`);
        console.log(`  Staged database: ${state.stagedDatabase}`);
        console.log(`  Retained v3: ${state.retainedV3Database}`);
      }
      return 0;
    }
    case "--help":
    case "-h":
    case "help":
    case void 0:
      console.log(HELP);
      return 0;
    default:
      console.error(`Unknown rollback subcommand: ${subcommand}`);
      console.error("Try: moe-memory rollback --help");
      return 1;
  }
}
export {
  runRollback
};
