import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { MemoryDatabase } from "../src/db.js";
import { insertExchange, upsertJournalEntry } from "../src/db.js";
import { commitEnrichment } from "../src/enrichment.js";
import { assertWritesAllowed, RollbackFencedError } from "../src/rollback/fence.js";
import {
  advanceRollbackState,
  clearRollbackState,
  createRollbackState,
  RollbackStateError,
  readRollbackState,
} from "../src/rollback/state.js";
import { openTestDatabase } from "./test-utils.js";

const VALID_SHA = "a".repeat(64);

function makeInit() {
  return {
    phase: "staging" as const,
    databaseId: "test-db-001",
    snapshotSha256: VALID_SHA,
    capsuleSha256: "b".repeat(64),
    stagedDatabase: "staged.db",
    retainedV3Database: "retained-v3.db",
  };
}

describe("rollback state machine", () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "moe-rollback-state-"));
  });

  afterEach(async () => {
    await fs.promises.rm(dataDir, { recursive: true, force: true });
  });

  it("reads null when no state exists", () => {
    expect(readRollbackState(dataDir)).toBeNull();
  });

  it("creates state in staging phase", () => {
    const state = createRollbackState(dataDir, makeInit());
    expect(state.schema).toBe(1);
    expect(state.phase).toBe("staging");
    expect(state.databaseId).toBe("test-db-001");

    const read = readRollbackState(dataDir);
    expect(read).toEqual(state);
  });

  it("rejects creating state when one already exists", () => {
    createRollbackState(dataDir, makeInit());
    expect(() => createRollbackState(dataDir, makeInit())).toThrow(RollbackStateError);
  });

  it("rejects non-staging initial phase", () => {
    expect(() => createRollbackState(dataDir, { ...makeInit(), phase: "fenced" as any })).toThrow(
      /initial rollback state must be "staging"/,
    );
  });

  it("advances staging -> fenced", () => {
    createRollbackState(dataDir, makeInit());
    const updated = advanceRollbackState(dataDir, "staging", "fenced");
    expect(updated.phase).toBe("fenced");
    expect(readRollbackState(dataDir)!.phase).toBe("fenced");
  });

  it("advances fenced -> swapped", () => {
    createRollbackState(dataDir, makeInit());
    advanceRollbackState(dataDir, "staging", "fenced");
    const updated = advanceRollbackState(dataDir, "fenced", "swapped");
    expect(updated.phase).toBe("swapped");
  });

  it("rejects skipping phases", () => {
    createRollbackState(dataDir, makeInit());
    expect(() => advanceRollbackState(dataDir, "staging", "swapped")).toThrow(/invalid transition/);
  });

  it("rejects backward transitions", () => {
    createRollbackState(dataDir, makeInit());
    advanceRollbackState(dataDir, "staging", "fenced");
    expect(() => advanceRollbackState(dataDir, "fenced", "staging" as any)).toThrow(
      /invalid transition/,
    );
  });

  it("rejects phase mismatch", () => {
    createRollbackState(dataDir, makeInit());
    expect(() => advanceRollbackState(dataDir, "fenced", "swapped")).toThrow(
      /expected phase "fenced", got "staging"/,
    );
  });

  it("rejects advance with no state", () => {
    expect(() => advanceRollbackState(dataDir, "staging", "fenced")).toThrow(
      /no rollback state exists/,
    );
  });

  it("clears pre-swap state", () => {
    createRollbackState(dataDir, makeInit());
    clearRollbackState(dataDir);
    expect(readRollbackState(dataDir)).toBeNull();
  });

  it("clears fenced state (abort)", () => {
    createRollbackState(dataDir, makeInit());
    advanceRollbackState(dataDir, "staging", "fenced");
    clearRollbackState(dataDir);
    expect(readRollbackState(dataDir)).toBeNull();
  });

  it("refuses to clear after swap", () => {
    createRollbackState(dataDir, makeInit());
    advanceRollbackState(dataDir, "staging", "fenced");
    advanceRollbackState(dataDir, "fenced", "swapped");
    expect(() => clearRollbackState(dataDir)).toThrow(/cannot clear rollback state after swap/);
  });

  it("is idempotent on clearing when no state exists", () => {
    expect(() => clearRollbackState(dataDir)).not.toThrow();
  });

  it("rejects invalid sha256 lengths", () => {
    expect(() =>
      createRollbackState(dataDir, {
        ...makeInit(),
        snapshotSha256: "short",
      }),
    ).toThrow(RollbackStateError);
  });

  it("rejects absolute paths in stagedDatabase", () => {
    expect(() =>
      createRollbackState(dataDir, {
        ...makeInit(),
        stagedDatabase: "/tmp/evil.db",
      }),
    ).toThrow(RollbackStateError);
  });

  it("rejects path escapes in retainedV3Database", () => {
    expect(() =>
      createRollbackState(dataDir, {
        ...makeInit(),
        retainedV3Database: "../../etc/passwd",
      }),
    ).toThrow(RollbackStateError);
  });

  it("rejects malformed JSON on disk", () => {
    fs.writeFileSync(path.join(dataDir, "rollback-state.json"), "not-json");
    expect(() => readRollbackState(dataDir)).toThrow();
  });
});

describe("rollback fence", () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "moe-rollback-fence-"));
  });

  afterEach(async () => {
    await fs.promises.rm(dataDir, { recursive: true, force: true });
  });

  it("allows writes when no rollback state exists", () => {
    expect(() => assertWritesAllowed(dataDir)).not.toThrow();
  });

  it("allows writes during staging phase", () => {
    createRollbackState(dataDir, makeInit());
    expect(() => assertWritesAllowed(dataDir)).not.toThrow();
  });

  it("blocks writes after fenced transition", () => {
    createRollbackState(dataDir, makeInit());
    advanceRollbackState(dataDir, "staging", "fenced");
    expect(() => assertWritesAllowed(dataDir)).toThrow(RollbackFencedError);
  });

  it("allows writes after fence is cleared (abort)", () => {
    createRollbackState(dataDir, makeInit());
    advanceRollbackState(dataDir, "staging", "fenced");
    clearRollbackState(dataDir);
    expect(() => assertWritesAllowed(dataDir)).not.toThrow();
  });
});

describe("fence blocks database write paths", () => {
  let dataDir: string;
  let db: MemoryDatabase;

  beforeEach(async () => {
    dataDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "moe-rollback-writes-"));
    process.env.MOE_MEMORY_CONFIG_DIR = dataDir;
    db = openTestDatabase(path.join(dataDir, "test.db"));
    createRollbackState(dataDir, makeInit());
    advanceRollbackState(dataDir, "staging", "fenced");
  });

  afterEach(async () => {
    db.close();
    delete process.env.MOE_MEMORY_CONFIG_DIR;
    await fs.promises.rm(dataDir, { recursive: true, force: true });
  });

  it("blocks insertExchange", () => {
    const exchange = {
      id: "test-1",
      project: "test",
      timestamp: new Date().toISOString(),
      userMessage: "hello",
      assistantMessage: "world",
      archivePath: "/tmp/test.jsonl",
      lineStart: 1,
      lineEnd: 10,
    };
    expect(() => insertExchange(db, exchange, [1, 2, 3])).toThrow(/rollback is prepared/);
  });

  it("blocks upsertJournalEntry", () => {
    const entry = {
      id: "j-1",
      path: "/tmp/test.md",
      root: "/tmp",
      scope: "user" as const,
      timestamp: Date.now(),
      text: "test",
      sections: ["test"],
    };
    expect(() => upsertJournalEntry(db, entry, Date.now(), [1, 2, 3])).toThrow(
      /rollback is prepared/,
    );
  });

  it("blocks commitEnrichment", () => {
    expect(() =>
      commitEnrichment(
        db,
        { family: "exchange", id: "e-1", sourceText: "test", epoch: 0 },
        new Float32Array(384),
      ),
    ).toThrow(/rollback is prepared/);
  });
});
