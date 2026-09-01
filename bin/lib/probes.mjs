// Cross-platform prerequisite probes for Moe. Dependency-free ESM so
// `bin/moe-doctor` and its test can run against a stock Node install without
// pnpm ever needing to have run.
//
// Two-tier taxonomy per the installer-hq-dx backlog item (see
// `.planning/backlog/W01P01 - installer-hq-dx.md`):
//
//   - HARD probes must pass for install to proceed. The platform probe accepts
//     macOS, Linux and WSL2 and rejects native Windows; node, npm, git and
//     Claude Code are also required.
//   - SOFT probes name the capability each miss disables, and warn rather
//     than fail. `pnpm` is contributor-only; `cargo` → `moe-tab`, `tmux` →
//     `moe-crew`, `uv` → `moe-proof`, Chrome → `moe-glass`, and `docker` →
//     `moe-mint test`.
//
// Each probe returns a normalised result the doctor turns into a report line;
// versions are compared with semver-style tuple comparison rather than a
// string compare (a bare `>` on version strings gives the wrong answer for
// `2.10.0` vs `2.9.0`).

import { execFileSync } from "node:child_process";
import { accessSync, constants, existsSync } from "node:fs";
import { release as osRelease } from "node:os";
import { delimiter, join } from "node:path";
import { platform as processPlatform } from "node:process";

const WIN32 = processPlatform === "win32";

/** Run a command, capturing stdout. Returns undefined when the command is
 *  missing (ENOENT), errored, or exited non-zero — every one of those
 *  means "not present" for a probe. */
export function tryExec(cmd, args, opts = {}) {
  try {
    return execFileSync(cmd, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      ...opts,
    }).trim();
  } catch {
    return undefined;
  }
}

/** Resolve a real executable without invoking a shell builtin. */
export function findExecutable(name, env = process.env, plat = processPlatform) {
  const suffixes = plat === "win32" ? [".exe", ".cmd", ".bat", ""] : [""];
  for (const directory of (env.PATH ?? env.Path ?? "").split(delimiter)) {
    if (!directory) continue;
    for (const suffix of suffixes) {
      const candidate = join(directory, `${name}${suffix}`);
      try {
        accessSync(candidate, constants.X_OK);
        return candidate;
      } catch {
        // Keep scanning PATH.
      }
    }
  }
  return undefined;
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

/** Build a probe result. `ok=true` when present at or above `minVersion`
 *  (when provided). `capability` is what a soft miss disables — only set on
 *  soft probes. */
function result({ name, tier, ok, version, minVersion, fixHint, capability }) {
  return { name, tier, ok, version, minVersion, fixHint, capability };
}

// ---------- individual probes ----------

/** Moe currently supports macOS, Linux and WSL2. Native Windows is deferred. */
export function probePlatform(plat = processPlatform, release = osRelease()) {
  const wsl2 = plat === "linux" && /microsoft/i.test(release);
  const ok = plat === "darwin" || plat === "linux";
  return result({
    name: "platform",
    tier: "hard",
    ok,
    version: wsl2 ? "WSL2" : plat,
    fixHint: ok
      ? undefined
      : plat === "win32"
        ? "Run Moe inside WSL2. Native Windows support is deferred."
        : "Use macOS, Linux, or WSL2.",
  });
}

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

/** npm is the persistence mechanism used after `npx @tc/moe install`. */
export function probeNpm() {
  const version = extractVersion(tryExec("npm", ["--version"]));
  return result({
    name: "npm",
    tier: "hard",
    ok: Boolean(version),
    version,
    fixHint: version ? undefined : "Install npm with Node 24 or newer.",
  });
}

/** pnpm 11 is contributor-only. Installed plugins and CLI packages do not use
 *  it, so a missing pnpm must not block an end-user install. */
export function probePnpm() {
  const version = extractVersion(tryExec("pnpm", ["--version"]));
  if (!version) {
    return result({
      name: "pnpm",
      tier: "soft",
      ok: false,
      capability: "contributor builds, tests, and plugin minting",
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
    capability: ok ? undefined : "contributor builds, tests, and plugin minting",
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

/** cargo ≥ 1.98 gates `pnpm tab:build` / `pnpm tab:test`. Soft — a user
 *  installing only content plugins never needs it. */
export function probeCargo() {
  const version = extractVersion(tryExec("cargo", ["--version"]));
  if (!version) {
    return result({
      name: "cargo",
      tier: "soft",
      ok: false,
      capability: "moe-tab native CLI (Rust build, only needed by contributors)",
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
    capability: ok ? undefined : "moe-tab native CLI (cargo present but too old)",
    fixHint: ok ? undefined : "Upgrade with `rustup update stable`.",
  });
}

/** tmux gates moe-crew and the `using-tmux-for-interactive-commands` skill.
 *  On native Windows this is WSL-only: `packages/crew/src/core/tmux.ts`
 *  shells out to bare `tmux` with no platform branch. */
export function probeTmux() {
  const version = extractVersion(tryExec("tmux", ["-V"]));
  const capability = WIN32
    ? "@tc/moe-crew (native Windows is unsupported; use WSL2)"
    : "@tc/moe-crew and the using-tmux-for-interactive-commands skill";
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
export function probeChrome(env = process.env, plat = processPlatform) {
  const capability = "@tc/moe-glass (CDP browser access)";
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
    const found = findExecutable(bin, env, plat);
    if (found)
      return result({
        name: "chrome",
        tier: "soft",
        ok: true,
        version: found,
        capability,
      });
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

/** `claude` CLI — hard for install. Every marketplace-add and plugin-install
 *  call routes through it, so its absence turns `moe-install` into a no-op
 *  that fails at the first spawn. */
export function probeClaude() {
  const version = extractVersion(tryExec("claude", ["--version"]));
  if (!version) {
    return result({
      name: "claude",
      tier: "hard",
      ok: false,
      fixHint:
        "Install Claude Code (see https://code.claude.com/docs/en/setup). `moe-install` shells out to `claude plugin marketplace add` / `claude plugin install`.",
    });
  }
  return result({ name: "claude", tier: "hard", ok: true, version });
}

/** Every probe, in a stable report order. */
export function allProbes(opts = {}) {
  return [
    probePlatform(opts.platform, opts.release),
    probeNode(),
    probeNpm(),
    probeGit(),
    probeClaude(),
    probePnpm(),
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
