// Smoke test for bin/moe-doctor and its probes/migrate libraries.
//
// Uses node:test rather than vitest so this test runs against any Node 24+
// without pnpm ever having installed anything. That is the same shape the
// doctor itself has: `node bin/moe-doctor` works on a clean checkout, and so
// does `node --test bin/test/doctor.test.mjs`.
//
// The root `pnpm test` script chains `node --test bin/test/**/*.test.mjs`
// after `turbo run test`, so this suite runs alongside the workspace tests
// — that's the whole point of putting it under a `--test`-discoverable
// glob rather than a package's vitest tree.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  findRenamedKeys,
  RENAMED_MCP_KEYS,
  renderMigrationReport,
  scopeFiles,
} from "../lib/migrate.mjs";
import { allProbes, cmpVersion, extractVersion, overallExit } from "../lib/probes.mjs";

const BIN_DIR = dirname(fileURLToPath(import.meta.url)).replace(/\/test$/, "");

test("cmpVersion orders semver-ish version strings numerically", () => {
  assert.equal(cmpVersion("24.19.0", "24.0.0") > 0, true);
  assert.equal(cmpVersion("2.9.0", "2.10.0") < 0, true); // the string-compare pitfall
  assert.equal(cmpVersion("1.98.0", "1.98.0"), 0);
});

test("extractVersion pulls the first N.N.N triple out of tool version output", () => {
  assert.equal(extractVersion("v24.19.0"), "24.19.0");
  assert.equal(extractVersion("pnpm 11.23.0"), "11.23.0");
  assert.equal(extractVersion("cargo 1.98.0 (some hash 2024-01-01)"), "1.98.0");
  assert.equal(extractVersion(undefined), undefined);
  assert.equal(extractVersion(""), undefined);
});

test("allProbes returns at least the node probe and every hit has {name,tier,ok}", () => {
  const results = allProbes();
  assert.ok(results.length >= 5, `expected many probes, got ${results.length}`);
  for (const r of results) {
    assert.ok(
      typeof r.name === "string" && r.name.length > 0,
      `probe missing name: ${JSON.stringify(r)}`,
    );
    assert.ok(r.tier === "hard" || r.tier === "soft", `probe has odd tier: ${r.tier}`);
    assert.ok(typeof r.ok === "boolean", `probe missing ok: ${JSON.stringify(r)}`);
  }
  const node = results.find((r) => r.name === "node");
  assert.ok(node, "expected a node probe");
  assert.equal(node.tier, "hard");
  // The probe reports the interpreter it's running under. Whether that
  // interpreter is >= 24 depends on CI, so assert only that the version was
  // captured and the ok flag is consistent with the reported version.
  assert.equal(typeof node.version, "string");
  assert.equal(node.version, process.version.replace(/^v/, ""));
  const wantOk = cmpVersion(node.version, "24.0.0") >= 0;
  assert.equal(node.ok, wantOk);
});

test("overallExit is 0 iff every hard probe passes", () => {
  assert.equal(
    overallExit([
      { tier: "hard", ok: true },
      { tier: "soft", ok: false },
    ]),
    0,
  );
  assert.equal(
    overallExit([
      { tier: "hard", ok: false },
      { tier: "soft", ok: true },
    ]),
    1,
  );
  assert.equal(overallExit([]), 0);
});

test("moe-doctor --help exits 0 and mentions the two tiers", () => {
  const proc = spawnSync(process.execPath, [join(BIN_DIR, "moe-doctor"), "--help"], {
    encoding: "utf8",
  });
  assert.equal(proc.status, 0);
  assert.match(proc.stdout, /moe-doctor/);
  assert.match(proc.stdout, /HARD/);
});

test("moe-doctor --json emits parseable JSON with a results array", () => {
  const proc = spawnSync(process.execPath, [join(BIN_DIR, "moe-doctor"), "--json"], {
    encoding: "utf8",
  });
  assert.ok(proc.status === 0 || proc.status === 1, `unexpected exit ${proc.status}`);
  const parsed = JSON.parse(proc.stdout);
  assert.ok(Array.isArray(parsed.results));
  assert.equal(typeof parsed.platform, "string");
});

test("moe-install --help exits 0 and mentions --migrate and --apply", () => {
  const proc = spawnSync(process.execPath, [join(BIN_DIR, "moe-install"), "--help"], {
    encoding: "utf8",
  });
  assert.equal(proc.status, 0);
  assert.match(proc.stdout, /--migrate/);
  assert.match(proc.stdout, /--apply/);
});

test("moe-install (no flags) prints a dry-run install plan and changes nothing", () => {
  const proc = spawnSync(process.execPath, [join(BIN_DIR, "moe-install")], { encoding: "utf8" });
  assert.equal(proc.status, 0);
  assert.match(proc.stdout, /Plan \(dry-run/);
  assert.match(proc.stdout, /claude plugin marketplace add/);
});

test("moe-install --migrate --help exits 0 (--help wins over --migrate)", () => {
  const proc = spawnSync(process.execPath, [join(BIN_DIR, "moe-install"), "--migrate", "--help"], {
    encoding: "utf8",
  });
  assert.equal(proc.status, 0);
  assert.match(proc.stdout, /--migrate/);
});

// -------- migrate library --------

test("scopeFiles resolves against os.homedir(), never a hardcoded ~", () => {
  const files = scopeFiles("/some/cwd");
  const home = homedir();
  const userScope = files.find((f) => f.scope === "user");
  assert.ok(userScope);
  assert.ok(
    userScope.path.startsWith(home),
    `expected user scope under ${home}, got ${userScope.path}`,
  );
  assert.ok(!userScope.path.startsWith("~"), "~ should never appear verbatim");
});

test("RENAMED_MCP_KEYS covers episodic-memory and chrome", () => {
  const oldKeys = RENAMED_MCP_KEYS.map((k) => k.old);
  assert.deepEqual(oldKeys, ["episodic-memory", "chrome"]);
});

test("findRenamedKeys reports every renamed key present in every scope file", () => {
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
    const summaries = findings.map((f) => `${f.scope}:${f.oldKey}`).sort();
    assert.deepEqual(summaries, ["project:chrome", "user:chrome", "user:episodic-memory"]);
    for (const f of findings) {
      assert.match(f.command, /^claude mcp remove /);
      assert.ok(f.command.includes(`--scope ${f.scope}`));
    }

    const report = renderMigrationReport(findings);
    assert.match(report, /episodic-memory/);
    assert.match(report, /chrome/);
    assert.match(report, /--apply/);
  } finally {
    if (prevHome === undefined) delete process.env.HOME;
    else process.env.HOME = prevHome;
    if (prevUserprofile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = prevUserprofile;
  }
});

test('renderMigrationReport says "nothing to migrate" on empty findings', () => {
  const report = renderMigrationReport([]);
  assert.match(report, /Nothing to migrate/);
});
