import { access, readdir, stat } from "node:fs/promises";
import { join } from "node:path";

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
  };
  const harnesses = [];
  for (const harness of KNOWN) {
    const installed =
      detectedCommands.has(harness) ||
      (SUPPORTED.includes(harness) && (await exists(fsOps, roots[harness])));
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
