import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/**
 * SessionStart hook: gives a fresh Claude Code install a working statusline
 * with zero user action, by pointing settings.json's `statusLine` at the
 * vendored ccstatusline bundle — but only when the user has not already set
 * one. Claude Code plugins cannot declare `statusLine` themselves (unlike
 * hooks or MCP servers), so this is the only automatic path available; never
 * overwriting an existing value is what keeps that automation safe.
 */

export interface EnsureStatusLineOptions {
  settingsPath: string;
  vendoredScriptPath: string;
}

export interface EnsureStatusLineResult {
  wrote: boolean;
  reason: "written" | "already-set" | "unreadable-settings";
}

function readSettings(path: string): Record<string, unknown> | null {
  if (!existsSync(path)) return {};
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return null;
  }
  if (raw.trim().length === 0) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

export function ensureStatusLine(opts: EnsureStatusLineOptions): EnsureStatusLineResult {
  const settings = readSettings(opts.settingsPath);
  if (settings === null) return { wrote: false, reason: "unreadable-settings" };
  if (settings.statusLine !== undefined) return { wrote: false, reason: "already-set" };

  settings.statusLine = {
    type: "command",
    command: `node "${opts.vendoredScriptPath}"`,
    padding: 0,
  };

  mkdirSync(dirname(opts.settingsPath), { recursive: true });
  writeFileSync(opts.settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
  return { wrote: true, reason: "written" };
}

function defaultSettingsPath(): string {
  return join(homedir(), ".claude", "settings.json");
}

/**
 * Reads all of stdin, resolving the empty string on a 5s timeout. Claude Code
 * pipes the SessionStart payload regardless of whether the hook reads it;
 * without the timeout a caller that never closes stdin would hang this
 * process forever (the same issue moe-crew's hook hit — see its emit-event.ts).
 */
function readStdin(timeoutMs = 5000): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    let done = false;
    const finish = (value: string) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => finish(data), timeoutMs);
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => finish(data));
    process.stdin.on("error", () => finish(data));
  });
}

async function main(): Promise<void> {
  await readStdin();

  // Never block session startup: no plugin root, no vendored path to point
  // at, so no-op rather than guess.
  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT;
  if (pluginRoot === undefined || pluginRoot.length === 0) {
    process.exit(0);
  }

  try {
    const result = ensureStatusLine({
      settingsPath: defaultSettingsPath(),
      vendoredScriptPath: join(pluginRoot, "vendor/ccstatusline/ccstatusline.js"),
    });
    // Only the first, actual write is worth a line — repeating it every
    // session (the "already-set" case fires on every subsequent startup)
    // would inject noise into every session's context forever.
    if (result.reason === "written") {
      process.stdout.write("Moe: configured the Claude Code statusline (ccstatusline).\n");
    }
  } catch {
    // Never block session startup on a config-write failure.
  }
  process.exit(0);
}

// Run main() only when executed as the bundled hook (`node dist/ensure-statusline.cjs`).
// In the tsup CJS bundle `require.main === module` is true only then; under
// vitest's ESM import of this source `module`/`require` are not the CJS
// entry, so main() does not fire and no stdin read happens during tests.
if (typeof require !== "undefined" && typeof module !== "undefined" && require.main === module) {
  void main();
}
