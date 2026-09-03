#!/usr/bin/env node
/** Thin wrapper over compiled Mint's artifact-check for `pnpm artifact:check`. */

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mintDist = path.join(ROOT, "packages/mint/dist");

const { checkArtifactSet } = await import(
  pathToFileURL(path.join(mintDist, "artifact/check.js")).href
);

const { results, problems } = await checkArtifactSet(ROOT);

for (const r of results) {
  console.log(
    `${r.plugin}: ${r.files} files, ${r.tarballBytes} bytes packed, digest ${r.treeDigest.slice(0, 12)}…`,
  );
}

if (problems.length > 0) {
  console.error(`\nartifact check: ${problems.length} problem(s)`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

console.log(`\nartifact check: all ${results.length} plugins validated`);
