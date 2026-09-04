// Cross-platform prerequisite probes for Moe. Dependency-free ESM so
// `bin/moe-doctor` and its test can run against a stock Node install without
// pnpm ever needing to have run.
//
// Two-tier taxonomy per the installer-hq-dx backlog item (see
// `.planning/backlog/W01P01 - installer-hq-dx.md`):
//
//   - HARD probes must pass for install to proceed. `node`, `git`, the
//     selected harness executable, and on native Windows the `bash` required
//     by Claude-layout/Cursor hook hosts.
//   - SOFT probes name the capability each miss disables, and warn rather
//     than fail. `cargo` → `moe-tab`, `tmux` → `moe-crew`, `uv` → `moe-proof`,
//     Chrome → `moe-glass`, `docker` → `moe-mint test`.
//
// Each probe returns a normalised result the doctor turns into a report line;
// versions are compared with semver-style tuple comparison rather than a
// string compare (a bare `>` on version strings gives the wrong answer for
// `2.10.0` vs `2.9.0`).

import { execFileSync } from "node:child_process";
import { accessSync, constants, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { platform } from "node:process";
import { getHarness, HARNESS_IDS, HARNESSES } from "./plugin-registry.mjs";

const WIN32 = platform === "win32";

/** Run a command, capturing stdout. Returns undefined when the command is
 *  missing (ENOENT), errored, or exited non-zero — every one of those
 *  means "not present" for a probe. */
export function tryExec(cmd, args, opts = {}) {
  try {
    return execFileSync(cmd, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 2_000,
      killSignal: "SIGKILL",
      ...opts,
    }).trim();
  } catch {
    return undefined;
  }
}

/** True when executable resolves to a regular executable file on PATH.
 * Detection reads directory entries only; it never launches the host CLI. */
export function executableOnPath(executable, options = {}) {
  const targetPlatform = options.platform ?? platform;
  const environment = options.env ?? process.env;
  const separator = targetPlatform === "win32" ? ";" : ":";
  const pathEntries = (environment.PATH ?? "").split(separator).filter(Boolean);
  const hasExtension = /\.[^./\\]+$/.test(executable);
  const extensions =
    targetPlatform === "win32" && !hasExtension
      ? (environment.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean)
      : [""];

  for (const dir of pathEntries) {
    for (const extension of extensions) {
      const candidate = join(
        dir,
        targetPlatform === "win32" ? `${executable}${extension}` : executable,
      );
      try {
        if (!statSync(candidate).isFile()) continue;
        accessSync(candidate, targetPlatform === "win32" ? constants.F_OK : constants.X_OK);
        return true;
      } catch {
        // Keep searching PATH after unreadable, non-executable, or absent candidates.
      }
    }
  }
  return false;
}

/** True when a direct executable candidate is a regular accessible file. */
export function executableFile(candidate, options = {}) {
  const targetPlatform = options.platform ?? platform;
  try {
    if (!statSync(candidate).isFile()) return false;
    accessSync(candidate, targetPlatform === "win32" ? constants.F_OK : constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** Adapter IDs whose unique host executable is installed. Agent Plugins 1.0
 * deliberately has no executable and therefore can only be selected
 * explicitly or through MOE_DEFAULT_HARNESS. */
export function detectInstalledHarnesses(options = {}) {
  return HARNESS_IDS.filter((id) => {
    const executable = HARNESSES[id].executable;
    return executable && executableOnPath(executable, options);
  });
}

/** Compare two dotted version strings. `cmpVersion('24.19.0', '24.0.0') > 0`.
 *  Non-numeric segments (a `-beta.1` tail) compare as 0, which is fine for
 *  every prereq here where "at least version N" is the whole question. */
export function cmpVersion(a, b) {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da !== db) return da - db;
  }
  return 0;
}

/** Parse `major.minor.patch` out of a tool's version output. Tools spell
 *  themselves inconsistently ("v24.19.0", "pnpm 11.23.0", "cargo 1.98.0
 *  (…)"), so the first `N.N.N` triple wins. */
export function extractVersion(output) {
  if (!output) return undefined;
  const match = /(\d+)\.(\d+)\.(\d+)/.exec(output);
  return match ? `${match[1]}.${match[2]}.${match[3]}` : undefined;
}

/** Parse `major.minor` out of tmux's own version output. No tmux release has
 *  ever shipped a three-part version — `tmux -V` prints `tmux 3.7c`,
 *  `tmux 3.4`, `tmux 3.3a`, `tmux 2.8` — so `extractVersion`'s N.N.N-only
 *  regex always misses it. tmux presence has no minVersion to compare
 *  against, so major.minor is all `probeTmux` needs. */
export function extractTmuxVersion(output) {
  if (!output) return undefined;
  const match = /(\d+)\.(\d+)/.exec(output);
  return match ? `${match[1]}.${match[2]}` : undefined;
}

/** Build a probe result. `ok=true` when present at or above `minVersion`
 *  (when provided). `capability` is what a soft miss disables — only set on
 *  soft probes. */
function result({ name, tier, ok, version, minVersion, fixHint, capability }) {
  return { name, tier, ok, version, minVersion, fixHint, capability };
}

// ---------- individual probes ----------

/** node ≥ 24. Note: `process.version` reports the interpreter running the
 *  doctor itself — the version the user is USING, not just what's on PATH.
 *  That is the correct thing to check. */
export function probeNode() {
  const version = process.version.replace(/^v/, "");
  const ok = cmpVersion(version, "24.0.0") >= 0;
  return result({
    name: "node",
    tier: "hard",
    ok,
    version,
    minVersion: "24.0.0",
    fixHint: ok ? undefined : "Install Node 24 or newer (nodejs.org, nvm, or your distro).",
  });
}

/** pnpm 11. Emitted plugins do not depend on pnpm at runtime. It remains a
 * soft contributor capability because workspace and moe-mint paths use it. */
export function probePnpm() {
  const version = extractVersion(tryExec("pnpm", ["--version"]));
  if (!version) {
    return result({
      name: "pnpm",
      tier: "soft",
      ok: false,
      capability: "contributor workspace and moe-mint commands",
      fixHint:
        "Enable Corepack (`corepack enable`) and rerun; pnpm 11 will bootstrap itself from packageManager.",
    });
  }
  const ok = cmpVersion(version, "11.0.0") >= 0;
  return result({
    name: "pnpm",
    tier: "soft",
    ok,
    version,
    minVersion: "11.0.0",
    capability: ok ? undefined : "contributor workspace and moe-mint commands",
    fixHint: ok ? undefined : "Upgrade to pnpm 11 (`corepack use pnpm@11`).",
  });
}

/** git — any version. Clone-based install and every `--sparse` marketplace
 *  add call require it. */
export function probeGit() {
  const version = extractVersion(tryExec("git", ["--version"]));
  return result({
    name: "git",
    tier: "hard",
    ok: Boolean(version),
    version,
    fixHint: version
      ? undefined
      : "Install git (git-scm.com; on Windows install Git for Windows to get bash too).",
  });
}

/**
 * bash on native Windows.
 *
 * On POSIX (macOS/Linux/WSL), bash is present as `/bin/bash` and this probe
 * is inapplicable — returns undefined and the doctor skips it. On win32
 * bash is optional per Claude Code's own docs; without it the plugin
 * bootstrap SessionStart hook exits 0 silently, and the SessionStart
 * bootstrap is the only reason the plugin's skills fire without being asked
 * for. Zak's backlog note calls this out as "the highest-value single
 * check in this item".
 *
 * Resolution order mirrors `packages/mint/src/bootstrap/shell-hook.ts`'s
 * generated `run-hook.cmd`: the two standard Git for Windows install paths,
 * then bash on PATH. Claude Code may additionally honor its own documented
 * CLAUDE_CODE_GIT_BASH_PATH host setting; Cursor and Copilot do not.
 */
export function probeBashOnWindows(harnessId, options = {}) {
  const targetPlatform = options.platform ?? platform;
  const environment = options.env ?? process.env;
  const isExecutableFile =
    options.isExecutableFile ??
    ((candidate) => executableFile(candidate, { platform: targetPlatform }));
  const resolvesOnPath =
    options.executableOnPath ??
    ((executable) => executableOnPath(executable, { platform: targetPlatform, env: environment }));
  const harness = getHarness(harnessId);
  if (targetPlatform !== "win32" || !harness?.requiresWindowsBash) return undefined;
  const envPath = environment.CLAUDE_CODE_GIT_BASH_PATH;
  if (harnessId === "claude-code" && envPath && isExecutableFile(envPath)) {
    return result({
      name: "bash (win32)",
      tier: "hard",
      ok: true,
      version: envPath,
      capability: "bootstrap SessionStart hook",
    });
  }
  const stdCandidates = [
    "C:\\Program Files\\Git\\bin\\bash.exe",
    "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
  ];
  for (const candidate of stdCandidates) {
    if (isExecutableFile(candidate)) {
      return result({ name: "bash (win32)", tier: "hard", ok: true, version: candidate });
    }
  }
  if (resolvesOnPath("bash")) {
    return result({
      name: "bash (win32)",
      tier: "hard",
      ok: true,
      version: "bash.exe on PATH",
    });
  }
  const hostFix =
    harnessId === "claude-code"
      ? "Install Git for Windows, put bash.exe on PATH, or set CLAUDE_CODE_GIT_BASH_PATH in Claude Code settings to an existing bash.exe."
      : `Install Git for Windows or put bash.exe on PATH so ${harness.displayName}'s generated run-hook.cmd can find it.`;
  return result({
    name: "bash (win32)",
    tier: "hard",
    ok: false,
    capability: "bootstrap SessionStart hook (will silent-skip without bash)",
    fixHint: `${hostFix} Without bash, the bootstrap SessionStart hook silently skips.`,
  });
}

/** cargo ≥ 1.98 gates `pnpm tab:build` / `pnpm tab:test`. Soft — a user
 *  installing only content plugins never needs it. */
export function probeCargo() {
  const version = extractVersion(tryExec("cargo", ["--version"]));
  if (!version) {
    return result({
      name: "cargo",
      tier: "soft",
      ok: false,
      capability: "@bubstack/moe-tab (Rust build, only needed by contributors)",
      fixHint:
        "Install rustup (rustup.rs) and run `rustup default stable`. On macOS after `brew cleanup`, the toolchain lives at ~/.rustup/toolchains/stable-<triple>/bin — add it to PATH or run `brew unlink rustup && brew link --overwrite rust`.",
    });
  }
  const ok = cmpVersion(version, "1.98.0") >= 0;
  return result({
    name: "cargo",
    tier: "soft",
    ok,
    version,
    minVersion: "1.98.0",
    capability: ok ? undefined : "@bubstack/moe-tab (cargo present but too old)",
    fixHint: ok ? undefined : "Upgrade with `rustup update stable`.",
  });
}

/** tmux gates moe-crew and the `use-tmux` skill.
 *  On native Windows this is WSL-only: `packages/crew/src/core/tmux.ts`
 *  shells out to bare `tmux` with no platform branch. */
export function probeTmux() {
  const version = extractTmuxVersion(tryExec("tmux", ["-V"]));
  const capability = WIN32
    ? "@bubstack/moe-crew (native Windows: WSL-only; tmux does not exist on native Windows)"
    : "@bubstack/moe-crew and the use-tmux skill";
  if (!version) {
    return result({
      name: "tmux",
      tier: "soft",
      ok: false,
      capability,
      fixHint: WIN32
        ? "Use WSL 2. `moe-crew` cannot run on native Windows; this is a platform gap, not a missing optional tool."
        : "Install tmux from your package manager (`brew install tmux`, `apt install tmux`, etc.).",
    });
  }
  return result({ name: "tmux", tier: "soft", ok: true, version, capability });
}

/** uv ≥ 0.12 gates `pnpm proof:test`. Python is optional to Moe end-users. */
export function probeUv() {
  const version = extractVersion(tryExec("uv", ["--version"]));
  if (!version) {
    return result({
      name: "uv",
      tier: "soft",
      ok: false,
      capability: "moe-proof (small-model evals; Python)",
      fixHint:
        "Install uv from astral.sh/uv, `brew install uv`, or `winget install --id=astral-sh.uv`.",
    });
  }
  const ok = cmpVersion(version, "0.12.0") >= 0;
  return result({
    name: "uv",
    tier: "soft",
    ok,
    version,
    minVersion: "0.12.0",
    capability: ok ? undefined : "moe-proof (uv present but too old)",
    fixHint: ok ? undefined : "Upgrade with `uv self update`.",
  });
}

/** Chrome, needed by moe-glass. On macOS the default install path exists as
 *  a fixed bundle; on Windows there are two Program Files locations; on
 *  Linux the usual binary name is `google-chrome`. Match
 *  `packages/glass/skills/browsing/lib/chrome-process.js`'s discovery
 *  behaviour rather than re-inventing it. */
export function probeChrome() {
  const capability = "@bubstack/moe-glass (CDP browser access)";
  const macBundle = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  const winCandidates = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  ];
  const linuxNames = ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"];

  if (existsSync(macBundle)) {
    return result({ name: "chrome", tier: "soft", ok: true, version: macBundle, capability });
  }
  for (const candidate of winCandidates) {
    if (existsSync(candidate)) {
      return result({ name: "chrome", tier: "soft", ok: true, version: candidate, capability });
    }
  }
  for (const bin of linuxNames) {
    // Resolve directly against PATH rather than shelling out to `command -v`
    // (or Windows `where`): `command` is a shell builtin with no standalone
    // executable on Debian/Ubuntu/Alpine, so execFileSync("command", …)
    // always threw ENOENT there and this branch never found anything.
    if (executableOnPath(bin))
      return result({ name: "chrome", tier: "soft", ok: true, version: bin, capability });
  }
  return result({
    name: "chrome",
    tier: "soft",
    ok: false,
    capability,
    fixHint: "Install Google Chrome or Chromium. moe-glass shells out to it via CDP.",
  });
}

/** docker — needed only for the `moe-mint test` container tier. Soft. */
export function probeDocker() {
  const version = extractVersion(tryExec("docker", ["--version"]));
  if (!version) {
    return result({
      name: "docker",
      tier: "soft",
      ok: false,
      capability: "`moe-mint test` container tier (contributor-only)",
      fixHint: "Install Docker Desktop (mac/Windows) or the docker engine (Linux).",
    });
  }
  return result({ name: "docker", tier: "soft", ok: true, version });
}

/** python3 ≥ 3.11 — soft. Only mint's TOML check and `moe-proof` care. */
export function probePython() {
  const version = extractVersion(tryExec("python3", ["--version"]));
  if (!version) {
    return result({
      name: "python3",
      tier: "soft",
      ok: false,
      capability: "mint TOML check and moe-proof",
      fixHint: "Install Python 3.11+ from python.org or your distro.",
    });
  }
  const ok = cmpVersion(version, "3.11.0") >= 0;
  return result({
    name: "python3",
    tier: "soft",
    ok,
    version,
    minVersion: "3.11.0",
    capability: ok ? undefined : "six mint tests skip on < 3.11",
    fixHint: ok ? undefined : "Upgrade to Python 3.11+.",
  });
}

/** The selected host is the only host CLI that is a hard requirement. */
export function probeHarness(harnessId) {
  const harness = getHarness(harnessId);
  if (!harness?.executable) return undefined;
  const versionOutput = tryExec(harness.executable, ["--version"]);
  const version = extractVersion(versionOutput) ?? versionOutput?.split(/\r?\n/)[0];
  return result({
    name: harness.executable,
    tier: "hard",
    ok: Boolean(versionOutput),
    version,
    fixHint: versionOutput
      ? undefined
      : `Install ${harness.displayName}; moe-install selected the ${harnessId} adapter.`,
  });
}

/** Every probe, in a stable report order. Platform-inapplicable and
 * specification-wide host probes return undefined and are filtered out. */
export function allProbes(harnessId) {
  return [
    probeNode(),
    probePnpm(),
    probeGit(),
    probeBashOnWindows(harnessId),
    probeHarness(harnessId),
    probeCargo(),
    probeTmux(),
    probeUv(),
    probeChrome(),
    probeDocker(),
    probePython(),
  ].filter(Boolean);
}

/** Overall exit code: 0 if every HARD probe passes (soft misses only warn),
 *  1 otherwise. */
export function overallExit(results) {
  const anyHardMiss = results.some((r) => r.tier === "hard" && !r.ok);
  return anyHardMiss ? 1 : 0;
}
