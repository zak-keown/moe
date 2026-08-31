/** `moe-memory doctor codex` — diagnose the local Codex plugin/hook/MCP setup. */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { detectCodexHookTrustState } from "./codex-hook-trust.js";
import { buildCodexDoctorReport } from "./doctor.js";
import { getSyncLogPath } from "./logging.js";
import { findLegacyDataDir, getCodexDir, getDbPath, getMemoryDataDir } from "./paths.js";

function capture(command: string, args: string[]): string {
  const result = spawnSync(command, args, {
    encoding: "utf-8",
    timeout: 10000,
  });
  return `${result.stdout || ""}${result.stderr || ""}`.trim();
}

function showHelp(): void {
  console.log(`Usage: moe-memory doctor codex

Diagnose the local Codex plugin, hook, MCP, archive, and index setup.`);
}

export async function runDoctor(args: string[]): Promise<number> {
  const target = args[0];
  if (target !== "codex") {
    showHelp();
    return target ? 1 : 0;
  }

  const codexHome = getCodexDir();
  const hookTrustState = await detectCodexHookTrustState(codexHome, process.cwd());
  const report = buildCodexDoctorReport({
    codexVersionOutput: capture("codex", ["--version"]),
    featuresOutput: capture("codex", ["features", "list"]),
    mcpListOutput: capture("codex", ["mcp", "list"]),
    codexHome,
    sessionsDirExists: fs.existsSync(path.join(codexHome, "sessions")),
    logPath: getSyncLogPath(),
    dbPath: getDbPath(),
    hookTrustState,
  });

  process.stdout.write(report.text);
  process.stdout.write(`Data directory: ${getMemoryDataDir()}\n`);

  // The data directory moved on the fork and there is no migration. If the
  // upstream one is still on disk, say where it is rather than reporting an
  // empty index.
  const legacy = findLegacyDataDir();
  if (legacy) {
    process.stdout.write(
      `Legacy upstream index: ${legacy} (not read by Moe Memory; see packages/memory/README.md)\n`,
    );
  }

  return report.ok ? 0 : 1;
}
