// @generated — do not edit; see scripts/build-runtime.mjs
import { createRequire as __createRequire } from 'module';
const require = __createRequire(import.meta.url);

// src/summary-sentinel.ts
import * as fs from "node:fs";
var ERROR_MARKER = "__ERRORED__";
var ERROR_MARKER_PREFIX = `${ERROR_MARKER}
`;
var DEFAULT_RETRY_MS = 36e5;
function formatErrorSentinel(error) {
  const message = error instanceof Error ? error.message : String(error);
  return `${ERROR_MARKER}
${(/* @__PURE__ */ new Date()).toISOString()}
${message}
`;
}
function isErroredSentinel(content) {
  return content.startsWith(ERROR_MARKER_PREFIX);
}
function getErrorRetryMs() {
  const raw = process.env.MOE_MEMORY_SUMMARY_ERROR_RETRY_HOURS;
  if (!raw) return DEFAULT_RETRY_MS;
  const hours = parseFloat(raw);
  return Number.isFinite(hours) && hours > 0 ? hours * 36e5 : DEFAULT_RETRY_MS;
}
function hasRealSummary(summaryPath) {
  if (!fs.existsSync(summaryPath)) return false;
  let content;
  try {
    content = fs.readFileSync(summaryPath, "utf-8");
  } catch {
    return false;
  }
  if (content.length === 0) return false;
  if (isErroredSentinel(content)) return false;
  return true;
}
function shouldQueueForSummary(summaryPath) {
  if (!fs.existsSync(summaryPath)) return true;
  let content;
  try {
    content = fs.readFileSync(summaryPath, "utf-8");
  } catch {
    return false;
  }
  if (!isErroredSentinel(content)) return false;
  try {
    const stat = fs.statSync(summaryPath);
    return Date.now() - stat.mtimeMs >= getErrorRetryMs();
  } catch {
    return false;
  }
}

export {
  ERROR_MARKER,
  formatErrorSentinel,
  isErroredSentinel,
  hasRealSummary,
  shouldQueueForSummary
};
