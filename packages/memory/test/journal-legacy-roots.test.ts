/**
 * Legacy journal-root discovery.
 *
 * The bug this pins: `moe-memory journal import-legacy` walked
 * `store.roots()` — the NEW journal directories — looking for
 * private-journal-mcp's `.embedding` sidecars. But the whole reason the command
 * exists is that the paths moved:
 *
 *   project  <project>/.private-journal  →  <project>/.moe-journal
 *   user     ~/.private-journal          →  <data dir>/journal
 *
 * So on any install that had not already hand-copied its journal across, the
 * importer looked only where the sidecars provably are not, found zero, and
 * printed "Legacy .embedding sidecars found: 0". That reads as "you have
 * nothing to import" when the truth is "I did not look where your data is".
 *
 * The fix is discovery plus reporting, not a silent migration: this fork
 * deliberately announces the data-directory reset rather than moving
 * multi-gigabyte trees behind the user's back (see `findLegacyDataDir`).
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { findLegacyJournalRoots, LEGACY_JOURNAL_DIR_NAME } from "../src/paths.js";

const SAVED = { ...process.env };
let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "moe-legacy-journal-"));
  for (const key of [
    "MOE_MEMORY_JOURNAL_PATH",
    "PRIVATE_JOURNAL_PATH",
    "MOE_MEMORY_CONFIG_DIR",
    "MOE_DATA_DIR",
    "XDG_CONFIG_HOME",
  ]) {
    delete process.env[key];
  }
});

afterEach(() => {
  vi.restoreAllMocks();
  process.env = { ...SAVED };
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("findLegacyJournalRoots", () => {
  it("names the upstream directory it looks for", () => {
    expect(LEGACY_JOURNAL_DIR_NAME).toBe(".private-journal");
  });

  it("returns nothing when no upstream journal exists", () => {
    const project = path.join(tmp, "project");
    fs.mkdirSync(project, { recursive: true });
    process.env.HOME = path.join(tmp, "home");
    fs.mkdirSync(process.env.HOME, { recursive: true });
    vi.spyOn(process, "cwd").mockReturnValue(project);

    expect(findLegacyJournalRoots()).toEqual([]);
  });

  it("finds an upstream PROJECT journal beside the current directory", () => {
    const project = path.join(tmp, "project");
    const legacy = path.join(project, LEGACY_JOURNAL_DIR_NAME);
    fs.mkdirSync(legacy, { recursive: true });
    process.env.HOME = path.join(tmp, "home");
    fs.mkdirSync(process.env.HOME, { recursive: true });
    vi.spyOn(process, "cwd").mockReturnValue(project);

    expect(findLegacyJournalRoots()).toEqual([legacy]);
  });

  it("finds an upstream USER journal under HOME", () => {
    const project = path.join(tmp, "project");
    fs.mkdirSync(project, { recursive: true });
    const home = path.join(tmp, "home");
    const legacy = path.join(home, LEGACY_JOURNAL_DIR_NAME);
    fs.mkdirSync(legacy, { recursive: true });
    process.env.HOME = home;
    vi.spyOn(process, "cwd").mockReturnValue(project);

    expect(findLegacyJournalRoots()).toEqual([legacy]);
  });

  it("finds both, project first, and never duplicates", () => {
    const project = path.join(tmp, "project");
    const projectLegacy = path.join(project, LEGACY_JOURNAL_DIR_NAME);
    const home = path.join(tmp, "home");
    const homeLegacy = path.join(home, LEGACY_JOURNAL_DIR_NAME);
    fs.mkdirSync(projectLegacy, { recursive: true });
    fs.mkdirSync(homeLegacy, { recursive: true });
    process.env.HOME = home;
    vi.spyOn(process, "cwd").mockReturnValue(project);

    expect(findLegacyJournalRoots()).toEqual([projectLegacy, homeLegacy]);
  });

  it("does NOT report a legacy root that is already a current root", () => {
    // The `PRIVATE_JOURNAL_PATH` case: the override points at the upstream
    // directory, so the normal walk already covers it and there is nothing to
    // announce. Reporting it would tell the user to copy a directory onto
    // itself.
    const home = path.join(tmp, "home");
    const legacy = path.join(home, LEGACY_JOURNAL_DIR_NAME);
    fs.mkdirSync(legacy, { recursive: true });
    process.env.HOME = home;
    process.env.MOE_MEMORY_JOURNAL_PATH = legacy;
    vi.spyOn(process, "cwd").mockReturnValue(path.join(tmp, "project"));

    expect(findLegacyJournalRoots()).toEqual([]);
  });

  it("ignores a legacy path that exists but is a file", () => {
    const project = path.join(tmp, "project");
    fs.mkdirSync(project, { recursive: true });
    fs.writeFileSync(path.join(project, LEGACY_JOURNAL_DIR_NAME), "not a directory");
    process.env.HOME = path.join(tmp, "home");
    fs.mkdirSync(process.env.HOME, { recursive: true });
    vi.spyOn(process, "cwd").mockReturnValue(project);

    expect(findLegacyJournalRoots()).toEqual([]);
  });
});
