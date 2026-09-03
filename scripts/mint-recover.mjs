#!/usr/bin/env node
import { readdir } from "node:fs/promises";
import path from "node:path";
import { recoverGeneratedOutputs } from "./lib/mint-generation-transaction.mjs";

const journalPattern = /^\.moe-mint-generation-[A-Za-z0-9][A-Za-z0-9_-]{0,127}\.json$/;

function invocation() {
  const args = process.argv.slice(2);
  let repositoryRoot = process.cwd();
  if (args[0] === "--root") {
    if (args[1] === undefined) throw new Error("--root requires a repository path");
    repositoryRoot = args[1];
    args.splice(0, 2);
  }
  if (args.length > 1) throw new Error("recovery accepts at most one explicit journal path");
  return { repositoryRoot: path.resolve(repositoryRoot), explicitJournal: args[0] };
}

async function selectedJournal(explicit) {
  const names = (await readdir(".")).filter((name) => journalPattern.test(name)).sort();
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

function renderFailure(error) {
  const detail = error instanceof Error ? error : new Error(String(error));
  const lines = [
    "Mint recovery failed",
    `code: ${typeof detail.code === "string" ? detail.code : "GENERATION_TRANSACTION_CLI_FAILED"}`,
    `message: ${detail.message}`,
  ];
  if (Array.isArray(detail.paths) && detail.paths.length > 0)
    lines.push(`paths: ${detail.paths.join(", ")}`);
  if (typeof detail.action === "string") lines.push(`action: ${detail.action}`);
  if (detail.cause instanceof Error) lines.push(`cause: ${detail.cause.message}`);
  return lines.join("\n");
}

try {
  const { repositoryRoot, explicitJournal } = invocation();
  process.chdir(repositoryRoot);
  const journalPath = await selectedJournal(explicitJournal);
  if (journalPath !== undefined) {
    await recoverGeneratedOutputs({ journalPath });
    console.log(`Recovered generated outputs from ${journalPath}`);
  }
} catch (error) {
  console.error(renderFailure(error));
  process.exitCode = 1;
}
