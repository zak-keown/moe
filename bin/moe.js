#!/usr/bin/env node
// bin/moe.js — TC umbrella lifecycle, status, and namespace dispatcher.
//
// Node stdlib only. The grammar is copied from packages/flight/src/cli.ts:
// switch on argv[2], one usage block, and namespaces declared-and-refused
// rather than silently absent.
//
// This dispatcher never links itself onto PATH — bin/moe-install persists the
// exact running umbrella release and lets npm own all three durable shims.
//
// MCP hosts and generated plugin manifests keep pointing at moe-glass /
// moe-memory directly (packages/mint/src/adapters/claude-code.ts emits the
// mcpServers path). `moe <ns>` is a human convenience only — hence the extra
// spawn hop is acceptable, and forwarding SIGINT/SIGTERM keeps Ctrl-C sane.

import { spawn } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { platform as osPlatform, release as osRelease } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { NAMESPACE_DISTRIBUTIONS } from "../config/distribution.mjs";

/**
 * @typedef {{
 *   bin: string,
 *   workspace: string,
 *   runner?: "uv",
 *   packageName: string | null,
 *   npmCli: boolean,
 *   availability?: string,
 *   description: string,
 * }} NamespaceEntry
 */

/** @type {Record<string, NamespaceEntry>} */
export const NAMESPACES = NAMESPACE_DISTRIBUTIONS;

export const USAGE = `moe — TC's umbrella CLI for Moe.

usage: moe [status]
       moe install|upgrade|uninstall [--scope user|project|local]
       moe doctor [args...]
       moe <namespace> [args...]

lifecycle:
  status     Report each namespace exactly once (also the bare-command default).
  install    Persist the exact running @tc/moe release and install all plugins.
  upgrade    Upgrade the TC CLI packages and plugins to latest.
  uninstall  Remove plugins and marketplace, then remove the global TC packages.
  doctor     Check macOS/Linux/WSL2 prerequisites. Native Windows is deferred.

namespaces:
  crew     Launch and monitor worker sessions over tmux.
  flight   Drive web/CLI/TUI targets through acceptance criteria and grade them.
  glass    Zero-dependency Chrome DevTools Protocol client (MCP: moe-glass).
  memory   Semantic recall over past sessions and journal entries (MCP: moe-memory).
  mint     Generate native plugin manifests for every harness from one config.
  proof    Evals against small models (Python).
  tab      Price an agent transcript — what the run cost you.

The \`moe-<ns>\` names remain valid direct entry points. Run \`moe status\`
to see which ones are present and how absent commands are distributed.
`;

// Detect WSL by (linux + microsoft-in-release) — the idiom
// packages/core/skills/brainstorming/scripts/server.cjs uses, so worth
// reusing rather than reinventing.
function isWSL(plat, rel) {
  return plat === "linux" && /microsoft/i.test(rel);
}

// On Windows a "bin" resolves through cmd-shim, which emits .cmd + .ps1 +
// an extensionless bash shim. Check .cmd first because that is what npm/pnpm
// generate; then .exe (native like moe-tab.exe), then the bareword.
function candidateNames(base, plat) {
  if (plat === "win32") return [`${base}.cmd`, `${base}.exe`, `${base}.bat`, base];
  return [base];
}

function findInDir(dir, base, plat) {
  for (const name of candidateNames(base, plat)) {
    const p = join(dir, name);
    if (existsSync(p)) return p;
  }
  return null;
}

function findOnPath(base, plat, env) {
  const path = env.PATH ?? env.Path ?? "";
  for (const dir of path.split(delimiter)) {
    if (!dir) continue;
    const hit = findInDir(dir, base, plat);
    if (hit) return hit;
  }
  return null;
}

function workspaceRootFrom(dir) {
  // Walk up until pnpm-workspace.yaml appears. Returns null when the
  // dispatcher lives outside a checkout — the normal install case, where
  // sibling and PATH cover every namespace.
  let current = dir;
  for (let i = 0; i < 16; i++) {
    if (existsSync(join(current, "pnpm-workspace.yaml"))) return current;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
  return null;
}

function selfDir() {
  return dirname(realpathSync(fileURLToPath(import.meta.url)));
}

/**
 * Resolve `moe <ns> [args...]` to a concrete { command, args, source } —
 * or { missing } / { unknown }. Kept pure so the vitest can drive it with
 * platform, PATH and workspace inputs injected.
 *
 * Order: sibling → PATH → checkout fallback. In an install, sibling wins so
 * the tree stays self-consistent even if PATH shadows it. In a checkout with
 * nothing installed globally, workspace fallback lets `node bin/moe.js` work
 * out of the box.
 *
 * @param {string} ns
 * @param {string[]} args
 * @param {{
 *   self?: string,
 *   root?: string | null,
 *   env?: NodeJS.ProcessEnv,
 *   platform?: NodeJS.Platform,
 * }} [opts]
 */
export function resolve(ns, args, opts = {}) {
  const entry = NAMESPACES[ns];
  if (!entry) return { unknown: true };

  const self = opts.self ?? selfDir();
  const root = opts.root === undefined ? workspaceRootFrom(self) : opts.root;
  const env = opts.env ?? process.env;
  const plat = opts.platform ?? osPlatform();

  const sibling = findInDir(self, entry.bin, plat);
  if (sibling) return { command: sibling, args, source: "sibling" };

  const onPath = findOnPath(entry.bin, plat, env);
  if (onPath) return { command: onPath, args, source: "path" };

  if (root) {
    if (entry.runner === "uv") {
      const uv = findOnPath("uv", plat, env);
      const project = join(root, entry.workspace);
      if (uv && existsSync(project)) {
        return {
          command: uv,
          args: ["run", "--project", project, entry.bin, ...args],
          source: "workspace-uv",
        };
      }
    }
    if (entry.workspace) {
      const wsBase = join(root, entry.workspace);
      const wsCandidates = ns === "tab" && plat === "win32" ? [`${wsBase}.exe`, wsBase] : [wsBase];
      for (const cand of wsCandidates) {
        if (existsSync(cand)) {
          if (ns === "tab") return { command: cand, args, source: "workspace" };
          // Node bundles: invoke through the current Node so no shebang wiring
          // is required inside a checkout with nothing globally installed.
          return { command: process.execPath, args: [cand, ...args], source: "workspace" };
        }
      }
    }
  }

  return { missing: true, entry, root };
}

function missingMessage(ns, entry, root) {
  const lines = [`moe ${ns}: not installed.`, ``];
  if (entry.npmCli) {
    lines.push(
      `The \`${entry.bin}\` command ships in ${entry.packageName}. Run \`moe install\``,
      `to install the lockstep TC CLI packages and plugins.`,
    );
  } else {
    lines.push(`Distribution: ${entry.availability}.`);
  }
  if (root) {
    lines.push(``);
    if (ns === "proof") {
      lines.push(`From this checkout: \`uv run --project py/proof moe-proof …\` (needs uv).`);
    } else if (ns === "tab") {
      lines.push(
        `From this checkout: \`pnpm tab:build\` writes packages/tab/target/release/${entry.bin}.`,
      );
    } else if (entry.packageName) {
      lines.push(`From this checkout: \`pnpm --filter ${entry.packageName} build\`.`);
    }
  }
  return `${lines.join("\n")}\n`;
}

function crewOnWindowsMessage() {
  return (
    `moe crew: native Windows is not supported, and tmux is unavailable there.\n` +
    `\n` +
    `Use WSL2. Native Windows support is deferred for this release.\n`
  );
}

function resolveSupportBin(base, args, opts) {
  const self = opts.self ?? selfDir();
  const env = opts.env ?? process.env;
  const plat = opts.platform ?? osPlatform();
  const root = opts.root === undefined ? workspaceRootFrom(self) : opts.root;
  const sibling = findInDir(self, base, plat);
  if (sibling) return { command: sibling, args, source: "sibling" };
  const onPath = findOnPath(base, plat, env);
  if (onPath) return { command: onPath, args, source: "path" };
  if (root) {
    const workspace = join(root, "bin", base);
    if (existsSync(workspace)) {
      return { command: process.execPath, args: [workspace, ...args], source: "workspace" };
    }
  }
  return null;
}

/** Classify every permanent namespace once. */
export function namespaceStatuses(opts = {}) {
  const self = opts.self ?? selfDir();
  const root = opts.root === undefined ? workspaceRootFrom(self) : opts.root;
  const shared = { ...opts, self, root };
  return Object.keys(NAMESPACES).map((namespace) => {
    const resolved = resolve(namespace, [], shared);
    return {
      namespace,
      present: !resolved.missing,
      source: resolved.source,
      entry: NAMESPACES[namespace],
    };
  });
}

function writeStatus(stdout, opts) {
  stdout.write("Moe namespace status:\n");
  for (const status of namespaceStatuses(opts)) {
    const { namespace, present, source, entry } = status;
    const label = namespace.padEnd(7);
    if (present) {
      const identity = entry.packageName ? `; ${entry.packageName}` : "";
      stdout.write(`  [present] ${label} ${entry.bin} (${source}${identity})\n`);
    } else if (entry.npmCli) {
      stdout.write(`  [absent]  ${label} ${entry.packageName} provides ${entry.bin}\n`);
    } else {
      stdout.write(`  [absent]  ${label} ${entry.availability}\n`);
    }
  }
  return 0;
}

const SIGNAL_NUMBERS = { SIGHUP: 1, SIGINT: 2, SIGQUIT: 3, SIGKILL: 9, SIGTERM: 15 };

async function spawnAndForward(command, args) {
  // stdio: 'inherit' makes stdout/stderr byte-identical to the target's, and
  // Ctrl-C in a terminal already reaches the child through the process group.
  // SIGINT/SIGTERM are still forwarded explicitly for detached invocations —
  // and, per packages/crew/src/core/proc.ts, spawn failure NEVER rejects: we
  // resolve with a code and write the error to stderr, "just like $? in bash".
  const child = spawn(command, args, { stdio: "inherit" });
  const forward = (signal) => () => {
    try {
      child.kill(signal);
    } catch {
      /* child may already be gone */
    }
  };
  const onInt = forward("SIGINT");
  const onTerm = forward("SIGTERM");
  process.on("SIGINT", onInt);
  process.on("SIGTERM", onTerm);
  return new Promise((res) => {
    child.on("error", (err) => {
      process.off("SIGINT", onInt);
      process.off("SIGTERM", onTerm);
      process.stderr.write(`moe: could not spawn \`${command}\`: ${err.message}\n`);
      res(127);
    });
    child.on("exit", (code, signal) => {
      process.off("SIGINT", onInt);
      process.off("SIGTERM", onTerm);
      if (signal) {
        res(128 + (SIGNAL_NUMBERS[signal] ?? 0));
        return;
      }
      res(code ?? 0);
    });
  });
}

/**
 * Entry point. Returns the exit code the caller should exit with; never
 * calls process.exit itself so the test harness can drive it.
 *
 * @param {string[]} [argv]
 * @param {{
 *   self?: string,
 *   root?: string | null,
 *   env?: NodeJS.ProcessEnv,
 *   platform?: NodeJS.Platform,
 *   release?: string,
 *   stdout?: NodeJS.WritableStream,
 *   stderr?: NodeJS.WritableStream,
 *   spawn?: (command: string, args: string[]) => Promise<number>,
 * }} [opts]
 */
export async function main(argv = process.argv.slice(2), opts = {}) {
  const stdout = opts.stdout ?? process.stdout;
  const stderr = opts.stderr ?? process.stderr;
  const runner = opts.spawn ?? spawnAndForward;
  const plat = opts.platform ?? osPlatform();
  const rel = opts.release ?? osRelease();

  const [ns, ...rest] = argv;

  if (ns === "-h" || ns === "--help" || ns === "help") {
    stdout.write(USAGE);
    return 0;
  }

  if (ns === undefined || ns === "status") {
    return writeStatus(stdout, opts);
  }

  if (["install", "upgrade", "uninstall", "doctor"].includes(ns)) {
    const lifecycleFlags = {
      install: ["--apply"],
      upgrade: ["--upgrade", "--apply"],
      uninstall: ["--uninstall", "--apply"],
      doctor: [],
    };
    const forwarded = rest.filter((arg) => !["--apply", "--upgrade", "--uninstall"].includes(arg));
    const base = ns === "doctor" ? "moe-doctor" : "moe-install";
    const resolved = resolveSupportBin(base, [...lifecycleFlags[ns], ...forwarded], opts);
    if (!resolved) {
      stderr.write(`moe ${ns}: could not find ${base} beside moe or on PATH.\n`);
      return 127;
    }
    return await runner(resolved.command, resolved.args);
  }

  // Crew needs tmux, and native Windows has none. WSL2 is the supported route.
  if (ns === "crew" && plat === "win32" && !isWSL(plat, rel)) {
    stderr.write(crewOnWindowsMessage());
    return 2;
  }

  const resolved = resolve(ns, rest, opts);
  if (resolved.unknown) {
    stderr.write(`moe: unknown namespace "${ns}".\n\n${USAGE}`);
    return 2;
  }
  if (resolved.missing) {
    stderr.write(missingMessage(ns, resolved.entry, resolved.root));
    return 127;
  }

  return await runner(resolved.command, resolved.args);
}

// Only self-execute when invoked directly. When imported by the vitest,
// process.argv[1] points at vitest's runner, not this file, so the check
// fails and the module stays inert.
const invokedDirectly = (() => {
  try {
    const argv1 = process.argv[1];
    if (!argv1) return false;
    return realpathSync(argv1) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      process.stderr.write(`moe: ${err?.stack ?? err?.message ?? String(err)}\n`);
      process.exit(1);
    });
}
