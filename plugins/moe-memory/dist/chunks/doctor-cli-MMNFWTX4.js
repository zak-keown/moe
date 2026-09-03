// @generated — do not edit; see scripts/build-runtime.mjs
import { createRequire as __createRequire } from 'module';
const require = __createRequire(import.meta.url);
import {
  getSyncLogPath
} from "./chunk-KB33ZOJX.js";
import {
  getCodexDir,
  getDbPath,
  getMemoryDataDir
} from "./chunk-YFLZKW2J.js";
import {
  MIN_CODEX_VERSION,
  parseCodexCliVersion,
  versionMeetsMinimum
} from "./chunk-KVDJIHLR.js";
import "./chunk-XRZM5UX2.js";

// src/doctor-cli.ts
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// src/codex-hook-trust.ts
import { spawn } from "node:child_process";
import readline from "node:readline";
function isRecord(value) {
  return typeof value === "object" && value !== null;
}
function hookBelongsToMoeMemory(hook) {
  const pluginId = typeof hook.pluginId === "string" ? hook.pluginId : "";
  const key = typeof hook.key === "string" ? hook.key : "";
  return pluginId.startsWith("moe-memory@") || key.startsWith("moe-memory@");
}
function trustStateFromHooksList(result) {
  if (!isRecord(result) || !Array.isArray(result.data)) {
    return "unknown";
  }
  const matchingHooks = [];
  for (const entry of result.data) {
    if (!isRecord(entry) || !Array.isArray(entry.hooks)) continue;
    for (const hook of entry.hooks) {
      if (isRecord(hook) && hookBelongsToMoeMemory(hook)) {
        matchingHooks.push(hook);
      }
    }
  }
  if (matchingHooks.length === 0) {
    return "not_found";
  }
  const trustStates = matchingHooks.map((hook) => hook.trustStatus ?? hook.trust ?? hook.trust_status).filter((trust) => typeof trust === "string");
  if (trustStates.includes("trusted") || trustStates.includes("managed")) {
    return "trusted";
  }
  if (trustStates.includes("modified")) {
    return "modified";
  }
  if (trustStates.includes("untrusted")) {
    return "untrusted";
  }
  return "unknown";
}
async function detectCodexHookTrustState(codexHome, cwd, timeoutMs = 1e4) {
  const child = spawn("codex", ["app-server"], {
    env: { ...process.env, CODEX_HOME: codexHome },
    stdio: ["pipe", "pipe", "ignore"]
  });
  const rl = readline.createInterface({ input: child.stdout });
  const pending = /* @__PURE__ */ new Map();
  let nextId = 1;
  child.on("error", (error) => {
    for (const entry of pending.values()) {
      entry.reject(error);
    }
    pending.clear();
  });
  rl.on("line", (line) => {
    if (!line.trim()) return;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    if (typeof message.id !== "number") return;
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    if (message.error) {
      entry.reject(new Error(JSON.stringify(message.error)));
    } else {
      entry.resolve(message.result);
    }
  });
  const send = (method, params) => {
    const id = nextId++;
    child.stdin.write(`${JSON.stringify({ id, method, params })}
`);
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
    });
  };
  const notify = (method) => {
    child.stdin.write(`${JSON.stringify({ method })}
`);
  };
  const timeout = setTimeout(() => {
    child.kill("SIGTERM");
    for (const entry of pending.values()) {
      entry.reject(new Error("timed out inspecting Codex hooks"));
    }
    pending.clear();
  }, timeoutMs);
  try {
    await send("initialize", {
      clientInfo: { name: "moe-memory-doctor", version: "0.0.0" },
      capabilities: { experimentalApi: true }
    });
    notify("initialized");
    const hooksList = await send("hooks/list", { cwds: [cwd] });
    return trustStateFromHooksList(hooksList);
  } catch {
    return "unknown";
  } finally {
    clearTimeout(timeout);
    rl.close();
    child.kill("SIGTERM");
  }
}

// src/doctor.ts
function parseFeatureState(featuresOutput, feature) {
  const line = featuresOutput.split(/\r?\n/).map((entry) => entry.trim()).find((entry) => entry.startsWith(`${feature} `));
  if (!line) {
    return void 0;
  }
  const lastColumn = line.split(/\s+/).at(-1);
  if (lastColumn === "true") return true;
  if (lastColumn === "false") return false;
  return void 0;
}
function parseMcpState(mcpListOutput) {
  const line = mcpListOutput.split(/\r?\n/).map((entry) => entry.trim()).find((entry) => entry.startsWith("moe-memory "));
  if (!line) {
    return "missing";
  }
  return line.includes(" enabled") ? "enabled" : "disabled";
}
function formatHookTrustState(hookTrustState) {
  switch (hookTrustState) {
    case "trusted":
      return "trusted";
    case "untrusted":
      return "untrusted; open /hooks in Codex, review the Moe Memory hook, and press t to trust it.";
    case "modified":
      return "modified since it was trusted; open /hooks in Codex, review the Moe Memory hook, and press t to trust it again.";
    case "not_found":
      return "not found; confirm the Moe Memory plugin is installed and enabled.";
    case "unknown":
      return "unknown; could not inspect Codex hooks. Open /hooks in Codex to verify trust.";
  }
}
function buildCodexDoctorReport(inputs) {
  const version = parseCodexCliVersion(inputs.codexVersionOutput);
  const versionOk = version !== void 0 && versionMeetsMinimum(version);
  const pluginHooksEnabled = parseFeatureState(inputs.featuresOutput, "plugin_hooks");
  const pluginsEnabled = parseFeatureState(inputs.featuresOutput, "plugins");
  const mcpState = parseMcpState(inputs.mcpListOutput);
  const issues = [];
  if (!versionOk) {
    issues.push(`Codex must be upgraded with codex update (minimum ${MIN_CODEX_VERSION}).`);
  }
  if (pluginsEnabled === false) {
    issues.push("Codex plugins are disabled; run codex features enable plugins.");
  }
  if (pluginHooksEnabled === false) {
    issues.push("Codex plugin hooks are disabled; run codex features enable plugin_hooks.");
  }
  if (!inputs.sessionsDirExists) {
    issues.push("Codex sessions directory does not exist yet; start at least one Codex session.");
  }
  if (mcpState !== "enabled") {
    issues.push("Moe Memory MCP server is not enabled in codex mcp list.");
  }
  if (inputs.hookTrustState === "untrusted" || inputs.hookTrustState === "modified") {
    issues.push(
      "Moe Memory Codex hook is not trusted; open /hooks in Codex and press t to trust it."
    );
  } else if (inputs.hookTrustState === "not_found") {
    issues.push(
      "Moe Memory Codex hook was not found; confirm the plugin is installed and enabled."
    );
  } else if (inputs.hookTrustState === "unknown") {
    issues.push("Moe Memory Codex hook trust could not be verified.");
  }
  const lines = [
    "Moe Memory Codex Doctor",
    "================================",
    "",
    `Codex version: ${inputs.codexVersionOutput.trim() || "(not found)"} ${versionOk ? `(ok; minimum ${MIN_CODEX_VERSION})` : `(requires minimum ${MIN_CODEX_VERSION})`}`,
    `Codex home: ${inputs.codexHome}`,
    `Codex sessions: ${inputs.sessionsDirExists ? "found" : "missing"}`,
    `Plugins feature: ${pluginsEnabled === true ? "enabled" : pluginsEnabled === false ? "disabled" : "unknown"}`,
    `Plugin hooks feature: ${pluginHooksEnabled === true ? "enabled" : pluginHooksEnabled === false ? "disabled" : "unknown"}`,
    `Moe Memory MCP: ${mcpState}`,
    `Index database: ${inputs.dbPath}`,
    `Hook/background sync log: ${inputs.logPath}`,
    "",
    `Hook trust: ${formatHookTrustState(inputs.hookTrustState)}`
  ];
  if (issues.length > 0) {
    lines.push("", "Issues:");
    for (const issue of issues) {
      lines.push(`- ${issue}`);
    }
  }
  return {
    ok: issues.length === 0,
    text: `${lines.join("\n")}
`
  };
}

// src/doctor-cli.ts
function capture(command, args) {
  const result = spawnSync(command, args, {
    encoding: "utf-8",
    timeout: 1e4
  });
  return `${result.stdout || ""}${result.stderr || ""}`.trim();
}
function showHelp() {
  console.log(`Usage: moe-memory doctor codex

Diagnose the local Codex plugin, hook, MCP, archive, and index setup.`);
}
async function runDoctor(args) {
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
    hookTrustState
  });
  process.stdout.write(report.text);
  process.stdout.write(`Data directory: ${getMemoryDataDir()}
`);
  return report.ok ? 0 : 1;
}
export {
  runDoctor
};
