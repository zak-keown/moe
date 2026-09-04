// @generated — do not edit; see scripts/build-runtime.mjs
import { createRequire as __createRequire } from 'module';
const require = __createRequire(import.meta.url);

// src/codex-support.ts
var MIN_CODEX_VERSION = "0.152.1";
function parseCodexCliVersion(output) {
  return output.match(/\b(\d+\.\d+\.\d+)\b/)?.[1];
}
function compareSemver(a, b) {
  const aParts = a.split(".").map((part) => Number.parseInt(part, 10));
  const bParts = b.split(".").map((part) => Number.parseInt(part, 10));
  for (let i = 0; i < 3; i++) {
    const aRaw = aParts[i];
    const bRaw = bParts[i];
    const aPart = aRaw !== void 0 && Number.isFinite(aRaw) ? aRaw : 0;
    const bPart = bRaw !== void 0 && Number.isFinite(bRaw) ? bRaw : 0;
    if (aPart !== bPart) {
      return aPart - bPart;
    }
  }
  return 0;
}
function versionMeetsMinimum(version, minimum = MIN_CODEX_VERSION) {
  return compareSemver(version, minimum) >= 0;
}
function codexVersionRequirementMessage(versionOutput) {
  const version = parseCodexCliVersion(versionOutput);
  if (!version) {
    return `Codex summarization requires codex-cli >= ${MIN_CODEX_VERSION}; unable to parse version from: ${versionOutput.trim() || "(empty output)"}`;
  }
  return `Codex summarization requires codex-cli >= ${MIN_CODEX_VERSION}; found ${version}. Run codex update and retry.`;
}

export {
  MIN_CODEX_VERSION,
  parseCodexCliVersion,
  versionMeetsMinimum,
  codexVersionRequirementMessage
};
