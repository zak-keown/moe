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
import { renderMintFailure } from "./lib/mint-diagnostics.mjs";
import {
  createGenerationTransaction,
  replaceGeneratedOutputs,
  writeDurableFile,
} from "./lib/mint-generation-transaction.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function operationalError(code, message, { paths = [], action, cause } = {}) {
  const error = new Error(message, cause === undefined ? undefined : { cause });
  error.code = code;
  error.paths = paths;
  error.action = action;
  return error;
}

/**
 * Contributor generation relies on POSIX filesystem semantics. WSL2 reports
 * `linux`; native Windows reports `win32` and must use WSL2 instead.
 */
export function validateHostContract({
  nodeVersion = process.versions.node,
  platform = process.platform,
  repositoryRoot = ROOT,
  chdir = process.chdir,
} = {}) {
  const major = Number.parseInt(nodeVersion.split(".")[0] ?? "", 10);
  if (!Number.isInteger(major) || major < 24) {
    throw operationalError(
      "MINT_HOST_NODE_UNSUPPORTED",
      `Node 24 or newer is required (running ${nodeVersion})`,
      { action: "install Node 24 or newer before running Mint" },
    );
  }
  if (platform !== "darwin" && platform !== "linux") {
    throw operationalError(
      "MINT_HOST_PLATFORM_UNSUPPORTED",
      `Mint artifact generation requires macOS, Linux, or WSL2 (running ${platform})`,
      {
        action:
          platform === "win32"
            ? "run Mint inside WSL2; native Windows generation is not supported"
            : "run Mint on macOS or Linux",
      },
    );
  }
  chdir(repositoryRoot);
}

async function loadMintRuntime(mintDist) {
  if (!fs.existsSync(path.join(mintDist, "artifact/assemble.js"))) {
    throw operationalError(
      "MINT_BUILD_MISSING",
      "packages/mint/dist/artifact/assemble.js not found — build @bubstack/moe-mint first",
      {
        paths: [path.join(mintDist, "artifact/assemble.js")],
        action: "build @bubstack/moe-mint and retry generation",
      },
    );
  }
  const [{ resolvePlatform }, { assembleArtifactSet }, projections] = await Promise.all([
    import(pathToFileURL(path.join(mintDist, "platform/load.js")).href),
    import(pathToFileURL(path.join(mintDist, "artifact/assemble.js")).href),
    import(pathToFileURL(path.join(mintDist, "platform/projections.js")).href),
  ]);
  return { resolvePlatform, assembleArtifactSet, projections };
}

async function removePreparedOutputs(transaction, repositoryRoot, remove = rm) {
  await Promise.all(
    transaction.journal.targets.map((target) =>
      remove(path.join(repositoryRoot, target.next), { recursive: true, force: true }),
    ),
  );
}

/**
 * The one orchestration path used by the root command. Dependencies are
 * injectable only so failure tests can stop at a precise assembly/projection/
 * transaction boundary without mutating the checked-in generated outputs.
 */
export async function runMintPlugins({
  repositoryRoot = ROOT,
  mintDist = path.join(repositoryRoot, "packages/mint/dist"),
  loadRuntime = loadMintRuntime,
  nonceFactory = () => randomUUID().replaceAll("-", ""),
  transactionFactory = createGenerationTransaction,
  replaceOutputs = replaceGeneratedOutputs,
  durableFileWriter = writeDurableFile,
  remove = rm,
  log = console.log,
} = {}) {
  const { resolvePlatform, assembleArtifactSet, projections } = await loadRuntime(mintDist);
  const platform = await resolvePlatform(repositoryRoot);
  const nonce = nonceFactory();
  const transaction = transactionFactory(nonce);
  const absolute = (portablePath) => path.join(repositoryRoot, portablePath);
  const destinationRoot = absolute(transaction.journal.targets[0].next);
  let replacementStarted = false;
  try {
    await removePreparedOutputs(transaction, repositoryRoot, remove);
    const artifacts = await assembleArtifactSet({
      repoRoot: repositoryRoot,
      platform,
      destinationRoot,
    });
    const records = artifacts.map((artifact) => artifact.projection);
    const marketplace = projections.renderMarketplace(platform, records);
    const catalog = projections.renderPublicCatalog(platform, records);
    projections.resolvePublishMatrix(platform, records);
    await durableFileWriter(absolute(transaction.journal.targets[1].next), marketplace);
    await durableFileWriter(absolute(transaction.journal.targets[2].next), catalog);
    replacementStarted = true;
    await replaceOutputs(transaction);
    for (const artifact of artifacts) log(`${artifact.plugin.id.padEnd(16)} complete`);
    log(`\n${artifacts.length} plugins assembled, preflighted, and installed coherently.`);
  } catch (error) {
    if (!replacementStarted || !fs.existsSync(absolute(transaction.journalPath))) {
      await removePreparedOutputs(transaction, repositoryRoot, remove);
    }
    throw error;
  }
}

export async function mintPluginsMain(options = {}) {
  const repositoryRoot = options.repositoryRoot ?? ROOT;
  validateHostContract({ repositoryRoot, ...options.host });
  await runMintPlugins({ ...options, repositoryRoot });
}

/** Primary CLI failure boundary, exported so wrapper behavior is testable. */
export async function executeMintPluginsCli(options = {}, io = console) {
  try {
    await mintPluginsMain(options);
    return 0;
  } catch (error) {
    io.error(renderMintFailure("Mint generation", error, "MINT_GENERATION_FAILED"));
    return 1;
  }
}

const invokedUrl =
  process.argv[1] === undefined ? undefined : pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedUrl === import.meta.url) {
  process.exitCode = await executeMintPluginsCli();
}
