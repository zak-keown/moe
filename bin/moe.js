#!/usr/bin/env node
// bin/moe.js — the dispatcher in front of the seven `moe-<ns>` bins.
//
// Node stdlib only. The grammar is copied from packages/flight/src/cli.ts:
// switch on argv[2], one usage block, and namespaces declared-and-refused
// rather than silently absent (see the "@bubstack/moe-<ns>" message below).
//
// This dispatcher never links itself onto PATH — that is bin/moe-install's
// job (see installer-hq-dx). ARCHITECTURE.md §7.1 records the three claimants
// of the bare `moe` name; do not add a fourth without a decision.
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

/** @typedef {{ bin: string, workspace?: string, runner?: "uv" }} NamespaceEntry */

/** @type {Record<string, NamespaceEntry>} */
export const NAMESPACES = {
  crew: { bin: "moe-crew", workspace: "packages/crew/dist/moe-crew.cjs" },
  flight: { bin: "moe-flight", workspace: "packages/flight/dist/cli.js" },
  glass: { bin: "moe-glass", workspace: "packages/glass/dist/index.js" },
  memory: { bin: "moe-memory", workspace: "packages/memory/dist/cli.js" },
  mint: { bin: "moe-mint", workspace: "packages/mint/dist/cli.js" },
  proof: { bin: "moe-proof", runner: "uv" },
  tab: { bin: "moe-tab", workspace: "packages/tab/target/release/moe-tab" },
};

export const USAGE = `moe — one dispatcher in front of seven namespace bins.

usage: moe <namespace> [args...]

namespaces:
  crew     Launch and monitor worker sessions over tmux.
  flight   Drive web/CLI/TUI targets through acceptance criteria and grade them.
  glass    Zero-dependency Chrome DevTools Protocol client (MCP: moe-glass).
  memory   Semantic recall over past sessions and journal entries (MCP: moe-memory).
  mint     Generate native plugin manifests for every harness from one config.
  proof    Evals against small models (Python).
  tab      Price an agent transcript — what the run cost you.

The \`moe-<ns>\` names are permanent: MCP hosts, generated plugin manifests
and scripts reference them directly. \`moe <ns>\` is a human convenience —
either form works. Run \`moe <ns> --help\` for a namespace's own usage.
See ARCHITECTURE.md §7 and §7.1.
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
      return {
        command: "uv",
        args: ["run", "--project", join(root, "py/proof"), entry.bin, ...args],
        source: "workspace-uv",
      };
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
  const pkg = `@bubstack/moe-${ns}`;
  const lines = [
    `moe ${ns}: not installed.`,
    ``,
    `It ships in ${pkg} as \`${entry.bin}\`. Run \`moe-install\` to put it on PATH`,
    `(see bin/moe-install, installer-hq-dx).`,
  ];
  if (root) {
    lines.push(``);
    if (ns === "proof") {
      lines.push(`From this checkout: \`uv run --project py/proof moe-proof …\` (needs uv).`);
    } else if (ns === "tab") {
      lines.push(
        `From this checkout: \`pnpm tab:build\` writes packages/tab/target/release/${entry.bin}.`,
      );
    } else {
      lines.push(`From this checkout: \`pnpm --filter ${pkg} build\`.`);
    }
  }
  return `${lines.join("\n")}\n`;
}

function crewOnWindowsMessage() {
  return (
    `moe crew: tmux is not available on native Windows, so \`crew\` cannot run there.\n` +
    `\n` +
    `Use WSL2. Every other namespace runs on native Windows via cmd-shim;\n` +
    `only \`crew\` needs a POSIX tmux. See ARCHITECTURE.md §6.\n`
  );
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

  if (ns === undefined || ns === "-h" || ns === "--help" || ns === "help") {
    stdout.write(USAGE);
    return 0;
  }

  // crew needs tmux, and native Windows has none. WSL2 is the route — that
  // is settled in ARCHITECTURE.md §6 ("Windows: WSL2, and that is the answer
  // for now"). Every other namespace resolves normally on native Windows.
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
