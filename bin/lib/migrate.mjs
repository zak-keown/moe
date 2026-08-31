// MCP-key migration for the two servers this fork renamed:
//
//   episodic-memory  →  moe-memory   (packages/memory)
//   chrome           →  moe-glass    (packages/glass)
//
// The rename is recorded in ARCHITECTURE.md §7 as "a breaking cut, taken
// once". Users on the pre-fork upstream have those old keys in their local
// configs; this module scans for them across the three scopes Claude Code
// documents and REPORTS by default. Actual `claude mcp remove` calls only
// happen with an explicit --apply flag from the CLI wrapper — the
// backlog item is explicit: "Report by default; act only on an explicit
// flag."
//
// Path resolution is deliberately os.homedir()-driven, never a hardcoded
// `~`, per the backlog item's own instruction.

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { platform } from "node:process";

/** The old→new key mapping. Ordered so the report is stable. */
export const RENAMED_MCP_KEYS = [
  { old: "episodic-memory", new: "moe-memory", package: "@bubstack/moe-memory" },
  { old: "chrome", new: "moe-glass", package: "@bubstack/moe-glass" },
];

/**
 * The three scope files Claude Code documents. `user` is the top-level
 * `~/.claude.json` (or `%USERPROFILE%\.claude.json` on Windows); `project`
 * lives in the repo root; `local` lives in `.claude/settings.local.json`.
 * The last two are relative to the caller's cwd — the CLI passes it in
 * rather than assuming.
 */
export function scopeFiles(cwd) {
  const home = homedir();
  // On Windows Claude Code writes to %USERPROFILE% — os.homedir() already
  // returns that on win32, so no branch is needed here.
  const userPath = join(home, ".claude.json");
  const projectPath = join(cwd, ".mcp.json");
  const localPath = join(cwd, ".claude", "settings.local.json");
  return [
    { scope: "user", path: userPath },
    { scope: "project", path: projectPath },
    { scope: "local", path: localPath },
  ];
}

/** Extract mcpServers from a settings file's JSON, tolerating either the
 *  `{ mcpServers: {...} }` shape (Claude Code) or the nested Claude Code
 *  `{ projects: { <path>: { mcpServers } } }` shape found in ~/.claude.json.
 *  Returns [{scopePath, servers}] — one entry per distinct nested location. */
function extractServers(json, filePath) {
  const buckets = [];
  if (json && typeof json === "object") {
    if (json.mcpServers && typeof json.mcpServers === "object") {
      buckets.push({ scopePath: filePath, servers: json.mcpServers });
    }
    // ~/.claude.json can hold per-project mcpServers under `projects.<path>`.
    // Include those too; the report line names the project path so it's
    // clear which one.
    if (json.projects && typeof json.projects === "object") {
      for (const [projectPath, projectEntry] of Object.entries(json.projects)) {
        if (projectEntry && typeof projectEntry === "object" && projectEntry.mcpServers) {
          buckets.push({
            scopePath: `${filePath} › projects.${projectPath}`,
            servers: projectEntry.mcpServers,
          });
        }
      }
    }
  }
  return buckets;
}

/**
 * Find every renamed key in every scope file. Returns findings, one per
 * (scope, file, oldKey) triple, with:
 *   - scope: "user" | "project" | "local"
 *   - path: the resolved file path
 *   - oldKey: e.g. "episodic-memory"
 *   - newKey: e.g. "moe-memory"
 *   - command: the `claude mcp remove` line the user should run
 *   - note: any qualifier (nested under projects.<path>)
 */
export function findRenamedKeys(cwd) {
  const findings = [];
  for (const { scope, path } of scopeFiles(cwd)) {
    if (!existsSync(path)) continue;
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(path, "utf8"));
    } catch {
      // A malformed settings file is a user problem the migration cannot
      // safely edit; skip it and let the doctor's report line surface it.
      continue;
    }
    for (const bucket of extractServers(parsed, path)) {
      for (const { old: oldKey, new: newKey, package: pkg } of RENAMED_MCP_KEYS) {
        if (Object.hasOwn(bucket.servers, oldKey)) {
          findings.push({
            scope,
            path: bucket.scopePath,
            oldKey,
            newKey,
            package: pkg,
            command: `claude mcp remove ${oldKey} --scope ${scope}`,
          });
        }
      }
    }
  }
  return findings;
}

/** Render findings as a human-readable report. */
export function renderMigrationReport(findings) {
  if (findings.length === 0) {
    return "No renamed MCP keys found. Nothing to migrate.";
  }
  const lines = [
    `Found ${findings.length} renamed MCP key${findings.length === 1 ? "" : "s"}.`,
    "These keys were renamed by the Moe fork; the old names still work only against pre-fork upstream:",
    "",
  ];
  for (const f of findings) {
    lines.push(`- ${f.oldKey}  →  ${f.newKey}   (scope: ${f.scope})`);
    lines.push(`  in ${f.path}`);
    lines.push(`  remove old:  ${f.command}`);
    lines.push(
      `  install new: claude plugin install ${f.newKey}@moe   # (installed via ${f.package})`,
    );
    lines.push("");
  }
  lines.push(
    "Re-run with --apply to have moe-install execute the `claude mcp remove` commands for you.",
  );
  lines.push("Nothing has been changed. --migrate reports by default.");
  return lines.join("\n");
}

/** Test hook: expose the platform check so a smoke test can assert
 *  os.homedir()-based resolution without shelling out. */
export const _platform = platform;
