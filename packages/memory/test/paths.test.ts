import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  JOURNAL_DIR_NAME,
  journalRoots,
  resetJournalEnvWarning,
  resolveJournalPath,
  resolveProjectJournalPath,
  resolveUserJournalPath,
} from "../src/paths.js";

/**
 * Ported from private-journal-mcp's tests/paths.test.ts. Converted from jest to
 * vitest, and three defects in the harness were fixed while porting:
 *
 * 1. `beforeEach` snapshotted `process.env` but never CLEARED the override, and
 *    the override returns before any other logic — so 8 of 13 tests failed on any
 *    machine that actually had this MCP server installed, which is exactly the
 *    population running them.
 * 2. `afterEach` did `process.env = originalEnv`, replacing Node's special env
 *    object with a plain one. That is a jest-ism and leaks across files in a
 *    shared worker.
 * 3. `jest.spyOn(process, 'cwd')` was never restored, because `restoreMocks` was
 *    not configured.
 *
 * `resolveUserJournalPath` changed meaning on the merge: the user-global journal
 * now lives under the Moe Memory data directory alongside the conversation
 * index, instead of `~/.private-journal`. The project journal is unchanged in
 * substance.
 */
describe("journal path resolution", () => {
  const SAVED = [
    "MOE_MEMORY_JOURNAL_PATH",
    "PRIVATE_JOURNAL_PATH",
    "MOE_MEMORY_CONFIG_DIR",
    "MOE_DATA_DIR",
    "XDG_CONFIG_HOME",
    "HOME",
    "USERPROFILE",
    "TEMP",
    "TMP",
  ] as const;
  const saved = new Map<string, string | undefined>();
  // getMemoryDataDir() mkdirs, so the data-dir cases get a real temp directory
  // rather than a made-up path.
  let dataDir: string;

  beforeEach(() => {
    for (const key of SAVED) {
      saved.set(key, process.env[key]);
      delete process.env[key];
    }
    resetJournalEnvWarning();
    dataDir = mkdtempSync(path.join(tmpdir(), "moe-memory-paths-"));
  });

  afterEach(() => {
    for (const key of SAVED) {
      const value = saved.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    vi.restoreAllMocks();
    try {
      rmSync(dataDir, { recursive: true, force: true });
    } catch {}
  });

  it("uses the project directory name renamed off the upstream brand token", () => {
    expect(JOURNAL_DIR_NAME).toBe(".moe-journal");
  });

  it("resolveJournalPath uses the current directory when reasonable", () => {
    const mockCwd = "/Users/test/projects/my-app";
    vi.spyOn(process, "cwd").mockReturnValue(mockCwd);

    expect(resolveJournalPath(JOURNAL_DIR_NAME, true)).toBe(path.join(mockCwd, JOURNAL_DIR_NAME));
  });

  it("resolveJournalPath skips system directories", () => {
    for (const systemPath of ["/", "C:\\", "/System", "/usr"]) {
      vi.spyOn(process, "cwd").mockReturnValue(systemPath);
      process.env.HOME = "/Users/test";

      expect(resolveJournalPath(JOURNAL_DIR_NAME, true)).toBe("/Users/test/.moe-journal");
    }
  });

  it("resolveJournalPath falls back to HOME when the current directory is excluded", () => {
    process.env.HOME = "/Users/test";

    expect(resolveJournalPath(JOURNAL_DIR_NAME, false)).toBe("/Users/test/.moe-journal");
  });

  it("resolveJournalPath uses USERPROFILE on Windows", () => {
    process.env.USERPROFILE = "C:\\Users\\test";

    expect(resolveJournalPath(JOURNAL_DIR_NAME, false)).toBe(
      path.join("C:\\Users\\test", JOURNAL_DIR_NAME),
    );
  });

  it("resolveJournalPath falls back to the temp directory", () => {
    // '/tmp' is hardcoded rather than os.tmpdir() — kept deliberately, since
    // modernising it would break this assertion on macOS where tmpdir is
    // /var/folders/... See docs/history/private-journal-mcp/.
    expect(resolveJournalPath(JOURNAL_DIR_NAME, false)).toBe("/tmp/.moe-journal");
  });

  it("resolveProjectJournalPath includes the current directory", () => {
    const mockCwd = "/Users/test/projects/my-app";
    vi.spyOn(process, "cwd").mockReturnValue(mockCwd);

    expect(resolveProjectJournalPath()).toBe(path.join(mockCwd, JOURNAL_DIR_NAME));
  });

  it("resolveUserJournalPath lives under the Moe Memory data directory, not the project", () => {
    const mockCwd = "/Users/test/projects/my-app";
    vi.spyOn(process, "cwd").mockReturnValue(mockCwd);
    process.env.MOE_MEMORY_CONFIG_DIR = dataDir;

    const userPath = resolveUserJournalPath();
    expect(userPath).toBe(path.join(dataDir, "journal"));
    expect(userPath).not.toContain("projects/my-app");
  });

  describe("MOE_MEMORY_JOURNAL_PATH override", () => {
    it("overrides resolveJournalPath", () => {
      process.env.MOE_MEMORY_JOURNAL_PATH = "/data/journals";
      process.env.HOME = "/Users/test";
      vi.spyOn(process, "cwd").mockReturnValue("/Users/test/projects/my-app");

      expect(resolveJournalPath(JOURNAL_DIR_NAME, true)).toBe("/data/journals");
    });

    it("overrides both the user and the project path", () => {
      process.env.MOE_MEMORY_JOURNAL_PATH = "/data/journals";
      process.env.HOME = "/Users/test";
      vi.spyOn(process, "cwd").mockReturnValue("/Users/test/projects/my-app");

      expect(resolveUserJournalPath()).toBe("/data/journals");
      expect(resolveProjectJournalPath()).toBe("/data/journals");
    });

    it("de-duplicates the roots when it collapses them", () => {
      // Upstream asserted only that the two paths were identical. It then loaded
      // that one directory TWICE — once labelled project, once user — so every
      // entry appeared twice with contradictory labels and `limit: 10` yielded 5
      // unique entries. This is the documented containerised configuration.
      process.env.MOE_MEMORY_JOURNAL_PATH = "/container/journal-data";
      vi.spyOn(process, "cwd").mockReturnValue("/Users/test/projects/my-app");

      expect(journalRoots()).toEqual(["/container/journal-data"]);
    });

    it("ignores the subdirectory parameter", () => {
      process.env.MOE_MEMORY_JOURNAL_PATH = "/data/journals";

      expect(resolveJournalPath(".some-other-name", true)).toBe("/data/journals");
    });
  });

  describe("PRIVATE_JOURNAL_PATH, the upstream name", () => {
    it("is still honoured, because an unset override degrades silently rather than erroring", () => {
      process.env.PRIVATE_JOURNAL_PATH = "/legacy/journals";
      const warn = vi.spyOn(console, "error").mockImplementation(() => {});

      expect(resolveJournalPath(JOURNAL_DIR_NAME, true)).toBe("/legacy/journals");
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("PRIVATE_JOURNAL_PATH"));
    });

    it("loses to MOE_MEMORY_JOURNAL_PATH when both are set", () => {
      process.env.PRIVATE_JOURNAL_PATH = "/legacy/journals";
      process.env.MOE_MEMORY_JOURNAL_PATH = "/new/journals";

      expect(resolveJournalPath(JOURNAL_DIR_NAME, true)).toBe("/new/journals");
    });

    it("warns once, not on every resolution", () => {
      process.env.PRIVATE_JOURNAL_PATH = "/legacy/journals";
      const warn = vi.spyOn(console, "error").mockImplementation(() => {});

      resolveJournalPath();
      resolveJournalPath();
      resolveJournalPath();

      expect(warn).toHaveBeenCalledTimes(1);
    });
  });

  it("journalRoots returns both roots when they differ", () => {
    process.env.MOE_MEMORY_CONFIG_DIR = dataDir;
    vi.spyOn(process, "cwd").mockReturnValue("/Users/test/projects/my-app");

    const roots = journalRoots();
    expect(roots).toHaveLength(2);
    expect(roots[0]).toBe("/Users/test/projects/my-app/.moe-journal");
    expect(roots[1]).toBe(path.join(dataDir, "journal"));
  });
});
