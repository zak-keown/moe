/**
 * Child-process fixture for rollback concurrent-access tests.
 *
 * Usage:
 *   node rollback-worker.mjs hold-lease <dbPath> <durationMs>
 *   node rollback-worker.mjs create-state <dataDir>
 *   node rollback-worker.mjs check-fence <dataDir>
 *
 * Exits with code 0 on success, 1 on expected refusal, 2 on unexpected error.
 * Writes JSON to stdout: { ok, error?, phase? }
 */

import fs from "node:fs";
import path from "node:path";

const [, , command, ...args] = process.argv;

async function holdLease(dbPath, durationMs) {
  const { acquireExclusiveMaintenanceLease } = await import(
    "../../dist/database-lease.js"
  );
  try {
    const lease = acquireExclusiveMaintenanceLease(dbPath);
    process.stdout.write(
      JSON.stringify({ ok: true, epoch: lease.epoch }) + "\n",
    );
    await new Promise((resolve) => setTimeout(resolve, parseInt(durationMs, 10)));
    lease.release();
  } catch (err) {
    process.stdout.write(
      JSON.stringify({ ok: false, error: err.message }) + "\n",
    );
    process.exit(1);
  }
}

async function createState(dataDir) {
  const { createRollbackState } = await import(
    "../../dist/rollback/state.js"
  );
  try {
    createRollbackState(dataDir, {
      phase: "staging",
      databaseId: "worker-test",
      snapshotSha256: "a".repeat(64),
      capsuleSha256: "b".repeat(64),
      stagedDatabase: "staged-worker.db",
      retainedV3Database: "retained-worker.db",
    });
    process.stdout.write(JSON.stringify({ ok: true }) + "\n");
  } catch (err) {
    process.stdout.write(
      JSON.stringify({ ok: false, error: err.message }) + "\n",
    );
    process.exit(1);
  }
}

async function checkFence(dataDir) {
  const { assertWritesAllowed } = await import("../../dist/rollback/fence.js");
  try {
    assertWritesAllowed(dataDir);
    process.stdout.write(JSON.stringify({ ok: true, fenced: false }) + "\n");
  } catch (err) {
    if (err.name === "RollbackFencedError") {
      process.stdout.write(JSON.stringify({ ok: true, fenced: true }) + "\n");
    } else {
      process.stdout.write(
        JSON.stringify({ ok: false, error: err.message }) + "\n",
      );
      process.exit(2);
    }
  }
}

switch (command) {
  case "hold-lease":
    await holdLease(args[0], args[1]);
    break;
  case "create-state":
    await createState(args[0]);
    break;
  case "check-fence":
    await checkFence(args[0]);
    break;
  default:
    console.error(`Unknown command: ${command}`);
    process.exit(2);
}
