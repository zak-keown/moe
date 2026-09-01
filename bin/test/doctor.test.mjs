// Vitest coverage for the dependency-free doctor and installer entry points.

import { spawnSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MARKETPLACE, NPM_CLI_PACKAGES, UMBRELLA_PACKAGE } from "../../config/distribution.mjs";
import {
  allProbes,
  cmpVersion,
  extractVersion,
  findExecutable,
  overallExit,
  probeNpm,
  probePlatform,
  probePnpm,
} from "../lib/probes.mjs";
import { main as installMain, lifecycleActions } from "../moe-install";

const BIN_DIR = fileURLToPath(new URL("..", import.meta.url));

function runBin(name, ...args) {
  return spawnSync(process.execPath, [join(BIN_DIR, name), ...args], { encoding: "utf8" });
}

function makeStream() {
  const chunks = [];
  return {
    write(chunk) {
      chunks.push(String(chunk));
      return true;
    },
    text: () => chunks.join(""),
  };
}

function cleanPackageFixture(version = "1.2.3-tc.4") {
  const root = mkdtempSync(join(tmpdir(), "moe-install-acceptance-"));
  const bin = join(root, "bin");
  const fakeBin = join(root, "fake-bin");
  const home = join(root, "home");
  mkdirSync(join(bin, "lib"), { recursive: true });
  mkdirSync(join(root, "config"), { recursive: true });
  mkdirSync(fakeBin);
  mkdirSync(home);
  cpSync(join(BIN_DIR, "moe-install"), join(bin, "moe-install"));
  cpSync(join(BIN_DIR, "lib", "probes.mjs"), join(bin, "lib", "probes.mjs"));
  cpSync(
    fileURLToPath(new URL("../../config/distribution.mjs", import.meta.url)),
    join(root, "config", "distribution.mjs"),
  );
  writeFileSync(join(root, "package.json"), `${JSON.stringify({ type: "module", version })}\n`);
  chmodSync(join(bin, "moe-install"), 0o755);

  const log = join(root, "actions.log");
  const versions = { npm: "npm 11.6.2", claude: "claude 2.1.42", git: "git version 2.50.1" };
  for (const command of ["npm", "claude", "git"]) {
    const recorder = join(fakeBin, command);
    writeFileSync(
      recorder,
      `#!/bin/sh\nif [ "$1" = "--version" ]; then printf '%s\\n' '${versions[command]}'; exit 0; fi\nprintf '%s' '${command}' >> "$MOE_TEST_LOG"\nfor arg in "$@"; do printf ' %s' "$arg" >> "$MOE_TEST_LOG"; done\nprintf '\\n' >> "$MOE_TEST_LOG"\n`,
    );
    chmodSync(recorder, 0o755);
  }
  return { root, bin, fakeBin, home, log, version };
}

function runCleanFixture(args) {
  const fixture = cleanPackageFixture();
  const proc = spawnSync(process.execPath, [join(fixture.bin, "moe-install"), ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      HOME: fixture.home,
      PATH: fixture.fakeBin,
      MOE_TEST_LOG: fixture.log,
    },
  });
  const actions = readFileSync(fixture.log, "utf8").trim().split("\n");
  return { ...fixture, proc, actions };
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

  it("accepts macOS, Linux and WSL2 but hard-rejects native Windows", () => {
    expect(probePlatform("darwin", "").ok).toBe(true);
    expect(probePlatform("linux", "6.8.0").ok).toBe(true);
    expect(probePlatform("linux", "5.15.153.1-microsoft-standard-WSL2")).toMatchObject({
      ok: true,
      version: "WSL2",
    });
    expect(probePlatform("win32", "10.0.22631")).toMatchObject({
      tier: "hard",
      ok: false,
    });
  });

  it("requires npm but treats pnpm as contributor-only", () => {
    expect(probeNpm().tier).toBe("hard");
    expect(probePnpm().tier).toBe("soft");
  });

  it("findExecutable discovers a real PATH file without a shell", () => {
    const directory = mkdtempSync(join(tmpdir(), "moe-path-probe-"));
    const chrome = join(directory, "google-chrome");
    writeFileSync(chrome, "#!/bin/sh\n");
    chmodSync(chrome, 0o755);
    expect(findExecutable("google-chrome", { PATH: directory }, "linux")).toBe(chrome);
    expect(findExecutable("missing", { PATH: directory }, "linux")).toBeUndefined();
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

  it("all three published bin targets are executable", () => {
    for (const name of ["moe.js", "moe-install", "moe-doctor"]) {
      expect(statSync(join(BIN_DIR, name)).mode & 0o111, name).not.toBe(0);
    }
  });

  it("moe-install with no flags prints a read-only install plan", () => {
    const stdout = makeStream();
    const code = installMain([], { stdout, stderr: makeStream(), version: "1.2.3-tc.4" });
    expect(code).toBe(0);
    expect(stdout.text()).toMatch(/Plan \(dry-run/);
    expect(stdout.text()).toMatch(/npm install --global @tc\/moe@1\.2\.3-tc\.4/);
    expect(stdout.text()).toMatch(/claude plugin marketplace add/);
  });
});

describe("lifecycle action contract", () => {
  it("install persists the exact running umbrella and all four namespace CLIs", () => {
    const [npm] = lifecycleActions("install", undefined, "2.4.0-tc.7");
    expect(npm).toEqual([
      "npm",
      "install",
      "--global",
      `${UMBRELLA_PACKAGE}@2.4.0-tc.7`,
      ...NPM_CLI_PACKAGES.map((name) => `${name}@2.4.0-tc.7`),
    ]);
  });

  it("upgrade uses latest and never passes scope to marketplace update", () => {
    const actions = lifecycleActions("upgrade", "project", "2.4.0-tc.7");
    expect(actions[0]).toEqual(["claude", "plugin", "marketplace", "update", MARKETPLACE.name]);
    expect(actions.at(-1)).toEqual([
      "npm",
      "install",
      "--global",
      `${UMBRELLA_PACKAGE}@latest`,
      ...NPM_CLI_PACKAGES.map((name) => `${name}@latest`),
    ]);
  });

  it("uninstall removes plugins and marketplace before packages, umbrella last", () => {
    const actions = lifecycleActions("uninstall", "user", "2.4.0-tc.7");
    expect(actions.slice(0, MARKETPLACE.plugins.length).every((a) => a[2] === "uninstall")).toBe(
      true,
    );
    expect(actions[MARKETPLACE.plugins.length]).toEqual([
      "claude",
      "plugin",
      "marketplace",
      "remove",
      "moe",
      "--scope",
      "user",
    ]);
    expect(actions.at(-1)).toEqual(["npm", "uninstall", "--global", UMBRELLA_PACKAGE]);
  });
});

describe("clean-home lifecycle acceptance", () => {
  it("install invokes only fake npm/claude with sparse paths and exact versions", () => {
    const run = runCleanFixture(["--apply", "--scope", "user"]);
    expect(run.proc.status, run.proc.stderr).toBe(0);
    expect(run.proc.stdout).toContain("Doctor passed. Proceeding with install.");
    expect(run.actions[0]).toBe(
      `npm install --global ${UMBRELLA_PACKAGE}@${run.version} ${NPM_CLI_PACKAGES.map((name) => `${name}@${run.version}`).join(" ")}`,
    );
    expect(run.actions[1]).toBe(
      `claude plugin marketplace add ${MARKETPLACE.repository} --sparse ${MARKETPLACE.sparsePaths.join(" ")} --scope user`,
    );
    expect(run.actions.slice(2)).toEqual(
      MARKETPLACE.plugins.map((plugin) => `claude plugin install ${plugin}@moe --scope user`),
    );
    expect(readdirSync(run.home)).toEqual([]);
  });

  it("upgrade updates plugins before installing all five latest packages", () => {
    const run = runCleanFixture(["--upgrade", "--apply", "--scope", "project"]);
    expect(run.proc.status, run.proc.stderr).toBe(0);
    expect(run.actions[0]).toBe("claude plugin marketplace update moe");
    expect(run.actions.at(-1)).toBe(
      `npm install --global ${UMBRELLA_PACKAGE}@latest ${NPM_CLI_PACKAGES.map((name) => `${name}@latest`).join(" ")}`,
    );
    expect(run.actions[0]).not.toContain("--scope");
    expect(readdirSync(run.home)).toEqual([]);
  });

  it("uninstall removes plugins and marketplace before namespace packages and umbrella", () => {
    const run = runCleanFixture(["--uninstall", "--apply", "--scope", "local"]);
    expect(run.proc.status, run.proc.stderr).toBe(0);
    expect(run.actions.slice(0, 6)).toEqual(
      MARKETPLACE.plugins.map((plugin) => `claude plugin uninstall ${plugin}@moe --scope local`),
    );
    expect(run.actions[6]).toBe("claude plugin marketplace remove moe --scope local");
    expect(run.actions[7]).toBe(`npm uninstall --global ${NPM_CLI_PACKAGES.join(" ")}`);
    expect(run.actions[8]).toBe(`npm uninstall --global ${UMBRELLA_PACKAGE}`);
    expect(readdirSync(run.home)).toEqual([]);
  });
});
