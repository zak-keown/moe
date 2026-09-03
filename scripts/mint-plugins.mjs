#!/usr/bin/env node

/**
 * Root artifact assembly wrapper.
 *
 * Task 5 deliberately stops after producing a completely preflighted sibling
 * tree. Task 7 adds the recover/render/swap transaction around this same Mint
 * API; canonical plugins and projections are not touched here.
 */

import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MINT_DIST = path.join(ROOT, "packages/mint/dist");

function fail(message) {
  console.error(`mint-plugins: ${message}`);
  process.exit(1);
}

async function main() {
  if (!fs.existsSync(path.join(MINT_DIST, "artifact/assemble.js"))) {
    fail("packages/mint/dist/artifact/assemble.js not found — build @bubstack/moe-mint first");
  }
  const [{ resolvePlatform }, { assembleArtifactSet }] = await Promise.all([
    import(pathToFileURL(path.join(MINT_DIST, "platform/load.js")).href),
    import(pathToFileURL(path.join(MINT_DIST, "artifact/assemble.js")).href),
  ]);
  const platform = await resolvePlatform(ROOT);
  const nonce = randomUUID().replaceAll("-", "");
  const destinationRoot = path.join(ROOT, `plugins.next-${nonce}`);
  const artifacts = await assembleArtifactSet({ repoRoot: ROOT, platform, destinationRoot });
  for (const artifact of artifacts) console.log(`${artifact.plugin.id.padEnd(16)} complete`);
  console.log(
    `\n${artifacts.length} plugins assembled and preflighted in ${path.relative(ROOT, destinationRoot)}/`,
  );
  console.log(
    "Canonical plugins and projections are unchanged; Task 7 owns the transaction-backed replacement.",
  );
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
