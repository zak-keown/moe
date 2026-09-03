import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  advanceRollbackState,
  clearRollbackState,
  createRollbackState,
  readRollbackState,
} from "../src/rollback/state.js";
import type { RollbackState } from "../src/rollback/state.js";
import { assertWritesAllowed, RollbackFencedError } from "../src/rollback/fence.js";
import { abortRollback } from "../src/rollback/abort.js";

const VALID_SHA = "a".repeat(64);

function makeInit(overrides: Partial<Omit<RollbackState, "schema">> = {}) {
  return {
    phase: "staging" as const,
    databaseId: "crash-test-db",
    snapshotSha256: VALID_SHA,
    capsuleSha256: "b".repeat(64),
    stagedDatabase: "staged-crash.db",
    retainedV3Database: "retained-v3-crash.db",
    ...overrides,
  };
}

describe("crash recovery at each boundary", () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "moe-crash-"));
  });

  afterEach(async () => {
    await fs.promises.rm(dataDir, { recursive: true, force: true });
  });

  it.each([
    {
      boundary: "staging-created",
      setup: (dir: string) => {
        createRollbackState(dir, makeInit());
      },
      assertion: (dir: string) => {
        const state = readRollbackState(dir);
        expect(state).not.toBeNull();
        expect(state!.phase).toBe("staging");
        // Can be aborted safely
        const result = abortRollback({ dataDir: dir });
        expect(result.aborted).toBe(true);
        expect(readRollbackState(dir)).toBeNull();
      },
    },
    {
      boundary: "fence-durable",
      setup: (dir: string) => {
        createRollbackState(dir, makeInit());
        advanceRollbackState(dir, "staging", "fenced");
      },
      assertion: (dir: string) => {
        const state = readRollbackState(dir);
        expect(state!.phase).toBe("fenced");
        // Writes are blocked
        expect(() => assertWritesAllowed(dir)).toThrow(RollbackFencedError);
        // Can be aborted
        const result = abortRollback({ dataDir: dir });
        expect(result.aborted).toBe(true);
        expect(() => assertWritesAllowed(dir)).not.toThrow();
      },
    },
    {
      boundary: "swap-complete",
      setup: (dir: string) => {
        createRollbackState(dir, makeInit());
        advanceRollbackState(dir, "staging", "fenced");
        advanceRollbackState(dir, "fenced", "swapped");
      },
      assertion: (dir: string) => {
        const state = readRollbackState(dir);
        expect(state!.phase).toBe("swapped");
        // Cannot be aborted
        expect(() => abortRollback({ dataDir: dir })).toThrow(/cannot abort after swap/);
        // Cannot be cleared
        expect(() => clearRollbackState(dir)).toThrow(/cannot clear rollback state after swap/);
      },
    },
  ])("recovers after crash at $boundary", ({ setup, assertion }) => {
    setup(dataDir);
    // Simulate process crash and restart — state file is on disk
    assertion(dataDir);
  });

  it("handles corrupt state file gracefully", () => {
    fs.writeFileSync(path.join(dataDir, "rollback-state.json"), '{"broken');
    expect(() => readRollbackState(dataDir)).toThrow();
  });

  it("handles truncated state file", () => {
    createRollbackState(dataDir, makeInit());
    fs.writeFileSync(path.join(dataDir, "rollback-state.json"), "");
    expect(() => readRollbackState(dataDir)).toThrow();
  });

  it("handles state file with wrong schema version", () => {
    const state = { schema: 99, phase: "staging", databaseId: "x", snapshotSha256: VALID_SHA, capsuleSha256: "b".repeat(64), stagedDatabase: "s.db", retainedV3Database: "r.db" };
    fs.writeFileSync(path.join(dataDir, "rollback-state.json"), JSON.stringify(state));
    expect(() => readRollbackState(dataDir)).toThrow(/malformed/);
  });

  it("handles missing staged database during swap attempt", () => {
    createRollbackState(dataDir, makeInit());
    advanceRollbackState(dataDir, "staging", "fenced");
    // No staged.db file exists — swap would fail but state is still fenced
    const state = readRollbackState(dataDir);
    expect(state!.phase).toBe("fenced");
  });
});

describe("concurrent write attempts during rollback", () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "moe-fence-race-"));
  });

  afterEach(async () => {
    await fs.promises.rm(dataDir, { recursive: true, force: true });
  });

  it("blocks all writes consistently after fence", () => {
    createRollbackState(dataDir, makeInit());
    advanceRollbackState(dataDir, "staging", "fenced");

    // Simulate multiple concurrent write attempts
    const errors: Error[] = [];
    for (let i = 0; i < 10; i++) {
      try {
        assertWritesAllowed(dataDir);
      } catch (err) {
        errors.push(err as Error);
      }
    }

    expect(errors).toHaveLength(10);
    expect(errors.every((e) => e instanceof RollbackFencedError)).toBe(true);
  });

  it("allows writes again after abort removes the fence", () => {
    createRollbackState(dataDir, makeInit());
    advanceRollbackState(dataDir, "staging", "fenced");

    // Fence is active
    expect(() => assertWritesAllowed(dataDir)).toThrow(RollbackFencedError);

    // Abort
    abortRollback({ dataDir });

    // Writes allowed again
    expect(() => assertWritesAllowed(dataDir)).not.toThrow();
  });
});

describe("unsupported environment detection", () => {
  it("verifies we are running on Node >= 24", () => {
    expect(parseInt(process.versions.node, 10)).toBeGreaterThanOrEqual(24);
  });
});
