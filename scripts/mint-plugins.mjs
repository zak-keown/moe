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
import { HARNESS_IDS, PLUGINS } from "../bin/lib/plugin-registry.mjs";
import { renderMintFailure } from "./lib/mint-diagnostics.mjs";
import {
  createGenerationTransaction,
  replaceGeneratedOutputs,
  writeDurableFile,
} from "./lib/mint-generation-transaction.mjs";
import { validateMintHostContract } from "./lib/mint-host-contract.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function operationalError(code, message, { paths = [], action, cause } = {}) {
  const error = new Error(message, cause === undefined ? undefined : { cause });
  error.code = code;
  error.paths = paths;
  error.action = action;
  return error;
}

function portable(value) {
  return typeof value === "string"
    ? value.replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/$/, "")
    : "";
}

function duplicateValues(values) {
  const seen = new Set();
  const duplicates = [];
  for (const value of values) {
    if (seen.has(value)) duplicates.push(value);
    seen.add(value);
  }
  return duplicates;
}

function orderedHarnesses(values) {
  const selected = new Set(values);
  return HARNESS_IDS.filter((id) => selected.has(id));
}

function sameStrings(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function duplicateEntryIds(entries, fields) {
  const ids = [];
  for (const field of fields) {
    const ownerByValue = new Map();
    for (const entry of entries) {
      const previous = ownerByValue.get(entry[field]);
      if (previous !== undefined) ids.push(previous, entry.id);
      else ownerByValue.set(entry[field], entry.id);
    }
  }
  return ids;
}

/**
 * Keep the dependency-free installer registry and the resolved Mint platform
 * aligned on every field used to select or install a plugin. Capability policy
 * remains exclusively owned by Mint; this boundary compares only active target
 * IDs derived independently from target intents and harness exclusions.
 */
export function validateCanonicalPluginRegistry(platform, canonicalPlugins = PLUGINS) {
  if (!Array.isArray(platform?.plugins) || !Array.isArray(canonicalPlugins)) {
    throw operationalError(
      "MINT_PLUGIN_REGISTRY_MISMATCH",
      "resolved Mint platform did not provide a plugin registry",
      { action: "resolve moe-platform.yaml before artifact assembly" },
    );
  }

  const expected = canonicalPlugins.map((plugin) => ({
    id: plugin.name,
    source: portable(`packages/${plugin.pkg}`),
    config: portable(`packages/${plugin.pkg}/${plugin.config}`),
    repository: plugin.repository,
    npmPackage: plugin.distribution?.npm,
    harnesses: orderedHarnesses(Array.isArray(plugin.harnesses) ? plugin.harnesses : []),
    invalid:
      typeof plugin.name !== "string" ||
      plugin.name.length === 0 ||
      typeof plugin.pkg !== "string" ||
      plugin.pkg.length === 0 ||
      typeof plugin.config !== "string" ||
      plugin.config.length === 0 ||
      typeof plugin.repository !== "string" ||
      plugin.repository.length === 0 ||
      typeof plugin.distribution?.npm !== "string" ||
      plugin.distribution.npm.length === 0 ||
      !Array.isArray(plugin.harnesses) ||
      plugin.harnesses.some((id) => typeof id !== "string" || !HARNESS_IDS.includes(id)) ||
      duplicateValues(plugin.harnesses).length > 0,
  }));
  const actual = platform.plugins.map((plugin) => {
    const targetEntries =
      plugin.targets && typeof plugin.targets === "object" ? Object.entries(plugin.targets) : [];
    const exclusions = Array.isArray(plugin.config?.harnesses?.exclude)
      ? plugin.config.harnesses.exclude
      : [];
    const targetIds = targetEntries.map(([id]) => id);
    const activeByIntent = orderedHarnesses(
      targetEntries.filter(([, policy]) => policy?.intent !== "omit").map(([id]) => id),
    );
    const activeByExclusion = HARNESS_IDS.filter((id) => !exclusions.includes(id));
    const validIntents = targetEntries.every(
      ([, policy]) =>
        policy?.intent === "certify" || policy?.intent === "preview" || policy?.intent === "omit",
    );
    const validTargets =
      targetIds.length === HARNESS_IDS.length && targetIds.every((id) => HARNESS_IDS.includes(id));
    const validExclusions =
      Array.isArray(plugin.config?.harnesses?.exclude) &&
      exclusions.every((id) => typeof id === "string" && HARNESS_IDS.includes(id)) &&
      duplicateValues(exclusions).length === 0;
    return {
      id: plugin.id,
      source: portable(plugin.sourcePackagePath),
      config: portable(plugin.config?.source),
      repository: plugin.config?.repository,
      npmPackage: plugin.npmPackage,
      configNpmPackage: plugin.config?.distribution?.npm,
      activeByIntent,
      activeByExclusion,
      invalid:
        typeof plugin.id !== "string" ||
        plugin.id.length === 0 ||
        typeof plugin.sourcePackagePath !== "string" ||
        plugin.sourcePackagePath.length === 0 ||
        typeof plugin.config?.source !== "string" ||
        plugin.config.source.length === 0 ||
        typeof plugin.config?.repository !== "string" ||
        plugin.config.repository.length === 0 ||
        typeof plugin.npmPackage !== "string" ||
        plugin.npmPackage.length === 0 ||
        typeof plugin.config?.distribution?.npm !== "string" ||
        plugin.config.distribution.npm.length === 0 ||
        !validTargets ||
        !validIntents ||
        !validExclusions,
    };
  });
  const uniqueFields = ["id", "source", "config", "npmPackage"];
  const expectedDuplicates = duplicateEntryIds(expected, uniqueFields);
  const actualDuplicates = duplicateEntryIds(actual, uniqueFields);
  const expectedById = new Map(expected.map((entry) => [entry.id, entry]));
  const actualById = new Map(actual.map((entry) => [entry.id, entry]));
  const mismatches = [];

  for (const id of new Set([...expectedById.keys(), ...actualById.keys()])) {
    const expectedEntry = expectedById.get(id);
    const actualEntry = actualById.get(id);
    if (
      expectedEntry === undefined ||
      actualEntry === undefined ||
      expectedEntry.source !== actualEntry.source ||
      expectedEntry.config !== actualEntry.config ||
      expectedEntry.repository !== actualEntry.repository ||
      expectedEntry.npmPackage !== actualEntry.npmPackage ||
      expectedEntry.npmPackage !== actualEntry.configNpmPackage ||
      !sameStrings(expectedEntry.harnesses, actualEntry.activeByIntent) ||
      !sameStrings(expectedEntry.harnesses, actualEntry.activeByExclusion) ||
      expectedEntry.invalid ||
      actualEntry.invalid
    ) {
      mismatches.push(id);
    }
  }

  if (expectedDuplicates.length > 0 || actualDuplicates.length > 0 || mismatches.length > 0) {
    const ids = [...new Set([...expectedDuplicates, ...actualDuplicates, ...mismatches])].sort();
    throw operationalError(
      "MINT_PLUGIN_REGISTRY_MISMATCH",
      `canonical bin registry and resolved Mint platform disagree for: ${ids.join(", ")}`,
      {
        paths: ["bin/lib/plugin-registry.mjs", "moe-platform.yaml"],
        action:
          "align plugin id, source/config paths, repository, npm distribution, and active harness IDs in both registries",
      },
    );
  }
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
  validateMintHostContract({ nodeVersion, platform });
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
  validateRegistry = validateCanonicalPluginRegistry,
  remove = rm,
  log = console.log,
} = {}) {
  const { resolvePlatform, assembleArtifactSet, projections } = await loadRuntime(mintDist);
  const platform = await resolvePlatform(repositoryRoot);
  validateRegistry(platform);
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
