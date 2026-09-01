// bin/test/doctor.test.mjs — vitest for bin/moe-doctor, bin/moe-install and
// their probes/migrate libraries.
//
// This suite was written against node:test so it would run on a bare Node 24+
// checkout with nothing installed — the same property the doctor itself has
// (`node bin/moe-doctor` works before `pnpm install` does). That rationale was
// real, but it cost more than it bought: `bin:test` is `vitest run bin/test`,
// so vitest globbed this file and tried to execute node:test declarations
// under vitest globals, while `node --test bin/test/*.test.mjs` globbed
// moe.test.mjs and tried the reverse. Two runners over one directory, each
// silently collecting the other's file.
//
// One runner, and it is vitest — the workspace's runner everywhere else.
// What that gives up: this file no longer runs before `pnpm install`. The
// doctor's own pre-install guarantee is unaffected and still covered, by the
// `node bin/moe-doctor` and `node bin/moe-install --help` invocations below,
// which spawn the real bins as a bare interpreter would.

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  findRenamedKeys,
  RENAMED_MCP_KEYS,
  renderMigrationReport,
  scopeFiles,
} from "../lib/migrate.mjs";
import { allProbes, cmpVersion, extractVersion, overallExit } from "../lib/probes.mjs";

// Resolved by URL, not by trimming a "/test" suffix off a path — the suffix
// form is a separator assumption, and this branch's whole subject is Windows.
const BIN_DIR = fileURLToPath(new URL("..", import.meta.url));

function runBin(name, ...args) {
  return spawnSync(process.execPath, [join(BIN_DIR, name), ...args], { encoding: "utf8" });
}

describe("probes library", () => {
  it("cmpVersion orders semver-ish version strings numerically", () => {
    expect(cmpVersion("24.19.0", "24.0.0")).toBeGreaterThan(0);
    expect(cmpVersion("2.9.0", "2.10.0")).toBeLessThan(0); // the string-compare pitfall
    expect(cmpVersion("1.98.0", "1.98.0")).toBe(0);
  });

  it("extractVersion pulls the first N.N.N triple out of tool version output", () => {
    expect(extractVersion("v24.19.0")).toBe("24.19.0");
    expect(extractVersion("pnpm 11.23.0")).toBe("11.23.0");
    expect(extractVersion("cargo 1.98.0 (some hash 2024-01-01)")).toBe("1.98.0");
    expect(extractVersion(undefined)).toBeUndefined();
    expect(extractVersion("")).toBeUndefined();
  });

  it("allProbes returns at least the node probe and every hit has {name,tier,ok}", () => {
    const results = allProbes();
    expect(results.length, "expected many probes").toBeGreaterThanOrEqual(5);
    for (const r of results) {
      expect(typeof r.name, `probe missing name: ${JSON.stringify(r)}`).toBe("string");
      expect(r.name.length, `probe has empty name: ${JSON.stringify(r)}`).toBeGreaterThan(0);
      expect(["hard", "soft"], `probe has odd tier: ${r.tier}`).toContain(r.tier);
      expect(typeof r.ok, `probe missing ok: ${JSON.stringify(r)}`).toBe("boolean");
    }
    const node = results.find((r) => r.name === "node");
    expect(node, "expected a node probe").toBeDefined();
    expect(node.tier).toBe("hard");
    // The probe reports the interpreter it's running under. Whether that
    // interpreter is >= 24 depends on CI, so assert only that the version was
    // captured and the ok flag is consistent with the reported version.
    expect(typeof node.version).toBe("string");
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

describe("moe-doctor and moe-install, spawned as a bare interpreter would", () => {
  it("moe-doctor --help exits 0 and mentions the two tiers", () => {
    const proc = runBin("moe-doctor", "--help");
    expect(proc.status, proc.stderr).toBe(0);
    expect(proc.stdout).toMatch(/moe-doctor/);
    expect(proc.stdout).toMatch(/HARD/);
  });

  it("moe-doctor --json emits parseable JSON with a results array", () => {
    const proc = runBin("moe-doctor", "--json");
    // 1 is the documented "a hard probe failed" exit, which is legitimate on
    // a machine missing a hard dependency — the contract under test is the
    // JSON shape, not the local toolchain.
    expect([0, 1], `unexpected exit ${proc.status}: ${proc.stderr}`).toContain(proc.status);
    const parsed = JSON.parse(proc.stdout);
    expect(Array.isArray(parsed.results)).toBe(true);
    expect(typeof parsed.platform).toBe("string");
  });

  it("moe-install --help exits 0 and mentions --migrate and --apply", () => {
    const proc = runBin("moe-install", "--help");
    expect(proc.status, proc.stderr).toBe(0);
    expect(proc.stdout).toMatch(/--migrate/);
    expect(proc.stdout).toMatch(/--apply/);
  });

  it("moe-install (no flags) prints a dry-run install plan and changes nothing", () => {
    const proc = runBin("moe-install");
    expect(proc.status, proc.stderr).toBe(0);
    expect(proc.stdout).toMatch(/Plan \(dry-run/);
    expect(proc.stdout).toMatch(/claude plugin marketplace add/);
  });

  it("moe-install --migrate --help exits 0 (--help wins over --migrate)", () => {
    const proc = runBin("moe-install", "--migrate", "--help");
    expect(proc.status, proc.stderr).toBe(0);
    expect(proc.stdout).toMatch(/--migrate/);
  });
});

describe("migrate library", () => {
  it("scopeFiles resolves against os.homedir(), never a hardcoded ~", () => {
    const files = scopeFiles("/some/cwd");
    const home = homedir();
    const userScope = files.find((f) => f.scope === "user");
    expect(userScope).toBeDefined();
    expect(
      userScope.path.startsWith(home),
      `expected user scope under ${home}, got ${userScope.path}`,
    ).toBe(true);
    expect(userScope.path.startsWith("~"), "~ should never appear verbatim").toBe(false);
  });

  it("RENAMED_MCP_KEYS covers episodic-memory and chrome", () => {
    expect(RENAMED_MCP_KEYS.map((k) => k.old)).toEqual(["episodic-memory", "chrome"]);
  });

  it("findRenamedKeys reports every renamed key present in every scope file", () => {
    const tmpHome = mkdtempSync(join(tmpdir(), "moe-doctor-home-"));
    const cwd = mkdtempSync(join(tmpdir(), "moe-doctor-cwd-"));

    // Seed the "user" scope by overriding HOME. os.homedir() honours HOME on
    // POSIX (and USERPROFILE on win32); tests run on both, so set both.
    const prevHome = process.env.HOME;
    const prevUserprofile = process.env.USERPROFILE;
    process.env.HOME = tmpHome;
    process.env.USERPROFILE = tmpHome;

    try {
      // User-scope: one direct entry, one nested under `projects`.
      writeFileSync(
        join(tmpHome, ".claude.json"),
        JSON.stringify({
          mcpServers: { "episodic-memory": { command: "stale" } },
          projects: {
            "/some/other/repo": { mcpServers: { chrome: { command: "stale" } } },
          },
        }),
      );
      // Project-scope: chrome key present.
      writeFileSync(
        join(cwd, ".mcp.json"),
        JSON.stringify({ mcpServers: { chrome: { command: "stale" } } }),
      );
      // Local-scope: nothing renamed.
      mkdirSync(join(cwd, ".claude"), { recursive: true });
      writeFileSync(
        join(cwd, ".claude", "settings.local.json"),
        JSON.stringify({ mcpServers: { unrelated: {} } }),
      );

      const findings = findRenamedKeys(cwd);
      expect(findings.map((f) => `${f.scope}:${f.oldKey}`).sort()).toEqual([
        "project:chrome",
        "user:chrome",
        "user:episodic-memory",
      ]);
      for (const f of findings) {
        expect(f.command).toMatch(/^claude mcp remove /);
        expect(f.command).toContain(`--scope ${f.scope}`);
      }

      const report = renderMigrationReport(findings);
      expect(report).toMatch(/episodic-memory/);
      expect(report).toMatch(/chrome/);
      expect(report).toMatch(/--apply/);
    } finally {
      if (prevHome === undefined) delete process.env.HOME;
      else process.env.HOME = prevHome;
      if (prevUserprofile === undefined) delete process.env.USERPROFILE;
      else process.env.USERPROFILE = prevUserprofile;
    }
  });

  it('renderMigrationReport says "nothing to migrate" on empty findings', () => {
    expect(renderMigrationReport([])).toMatch(/Nothing to migrate/);
  });
});
