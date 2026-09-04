import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { suppressConsole } from "./test-utils.js";

const { runSync } = await import("../src/sync-cli.js");

const SIGNAL_EVENTS = ["exit", "SIGINT", "SIGTERM", "SIGHUP"] as const;

/**
 * CR-097: `runSync()` unconditionally added one listener each for "exit",
 * "SIGINT", "SIGTERM", and "SIGHUP" every time it ran, and never removed
 * them. Harmless for a one-shot CLI invocation (the process exits right
 * after), but `runSync` is an exported function, not a script entry point —
 * nothing stops it being called more than once inside a single process (a
 * test suite that calls it repeatedly, or any future in-process caller).
 * Each extra call was meant to add four more permanent listeners, eventually
 * tripping Node's MaxListenersExceededWarning.
 *
 * This calls the real `runSync` twice in-process (no subprocess spawn, no
 * mocking of the registration itself) with an empty project source
 * directory so the run completes in milliseconds with no network/model
 * access, and asserts the process's listener counts for all four events
 * return to their pre-call baseline after each run rather than growing.
 */
describe("CR-097: runSync does not leak process-level signal/exit listeners across calls", () => {
  let testDir: string;
  let restoreConsole: () => void;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "moe-memory-sync-signal-leak-"));
    mkdirSync(join(testDir, "projects"), { recursive: true });
    mkdirSync(join(testDir, "archive"), { recursive: true });
    mkdirSync(join(testDir, "config"), { recursive: true });

    process.env.TEST_PROJECTS_DIR = join(testDir, "projects");
    process.env.TEST_ARCHIVE_DIR = join(testDir, "archive");
    process.env.TEST_DB_PATH = join(testDir, "test.db");
    process.env.MOE_MEMORY_CONFIG_DIR = join(testDir, "config");
    delete process.env.MOE_MEMORY_SUMMARIZER_GUARD;

    restoreConsole = suppressConsole();
  });

  afterEach(() => {
    restoreConsole();
    delete process.env.TEST_PROJECTS_DIR;
    delete process.env.TEST_ARCHIVE_DIR;
    delete process.env.TEST_DB_PATH;
    delete process.env.MOE_MEMORY_CONFIG_DIR;
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {}
  });

  it("leaves listener counts at their pre-call baseline after one run, and does not grow them on a second run", async () => {
    const baseline = Object.fromEntries(
      SIGNAL_EVENTS.map((event) => [event, process.listenerCount(event)]),
    );

    const first = await runSync([]);
    expect(first).toBe(0);

    for (const event of SIGNAL_EVENTS) {
      expect(process.listenerCount(event)).toBe(baseline[event]);
    }

    const second = await runSync([]);
    expect(second).toBe(0);

    for (const event of SIGNAL_EVENTS) {
      expect(process.listenerCount(event)).toBe(baseline[event]);
    }
  });
});
