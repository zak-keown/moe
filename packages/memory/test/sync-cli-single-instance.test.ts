import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CLI = join(PACKAGE_ROOT, "dist", "cli.js");

interface RunResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

function runWith(env: Record<string, string>): RunResult {
  const result = spawnSync(process.execPath, [CLI, "sync"], {
    env: { ...process.env, ...env, MOE_MEMORY_SUMMARIZER_GUARD: undefined as any },
    timeout: 30_000,
    encoding: "utf-8",
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function spawnWith(env: Record<string, string>) {
  return spawn(process.execPath, [CLI, "sync"], {
    env: { ...process.env, ...env, MOE_MEMORY_SUMMARIZER_GUARD: undefined as any },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function collectOutput(child: ReturnType<typeof spawn>): Promise<RunResult> {
  let stdout = "";
  let stderr = "";
  child.stdout?.on("data", (d) => {
    stdout += d.toString();
  });
  child.stderr?.on("data", (d) => {
    stderr += d.toString();
  });
  const status: number | null = await new Promise((resolve) => {
    child.on("close", (code) => resolve(code));
  });
  return { status, stdout, stderr };
}

describe("sync-cli single-instance lock (#97)", () => {
  let testDir: string;
  let envOverrides: Record<string, string>;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "moe-memory-sync-lock-"));
    mkdirSync(join(testDir, "projects", "project-a"), { recursive: true });
    mkdirSync(join(testDir, "archive"), { recursive: true });
    mkdirSync(join(testDir, "config", "logs"), { recursive: true });

    // A single zero-exchange file gives each worker something to (try to) do
    // without making the test slow or network-dependent.
    writeFileSync(
      join(testDir, "projects", "project-a", "00000000-0000-0000-0000-000000000001.jsonl"),
      JSON.stringify({
        type: "file-history-snapshot",
        sessionId: "00000000-0000-0000-0000-000000000001",
        uuid: "meta-0",
        timestamp: "2026-01-01T00:00:00Z",
      }),
      "utf-8",
    );

    envOverrides = {
      TEST_PROJECTS_DIR: join(testDir, "projects"),
      TEST_ARCHIVE_DIR: join(testDir, "archive"),
      TEST_DB_PATH: join(testDir, "test.db"),
      MOE_MEMORY_CONFIG_DIR: join(testDir, "config"),
    };
  });

  afterEach(() => {
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {}
  });

  it('only one of two concurrent workers does real work; the other prints "sync already running" and exits 0', async () => {
    // Launch two workers as close together as possible. One will win the lock
    // race; the other must observe it and bail before initDatabase().
    const a = spawnWith(envOverrides);
    const b = spawnWith(envOverrides);
    const [ra, rb] = await Promise.all([collectOutput(a), collectOutput(b)]);

    expect(ra.status).toBe(0);
    expect(rb.status).toBe(0);

    const winner = ra.stdout.includes("Sync complete") ? ra : rb;
    const loser = winner === ra ? rb : ra;

    expect(winner.stdout).toMatch(/Sync complete/);
    expect(loser.stderr).toMatch(/sync already running.*skipping/);
    expect(loser.stdout).not.toMatch(/Sync complete/);
  });

  it("a single sequential run is unaffected by the lock — runs to completion as before", () => {
    const result = runWith(envOverrides);
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/Sync complete/);
  });

  it("releases the lock on normal exit — a subsequent run is not skipped", () => {
    const first = runWith(envOverrides);
    expect(first.status).toBe(0);
    expect(first.stdout).toMatch(/Sync complete/);

    // Lock file must not be left behind for the next run.
    const lockPath = join(testDir, "config", "logs", "moe-memory-sync.lock");
    expect(existsSync(lockPath)).toBe(false);

    const second = runWith(envOverrides);
    expect(second.status).toBe(0);
    expect(second.stdout).toMatch(/Sync complete/);
    expect(second.stderr).not.toMatch(/sync already running/);
  });

  it("steals a stale lock left by a crashed previous worker (PID 999999 is dead)", () => {
    const lockPath = join(testDir, "config", "logs", "moe-memory-sync.lock");
    writeFileSync(lockPath, "999999", "utf-8");

    const result = runWith(envOverrides);
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/Sync complete/);
    expect(result.stderr).not.toMatch(/sync already running/);

    // After completion, the lock file is gone.
    expect(existsSync(lockPath)).toBe(false);
  });
});
