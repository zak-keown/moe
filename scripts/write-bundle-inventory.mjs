#!/usr/bin/env node

import { lstat, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  readBundleMetafiles,
  resolveBundledPackages,
} from "../packages/mint/src/artifact/bundle-inventory.ts";

const scriptRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const METAFILE_NAMES = new Set(["metafile-cjs.json", "metafile-esm.json"]);

function compareBytes(left, right) {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function contained(root, candidate) {
  const path = relative(root, candidate);
  return path === "" || (!isAbsolute(path) && path !== ".." && !path.startsWith(`..${sep}`));
}

function isMachineAbsolute(value) {
  return isAbsolute(value) || /^[A-Za-z]:[\\/]/.test(value) || /^[\\/]{2}/.test(value);
}

function assertRelativeMetafilePath(value, source) {
  if (typeof value !== "string" || isMachineAbsolute(value)) {
    throw new Error(`bundler metafile "${source}" contains an absolute machine path`);
  }
}

function object(value, message) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(message);
  return value;
}

function exactKeys(value, allowed, message) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`${message}: unknown metafile field "${key}"`);
  }
}

/** Keeps only the deterministic evidence fields consumed by the inventory reader. */
function normalizeMetafile(value, source) {
  const metafile = object(value, `invalid bundler metafile "${source}": expected an object`);
  exactKeys(metafile, new Set(["inputs", "outputs"]), `invalid bundler metafile "${source}"`);
  const inputs = object(
    metafile.inputs,
    `invalid bundler metafile "${source}": inputs must be an object`,
  );
  const outputs = object(
    metafile.outputs,
    `invalid bundler metafile "${source}": outputs must be an object`,
  );
  for (const input of Object.keys(inputs)) assertRelativeMetafilePath(input, source);

  const normalizedOutputs = {};
  for (const outputPath of Object.keys(outputs).sort(compareBytes)) {
    assertRelativeMetafilePath(outputPath, source);
    const output = object(
      outputs[outputPath],
      `invalid bundler metafile "${source}": output "${outputPath}" must be an object`,
    );
    exactKeys(
      output,
      new Set(["imports", "exports", "entryPoint", "inputs", "bytes"]),
      `invalid bundler metafile "${source}": output "${outputPath}"`,
    );
    const outputInputs = object(
      output.inputs,
      `invalid bundler metafile "${source}": output "${outputPath}" inputs must be an object`,
    );
    const normalizedInputs = {};
    for (const input of Object.keys(outputInputs).sort(compareBytes)) {
      assertRelativeMetafilePath(input, source);
      normalizedInputs[input] = {};
    }
    const imports = output.imports ?? [];
    if (!Array.isArray(imports))
      throw new Error(
        `invalid bundler metafile "${source}": output "${outputPath}" imports must be an array`,
      );
    const externalImports = imports
      .map((entry) => {
        const record = object(
          entry,
          `invalid bundler metafile "${source}": output "${outputPath}" import must be an object`,
        );
        exactKeys(
          record,
          new Set(["path", "kind", "external"]),
          `invalid bundler metafile "${source}": output "${outputPath}" import`,
        );
        if (typeof record.path !== "string")
          throw new Error(
            `invalid bundler metafile "${source}": output "${outputPath}" import path must be a string`,
          );
        assertRelativeMetafilePath(record.path, source);
        if (typeof record.external !== "boolean")
          throw new Error(
            `invalid bundler metafile "${source}": output "${outputPath}" import external must be a boolean`,
          );
        return record.external ? { path: record.path, external: true } : undefined;
      })
      .filter((entry) => entry !== undefined)
      .sort((left, right) => compareBytes(left.path, right.path));
    normalizedOutputs[outputPath] = {
      inputs: normalizedInputs,
      ...(externalImports.length === 0 ? {} : { imports: externalImports }),
    };
  }
  return { outputs: normalizedOutputs };
}

async function canonicalExisting(path, label) {
  try {
    return await realpath(path);
  } catch (error) {
    throw new Error(`${label} does not exist or cannot be resolved: ${path}`, { cause: error });
  }
}

async function canonicalRoots(options) {
  const repositoryRoot = await canonicalExisting(options.repositoryRoot, "repository root");
  const packageRoot = await canonicalExisting(options.packageRoot, "package root");
  if (!contained(repositoryRoot, packageRoot)) {
    throw new Error(`package root must be inside repository root: ${options.packageRoot}`);
  }
  return { repositoryRoot, packageRoot };
}

function expectedMetafilePaths(packageRoot) {
  return new Set([
    join(packageRoot, ".moe-build", "metafile-cjs.json"),
    join(packageRoot, ".moe-build", "metafile-esm.json"),
    join(packageRoot, "dist", "metafile-cjs.json"),
    join(packageRoot, "dist", "metafile-esm.json"),
  ]);
}

async function safeMetafilePath(path, packageRoot, declaredPackageRoot) {
  const requested = resolve(path);
  if (
    !METAFILE_NAMES.has(basename(requested)) ||
    !expectedMetafilePaths(declaredPackageRoot).has(requested)
  ) {
    throw new Error(`metafile must be in a safe package build location: ${path}`);
  }
  const physical = await canonicalExisting(requested, "metafile");
  if (!contained(packageRoot, physical)) {
    throw new Error(`metafile must be in a safe package build location: ${path}`);
  }
  return physical;
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

async function prepareEvidenceRoot(evidenceRoot) {
  try {
    const stats = await lstat(evidenceRoot);
    if (stats.isSymbolicLink())
      throw new Error(`bundle evidence root must not be a symbolic link: ${evidenceRoot}`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  await rm(evidenceRoot, { recursive: true, force: true });
  await mkdir(evidenceRoot, { recursive: true });
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const { repositoryRoot, packageRoot } = await canonicalRoots(options);
  const evidenceRoot = join(packageRoot, ".moe-build");
  if (options.prepare) return prepareEvidenceRoot(evidenceRoot);

  const metafiles = await Promise.all(
    options.metafiles.map((path) => safeMetafilePath(path, packageRoot, options.packageRoot)),
  );
  const names = metafiles.map((path) => basename(path));
  if (new Set(names).size !== names.length) throw new Error("metafile basenames must be unique");
  const normalized = await Promise.all(
    metafiles.map(async (metafile) => {
      let parsed;
      try {
        parsed = JSON.parse(await readFile(metafile, "utf8"));
      } catch (error) {
        throw new Error(`invalid bundler metafile "${metafile}": expected JSON`, { cause: error });
      }
      return { metafile, contents: normalizeMetafile(parsed, metafile) };
    }),
  );
  const inputs = await readBundleMetafiles({ repositoryRoot, packageRoot, metafiles });
  const inventory = resolveBundledPackages(inputs);
  await mkdir(evidenceRoot, { recursive: true });
  for (const { metafile, contents } of normalized) {
    await writeFile(
      join(evidenceRoot, basename(metafile)),
      `${JSON.stringify(contents, null, 2)}\n`,
    );
  }
  await writeFile(
    join(evidenceRoot, "bundle-inventory.json"),
    `${JSON.stringify(inventory, null, 2)}\n`,
  );
  for (const metafile of metafiles) {
    if (dirname(metafile) === join(packageRoot, "dist")) await rm(metafile);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
