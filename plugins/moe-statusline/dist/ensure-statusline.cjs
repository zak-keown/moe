#!/usr/bin/env node
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/hooks/ensure-statusline.ts
var ensure_statusline_exports = {};
__export(ensure_statusline_exports, {
  ensureStatusLine: () => ensureStatusLine
});
module.exports = __toCommonJS(ensure_statusline_exports);
var import_node_fs = require("fs");
var import_node_os = require("os");
var import_node_path = require("path");
function readSettings(path) {
  if (!(0, import_node_fs.existsSync)(path)) return {};
  let raw;
  try {
    raw = (0, import_node_fs.readFileSync)(path, "utf8");
  } catch {
    return null;
  }
  if (raw.trim().length === 0) return {};
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}
function ensureStatusLine(opts) {
  const settings = readSettings(opts.settingsPath);
  if (settings === null) return { wrote: false, reason: "unreadable-settings" };
  if (settings.statusLine !== void 0) return { wrote: false, reason: "already-set" };
  settings.statusLine = {
    type: "command",
    command: `node "${opts.vendoredScriptPath}"`,
    padding: 0
  };
  (0, import_node_fs.mkdirSync)((0, import_node_path.dirname)(opts.settingsPath), { recursive: true });
  (0, import_node_fs.writeFileSync)(opts.settingsPath, `${JSON.stringify(settings, null, 2)}
`);
  return { wrote: true, reason: "written" };
}
function defaultSettingsPath() {
  return (0, import_node_path.join)((0, import_node_os.homedir)(), ".claude", "settings.json");
}
function readStdin(timeoutMs = 5e3) {
  return new Promise((resolve) => {
    let data = "";
    let done = false;
    const finish = (value) => {
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
async function main() {
  await readStdin();
  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT;
  if (pluginRoot === void 0 || pluginRoot.length === 0) {
    process.exit(0);
  }
  try {
    const result = ensureStatusLine({
      settingsPath: defaultSettingsPath(),
      vendoredScriptPath: (0, import_node_path.join)(pluginRoot, "vendor/ccstatusline/ccstatusline.js")
    });
    if (result.reason === "written") {
      process.stdout.write("Moe: configured the Claude Code statusline (ccstatusline).\n");
    }
  } catch {
  }
  process.exit(0);
}
if (typeof require !== "undefined" && typeof module !== "undefined" && require.main === module) {
  void main();
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ensureStatusLine
});
