#!/usr/bin/env node

import path from "node:path";
import { pathToFileURL } from "node:url";
import { cleanPackageDist } from "./clean-package-dist.mjs";
import { renderMintFailure } from "./lib/mint-diagnostics.mjs";
import { runMintRecovery } from "./mint-recover.mjs";

// These are the complete runtime roots consumed by artifact composition. Keep
// this list explicit: preparation must never broaden into a package glob.
export const MINT_RUNTIME_PACKAGE_ROOTS = Object.freeze([
  "packages/memory",
  "packages/glass",
  "packages/crew",
  "packages/statusline",
]);

/** Recover first, then empty each runtime dist before Turbo build/cache restore. */
export async function runMintPreparation({ clean = cleanPackageDist, ...recoveryOptions } = {}) {
  const { repositoryRoot, journalPath } = await runMintRecovery(recoveryOptions);
  for (const packageRoot of MINT_RUNTIME_PACKAGE_ROOTS) {
    await clean(path.join(repositoryRoot, packageRoot));
  }
  return { repositoryRoot, journalPath };
}

export async function executeMintPreparationCli(options = {}, io = console) {
  try {
    await runMintPreparation(options);
    return 0;
  } catch (error) {
    io.error(renderMintFailure("Mint preparation", error, "MINT_PREPARATION_FAILED"));
    return 1;
  }
}

const invokedUrl =
  process.argv[1] === undefined ? undefined : pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedUrl === import.meta.url) {
  process.exitCode = await executeMintPreparationCli();
}
