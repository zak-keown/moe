// @generated — do not edit; see scripts/build-runtime.mjs
import { createRequire as __createRequire } from 'module';
const require = __createRequire(import.meta.url);
import {
  getMemoryDataDir
} from "./chunk-YFLZKW2J.js";

// src/logging.ts
import fs from "node:fs";
import path from "node:path";
function getLogDir() {
  const dir = path.join(getMemoryDataDir(), "logs");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}
function getSyncLogPath() {
  return path.join(getLogDir(), "moe-memory.log");
}
function formatLogLine(level, message) {
  return `${(/* @__PURE__ */ new Date()).toISOString()} [${level}] ${message}
`;
}

export {
  getSyncLogPath,
  formatLogLine
};
