import { constants } from "node:fs";
import { access, readdir, stat } from "node:fs/promises";
import { delimiter, join } from "node:path";

/**
 * @typedef {object} HarnessDiscovery
 * @property {string} harness
 * @property {"ready" | "not-evaluated"} status
 * @property {string} [sessionRoot]
 * @property {string} [cwd]
 * @property {string} [reason]
 */

/**
 * @typedef {object} DiscoveryReport
 * @property {number} cutoffMs
 * @property {HarnessDiscovery[]} harnesses
 */

const SUPPORTED = ["claude", "codex"];
const KNOWN = [
  "claude",
  "codex",
  "cursor",
  "copilot",
  "gemini",
  "kimi",
  "opencode",
  "pi",
];
const COMMANDS = {
  claude: ["claude"],
  codex: ["codex"],
  cursor: ["cursor-agent", "cursor"],
  copilot: ["copilot", "github-copilot"],
  gemini: ["gemini"],
  kimi: ["kimi"],
  opencode: ["opencode"],
  pi: ["pi"],
};

/**
 * @param {object} options
 * @param {Record<string, string | undefined>} options.env
 * @param {string} options.homeDir
 * @param {string} options.cwd
 * @param {{ access: typeof access, readdir: typeof readdir, stat: typeof stat }} [options.fsOps]
 * @param {Set<string>} [options.detectedCommands]
 * @param {number} [options.nowMs]
 * @param {number} [options.days]
 * @returns {Promise<DiscoveryReport>}
 */
export async function discoverHarnesses({
  env,
  homeDir,
  cwd,
  fsOps = { access, readdir, stat },
  detectedCommands = new Set(),
  nowMs = Date.now(),
  days = 30,
}) {
  if (!Number.isInteger(days) || days < 1 || days > 365) {
    throw new TypeError("days must be an integer from 1 to 365");
  }
  const roots = {
    claude: join(env.CLAUDE_CONFIG_DIR || join(homeDir, ".claude"), "projects"),
    codex: join(env.CODEX_HOME || join(homeDir, ".codex"), "sessions"),
    cursor: join(homeDir, ".cursor"),
    copilot: join(env.XDG_CONFIG_HOME || join(homeDir, ".config"), "github-copilot"),
    gemini: join(homeDir, ".gemini"),
    kimi: join(homeDir, ".kimi"),
    opencode: join(env.XDG_CONFIG_HOME || join(homeDir, ".config"), "opencode"),
    pi: join(homeDir, ".pi"),
  };
  const harnesses = [];
  for (const harness of KNOWN) {
    const installed =
      detectedCommands.has(harness) ||
      COMMANDS[harness].some((command) => detectedCommands.has(command)) ||
      (await exists(fsOps, roots[harness])) ||
      (await commandExists(fsOps, env.PATH, COMMANDS[harness]));
    if (!installed) continue;
    harnesses.push(
      SUPPORTED.includes(harness)
        ? { harness, status: "ready", sessionRoot: roots[harness], cwd }
        : {
            harness,
            status: "not-evaluated",
            reason: "no locally validated adapter",
          },
    );
  }
  return { cutoffMs: nowMs - days * 86_400_000, harnesses };
}

async function exists(fsOps, path) {
  try {
    await fsOps.access(path);
    return true;
  } catch {
    return false;
  }
}

async function commandExists(fsOps, pathValue, commands) {
  if (typeof pathValue !== "string" || pathValue.length === 0) return false;
  for (const directory of pathValue.split(delimiter).filter(Boolean)) {
    for (const command of commands) {
      try {
        await fsOps.access(join(directory, command), constants.X_OK);
        return true;
      } catch {
        // Best-effort local detection continues through every known path.
      }
    }
  }
  return false;
}
