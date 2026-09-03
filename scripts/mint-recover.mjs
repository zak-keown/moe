#!/usr/bin/env node
import { readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { renderMintFailure } from "./lib/mint-diagnostics.mjs";
import { recoverGeneratedOutputs } from "./lib/mint-generation-transaction.mjs";
import { validateMintHostContract } from "./lib/mint-host-contract.mjs";

const journalPattern = /^\.moe-mint-generation-[A-Za-z0-9][A-Za-z0-9_-]{0,127}\.json$/;

function invocation(args, currentDirectory) {
  const remaining = [...args];
  let repositoryRoot = currentDirectory;
  if (remaining[0] === "--root") {
    if (remaining[1] === undefined) throw new Error("--root requires a repository path");
    repositoryRoot = remaining[1];
    remaining.splice(0, 2);
  }
  if (remaining.length > 1) throw new Error("recovery accepts at most one explicit journal path");
  return { repositoryRoot: path.resolve(repositoryRoot), explicitJournal: remaining[0] };
}

async function selectedJournal(explicit, readDirectory = readdir) {
  const names = (await readDirectory(".")).filter((name) => journalPattern.test(name)).sort();
  if (names.length !== 1) {
    if (names.length === 0 && explicit !== undefined) return explicit;
    if (names.length === 0) return undefined;
    const error = new Error(
      `refusing recovery: found multiple generation journals (${names.join(", ")})`,
    );
    error.code = "GENERATION_TRANSACTION_MULTIPLE_JOURNALS";
    error.paths = names;
    error.action = "preserve every journal and reconcile the shared generated outputs manually";
    throw error;
  }
  if (explicit !== undefined && explicit !== names[0]) {
    const error = new Error(
      `refusing recovery: explicit journal ${explicit} does not match discovered journal ${names[0]}`,
    );
    error.code = "GENERATION_TRANSACTION_JOURNAL_SELECTION_CONFLICT";
    error.paths = [names[0], explicit];
    error.action = "recover the discovered durable journal before selecting another transaction";
    throw error;
  }
  return explicit ?? names[0];
}

export async function runMintRecovery({
  nodeVersion = process.versions.node,
  platform = process.platform,
  args = process.argv.slice(2),
  currentDirectory = process.cwd(),
  chdir = process.chdir,
  discoverJournal = selectedJournal,
  recover = recoverGeneratedOutputs,
  log = console.log,
} = {}) {
  // This must be the first operation: unsupported hosts cannot inspect a
  // journal or enter the mutation protocol merely because recovery runs first.
  validateMintHostContract({ nodeVersion, platform });
  const { repositoryRoot, explicitJournal } = invocation(args, currentDirectory);
  chdir(repositoryRoot);
  const journalPath = await discoverJournal(explicitJournal);
  if (journalPath !== undefined) {
    await recover({ journalPath });
    log(`Recovered generated outputs from ${journalPath}`);
  }
  return { repositoryRoot, journalPath };
}

export async function executeMintRecoveryCli(options = {}, io = console) {
  try {
    await runMintRecovery(options);
    return 0;
  } catch (error) {
    io.error(renderMintFailure("Mint recovery", error, "GENERATION_TRANSACTION_CLI_FAILED"));
    return 1;
  }
}

const invokedUrl =
  process.argv[1] === undefined ? undefined : pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedUrl === import.meta.url) {
  process.exitCode = await executeMintRecoveryCli();
}
