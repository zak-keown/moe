#!/usr/bin/env node

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  readBundleMetafiles,
  resolveBundledPackages,
} from "../packages/mint/src/artifact/bundle-inventory.ts";

const scriptRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function compareBytes(left, right) {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function contained(root, candidate) {
  const path = relative(root, candidate);
  return path === "" || (!isAbsolute(path) && path !== ".." && !path.startsWith(`..${sep}`));
}

function sortedJsonValue(value) {
  if (Array.isArray(value)) return value.map(sortedJsonValue);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort(compareBytes)
      .map((key) => [key, sortedJsonValue(value[key])]),
  );
}

function rejectAbsoluteStrings(value, source) {
  if (typeof value === "string" && isAbsolute(value)) {
    throw new Error(`bundler metafile "${source}" contains an absolute machine path`);
  }
  if (Array.isArray(value)) {
    for (const child of value) rejectAbsoluteStrings(child, source);
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (isAbsolute(key))
        throw new Error(`bundler metafile "${source}" contains an absolute machine path`);
      rejectAbsoluteStrings(child, source);
    }
  }
}

function parseArguments(argv) {
  const args = [...argv];
  let repositoryRoot = scriptRoot;
  if (args[0] === "--repository-root") {
    if (!args[1]) throw new Error("--repository-root requires a path");
    repositoryRoot = resolve(args[1]);
    args.splice(0, 2);
  }
  if (args[0] === "--prepare") {
    if (args.length !== 2)
      throw new Error(
        "usage: write-bundle-inventory.mjs [--repository-root ROOT] --prepare PACKAGE_ROOT",
      );
    return { repositoryRoot, packageRoot: resolve(args[1]), prepare: true, metafiles: [] };
  }
  if (args.length < 2) {
    throw new Error(
      "usage: write-bundle-inventory.mjs [--repository-root ROOT] PACKAGE_ROOT METAFILE...",
    );
  }
  return {
    repositoryRoot,
    packageRoot: resolve(args[0]),
    prepare: false,
    metafiles: args.slice(1).map((path) => resolve(path)),
  };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (!contained(options.repositoryRoot, options.packageRoot)) {
    throw new Error(`package root must be inside repository root: ${options.packageRoot}`);
  }
  const evidenceRoot = join(options.packageRoot, ".moe-build");
  if (options.prepare) {
    await rm(evidenceRoot, { recursive: true, force: true });
    await mkdir(evidenceRoot, { recursive: true });
    return;
  }

  const names = options.metafiles.map((path) => basename(path));
  if (new Set(names).size !== names.length) throw new Error("metafile basenames must be unique");
  const inputs = await readBundleMetafiles({
    repositoryRoot: options.repositoryRoot,
    packageRoot: options.packageRoot,
    metafiles: options.metafiles,
  });
  const inventory = resolveBundledPackages(inputs);
  await mkdir(evidenceRoot, { recursive: true });

  for (const metafile of options.metafiles) {
    const parsed = JSON.parse(await readFile(metafile, "utf8"));
    rejectAbsoluteStrings(parsed, metafile);
    await writeFile(
      join(evidenceRoot, basename(metafile)),
      `${JSON.stringify(sortedJsonValue(parsed), null, 2)}\n`,
    );
  }
  await writeFile(
    join(evidenceRoot, "bundle-inventory.json"),
    `${JSON.stringify(inventory, null, 2)}\n`,
  );

  for (const metafile of options.metafiles) {
    if (dirname(metafile) !== evidenceRoot) await rm(metafile);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
