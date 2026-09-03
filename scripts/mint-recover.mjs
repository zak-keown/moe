#!/usr/bin/env node
import { readdir } from "node:fs/promises";
import { recoverGeneratedOutputs } from "./lib/mint-generation-transaction.mjs";

const journalPattern = /^\.moe-mint-generation-[A-Za-z0-9][A-Za-z0-9_-]{0,127}\.json$/;

async function selectedJournal() {
  const explicit = process.argv[2];
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
  const journalPath = await selectedJournal();
  if (journalPath !== undefined) {
    await recoverGeneratedOutputs({ journalPath });
    console.log(`Recovered generated outputs from ${journalPath}`);
  }
} catch (error) {
  console.error(renderFailure(error));
  process.exitCode = 1;
}
