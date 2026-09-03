#!/usr/bin/env node
import { readdir } from "node:fs/promises";
import { recoverGeneratedOutputs } from "./lib/mint-generation-transaction.mjs";

const journalPattern = /^\.moe-mint-generation-[A-Za-z0-9][A-Za-z0-9_-]{0,127}\.json$/;

async function selectedJournal() {
  const explicit = process.argv[2];
  if (explicit !== undefined) return explicit;
  const names = (await readdir(".")).filter((name) => journalPattern.test(name)).sort();
  if (names.length === 0) return undefined;
  if (names.length !== 1) {
    throw new Error(
      `refusing recovery: found multiple generation journals (${names.join(", ")}); select one explicitly`,
    );
  }
  return names[0];
}

try {
  const journalPath = await selectedJournal();
  if (journalPath !== undefined) {
    await recoverGeneratedOutputs({ journalPath });
    console.log(`Recovered generated outputs from ${journalPath}`);
  }
} catch (error) {
  const detail = error instanceof Error ? error.message : String(error);
  console.error(`Mint recovery failed: ${detail}`);
  process.exitCode = 1;
}
