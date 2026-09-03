// @generated — do not edit; see scripts/build-runtime.mjs
import { createRequire as __createRequire } from 'module';
const require = __createRequire(import.meta.url);

// src/installed-package-root.ts
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
var KNOWN_ENTRYPOINTS = /* @__PURE__ */ new Set(["index.js", "cli.js", "index.ts", "cli.ts"]);
function resolveInstalledPackageRoot(entrypointUrl) {
  const url = typeof entrypointUrl === "string" ? new URL(entrypointUrl) : entrypointUrl;
  const filePath = fileURLToPath(url);
  const file = basename(filePath);
  if (!KNOWN_ENTRYPOINTS.has(file)) {
    throw new Error(
      `resolveInstalledPackageRoot requires a known entrypoint (${[...KNOWN_ENTRYPOINTS].join(", ")}), got: ${file}`
    );
  }
  const dir = dirname(filePath);
  const dirName = basename(dir);
  if (dirName === "dist" || dirName === "src") {
    return resolve(dir, "..");
  }
  return dir;
}

export {
  resolveInstalledPackageRoot
};
