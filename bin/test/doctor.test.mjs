// Vitest coverage for the dependency-free doctor and installer entry points.

import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  allProbes,
  cmpVersion,
  extractTmuxVersion,
  extractVersion,
  overallExit,
} from "../lib/probes.mjs";

const BIN_DIR = fileURLToPath(new URL("..", import.meta.url));

function runBin(name, ...args) {
  return spawnSync(process.execPath, [join(BIN_DIR, name), ...args], { encoding: "utf8" });
}

describe("probes library", () => {
  it("cmpVersion orders semver-ish version strings numerically", () => {
    expect(cmpVersion("24.19.0", "24.0.0")).toBeGreaterThan(0);
    expect(cmpVersion("2.9.0", "2.10.0")).toBeLessThan(0);
    expect(cmpVersion("1.98.0", "1.98.0")).toBe(0);
  });

  it("extractVersion pulls the first N.N.N triple out of tool version output", () => {
    expect(extractVersion("v24.19.0")).toBe("24.19.0");
    expect(extractVersion("pnpm 11.23.0")).toBe("11.23.0");
    expect(extractVersion("cargo 1.98.0 (some hash 2024-01-01)")).toBe("1.98.0");
    expect(extractVersion(undefined)).toBeUndefined();
    expect(extractVersion("")).toBeUndefined();
  });

  it("extractTmuxVersion handles tmux's own version format, never a N.N.N triple", () => {
    // Real tmux -V output across releases: no release has ever shipped a
    // three-part version, so extractVersion's N.N.N-only regex always misses.
    expect(extractTmuxVersion("tmux 3.7c")).toBe("3.7");
    expect(extractTmuxVersion("tmux 3.4")).toBe("3.4");
    expect(extractTmuxVersion("tmux 3.3a")).toBe("3.3");
    expect(extractTmuxVersion("tmux 2.8")).toBe("2.8");
    expect(extractTmuxVersion(undefined)).toBeUndefined();
    expect(extractTmuxVersion("")).toBeUndefined();
  });

  it("allProbes returns typed results including node", () => {
    const results = allProbes();
    expect(results.length).toBeGreaterThanOrEqual(5);
    for (const result of results) {
      expect(typeof result.name).toBe("string");
      expect(["hard", "soft"]).toContain(result.tier);
      expect(typeof result.ok).toBe("boolean");
    }
    const node = results.find((result) => result.name === "node");
    expect(node).toBeDefined();
    expect(node.version).toBe(process.version.replace(/^v/, ""));
    expect(node.ok).toBe(cmpVersion(node.version, "24.0.0") >= 0);
  });

  it("overallExit is 0 iff every hard probe passes", () => {
    expect(
      overallExit([
        { tier: "hard", ok: true },
        { tier: "soft", ok: false },
      ]),
    ).toBe(0);
    expect(
      overallExit([
        { tier: "hard", ok: false },
        { tier: "soft", ok: true },
      ]),
    ).toBe(1);
    expect(overallExit([])).toBe(0);
  });
});

describe("moe-doctor and moe-install entry points", () => {
  it("moe-doctor --help exits 0 and mentions the two tiers", () => {
    const proc = runBin("moe-doctor", "--help");
    expect(proc.status, proc.stderr).toBe(0);
    expect(proc.stdout).toMatch(/moe-doctor/);
    expect(proc.stdout).toMatch(/HARD/);
  });

  it("moe-doctor --json emits parseable JSON with a results array", () => {
    const proc = runBin("moe-doctor", "--json");
    expect([0, 1], `unexpected exit ${proc.status}: ${proc.stderr}`).toContain(proc.status);
    const parsed = JSON.parse(proc.stdout);
    expect(Array.isArray(parsed.results)).toBe(true);
    expect(typeof parsed.platform).toBe("string");
  });

  it("moe-install --help documents apply and no migration surface", () => {
    const proc = runBin("moe-install", "--help");
    expect(proc.status, proc.stderr).toBe(0);
    expect(proc.stdout).toMatch(/--apply/);
    expect(proc.stdout).not.toMatch(/--migrate/);
  });

  it("moe-install with no flags prints a read-only install plan", () => {
    const proc = runBin("moe-install");
    expect(proc.status, proc.stderr).toBe(0);
    expect(proc.stdout).toMatch(/Plan \(dry-run/);
    expect(proc.stdout).toMatch(/claude plugin marketplace add/);
  });
});
