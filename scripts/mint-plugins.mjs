#!/usr/bin/env node

/**
 * Root artifact assembly wrapper.
 *
 * Resolves one platform, assembles and validates all artifacts and projections,
 * then promotes the coherent generation through the durable transaction.
 */

import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  createGenerationTransaction,
  replaceGeneratedOutputs,
  writeDurableFile,
} from "./lib/mint-generation-transaction.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MINT_DIST = path.join(ROOT, "packages/mint/dist");

function fail(message) {
  console.error(`mint-plugins: ${message}`);
  process.exit(1);
}

function validateHostContract() {
  const major = Number.parseInt(process.versions.node.split(".")[0] ?? "", 10);
  if (!Number.isInteger(major) || major < 24) {
    throw new Error(`Node 24 or newer is required (running ${process.versions.node})`);
  }
  process.chdir(ROOT);
}

async function removePreparedOutputs(transaction) {
  await Promise.all(
    transaction.journal.targets.map((target) => rm(target.next, { recursive: true, force: true })),
  );
}

async function main() {
  validateHostContract();
  if (!fs.existsSync(path.join(MINT_DIST, "artifact/assemble.js"))) {
    fail("packages/mint/dist/artifact/assemble.js not found — build @bubstack/moe-mint first");
  }
  const [{ resolvePlatform }, { assembleArtifactSet }, projections] = await Promise.all([
    import(pathToFileURL(path.join(MINT_DIST, "platform/load.js")).href),
    import(pathToFileURL(path.join(MINT_DIST, "artifact/assemble.js")).href),
    import(pathToFileURL(path.join(MINT_DIST, "platform/projections.js")).href),
  ]);
  const platform = await resolvePlatform(ROOT);
  const nonce = randomUUID().replaceAll("-", "");
  const transaction = createGenerationTransaction(nonce);
  const destinationRoot = path.join(ROOT, transaction.journal.targets[0].next);
  let replacementStarted = false;
  try {
    await removePreparedOutputs(transaction);
    const artifacts = await assembleArtifactSet({ repoRoot: ROOT, platform, destinationRoot });
    const records = artifacts.map((artifact) => artifact.projection);
    const marketplace = projections.renderMarketplace(platform, records);
    const catalog = projections.renderPublicCatalog(platform, records);
    projections.resolvePublishMatrix(platform, records);
    await writeDurableFile(transaction.journal.targets[1].next, marketplace);
    await writeDurableFile(transaction.journal.targets[2].next, catalog);
    replacementStarted = true;
    await replaceGeneratedOutputs(transaction);
    for (const artifact of artifacts) console.log(`${artifact.plugin.id.padEnd(16)} complete`);
    console.log(`\n${artifacts.length} plugins assembled, preflighted, and installed coherently.`);
  } catch (error) {
    if (!replacementStarted || !fs.existsSync(transaction.journalPath)) {
      await removePreparedOutputs(transaction);
    }
    throw error;
  }
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
