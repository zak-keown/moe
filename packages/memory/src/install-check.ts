/**
 * Runtime dependency health check.
 *
 * Resolves each declared dependency through Node's module system rather than
 * path-probing node_modules. If something is genuinely unresolvable the
 * operator gets one clear line telling them to run `pnpm install`.
 */

import { createRequire } from "node:module";

/**
 * Declared runtime dependencies the server cannot start without.
 */
export const REQUIRED_PACKAGES = [
  "@huggingface/tokenizers",
  "@modelcontextprotocol/sdk",
  "marked",
  "onnxruntime-web",
  "proper-lockfile",
  "zod",
] as const;

export type PackageResolver = (specifier: string) => boolean;

const requireFromHere = createRequire(import.meta.url);

/** Default resolver: can Node resolve this package from this module? */
export const defaultResolver: PackageResolver = (specifier) => {
  try {
    requireFromHere.resolve(specifier);
    return true;
  } catch {
    // A package with no CJS entry point still resolves through its manifest.
    try {
      requireFromHere.resolve(`${specifier}/package.json`);
      return true;
    } catch {
      return false;
    }
  }
};

/**
 * Return the required packages that cannot be resolved. An empty array means the
 * install looks complete.
 */
export function findMissingDeps(resolver: PackageResolver = defaultResolver): string[] {
  return REQUIRED_PACKAGES.filter((pkg) => !resolver(pkg));
}

/**
 * Print a diagnostic and return false when a required package is unresolvable.
 * Never installs anything.
 */
export function reportMissingDeps(resolver: PackageResolver = defaultResolver): boolean {
  const missing = findMissingDeps(resolver);
  if (missing.length === 0) return true;
  console.error(`moe-memory: cannot resolve required packages: ${missing.join(", ")}`);
  console.error("moe-memory: run `pnpm install` at the workspace root and retry.");
  return false;
}
