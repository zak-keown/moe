import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { MemoryDatabase } from "../src/db.js";
import { insertExchange } from "../src/db.js";
import { abortRollback } from "../src/rollback/abort.js";
import { prepareRollback } from "../src/rollback/prepare.js";
import {
  advanceRollbackState,
  createRollbackState,
  RollbackStateError,
  readRollbackState,
} from "../src/rollback/state.js";
import { fakeEmbed, openTestDatabase } from "./test-utils.js";

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

describe("rollback prepare preflight", () => {
  it("rejects unsupported target version", () => {
    expect(() => prepareRollback({ to: "0.1.4" })).toThrow(/only rollback to 0.1.5 is supported/);
  });

  it("rejects native Windows", () => {
    const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform");
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });
    try {
      expect(() => prepareRollback({ to: "0.1.5" })).toThrow(/native Windows/);
    } finally {
      if (originalPlatform) {
        Object.defineProperty(process, "platform", originalPlatform);
      }
    }
  });
});

describe("rollback abort", () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "moe-rollback-abort-"));
  });

  afterEach(async () => {
    await fs.promises.rm(dataDir, { recursive: true, force: true });
  });

  it("returns not-in-progress when no state exists", () => {
    const result = abortRollback({ dataDir });
    expect(result.aborted).toBe(false);
    expect(result.message).toContain("no rollback in progress");
  });

  it("aborts from staging phase and cleans up staged file", () => {
    const stagedPath = path.join(dataDir, "staged.db");
    fs.writeFileSync(stagedPath, "staged-data");
    createRollbackState(dataDir, makeInit());

    const result = abortRollback({ dataDir });
    expect(result.aborted).toBe(true);
    expect(readRollbackState(dataDir)).toBeNull();
    expect(fs.existsSync(stagedPath)).toBe(false);
  });

  it("aborts from fenced phase", () => {
    const stagedPath = path.join(dataDir, "staged.db");
    fs.writeFileSync(stagedPath, "staged-data");
    createRollbackState(dataDir, makeInit());
    advanceRollbackState(dataDir, "staging", "fenced");

    const result = abortRollback({ dataDir });
    expect(result.aborted).toBe(true);
    expect(readRollbackState(dataDir)).toBeNull();
  });

  it("refuses to abort after swap", () => {
    createRollbackState(dataDir, makeInit());
    advanceRollbackState(dataDir, "staging", "fenced");
    advanceRollbackState(dataDir, "fenced", "swapped");

    expect(() => abortRollback({ dataDir })).toThrow(/cannot abort after swap/);
  });
});

describe("rollback prepare with staged database", () => {
  let dataDir: string;
  let db: MemoryDatabase;
  const embed = fakeEmbed();

  beforeEach(async () => {
    dataDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "moe-rollback-prepare-"));
    process.env.MOE_MEMORY_CONFIG_DIR = dataDir;

    const dbPath = path.join(dataDir, "conversation-index", "db.sqlite");
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    db = openTestDatabase(dbPath);

    insertExchange(
      db,
      {
        id: "e-1",
        project: "test",
        timestamp: new Date().toISOString(),
        userMessage: "hello",
        assistantMessage: "world",
        archivePath: "/test.jsonl",
        lineStart: 1,
        lineEnd: 10,
      },
      await embed("hello world"),
    );
  });

  afterEach(async () => {
    db.close();
    delete process.env.MOE_MEMORY_CONFIG_DIR;
    await fs.promises.rm(dataDir, { recursive: true, force: true });
  });

  it("returns resume result when rollback already swapped", () => {
    createRollbackState(dataDir, makeInit());
    advanceRollbackState(dataDir, "staging", "fenced");
    advanceRollbackState(dataDir, "fenced", "swapped");

    const result = prepareRollback({ to: "0.1.5", dataDir });
    expect(result.phase).toBe("swapped");
  });
});

describe("rollback CLI integration", () => {
  it("rollback status shows no rollback when clean", async () => {
    const { runRollback } = await import("../src/rollback-cli.js");
    const originalLog = console.log;
    const logs: string[] = [];
    console.log = (...args: unknown[]) => logs.push(args.join(" "));
    try {
      const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "moe-rollback-cli-"));
      process.env.MOE_MEMORY_CONFIG_DIR = tmpDir;
      const code = await runRollback(["status"]);
      expect(code).toBe(0);
      expect(logs.some((l) => l.includes("No rollback in progress"))).toBe(true);
      delete process.env.MOE_MEMORY_CONFIG_DIR;
      await fs.promises.rm(tmpDir, { recursive: true, force: true });
    } finally {
      console.log = originalLog;
    }
  });

  it("rollback help returns 0", async () => {
    const { runRollback } = await import("../src/rollback-cli.js");
    const code = await runRollback(["--help"]);
    expect(code).toBe(0);
  });

  it("rollback prepare requires --to", async () => {
    const { runRollback } = await import("../src/rollback-cli.js");
    const originalError = console.error;
    console.error = () => {};
    try {
      const code = await runRollback(["prepare"]);
      expect(code).toBe(1);
    } finally {
      console.error = originalError;
    }
  });
});
