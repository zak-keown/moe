/**
 * Runtime dependency health check.
 *
 * ⚠️ This module used to be able to run `npm install`. It cannot any more, and
 * that is the point.
 *
 * Upstream, `cli/mcp-server-wrapper.js` probed `<pluginRoot>/node_modules/<pkg>/package.json`
 * for six packages and, if any were missing, shelled out to
 * `npm install --no-audit --no-fund` with `cwd: pluginRoot`. Two things break
 * that here:
 *
 * 1. **pnpm's node_modules is not flat.** A workspace package's dependencies are
 *    symlinks into `.pnpm/`, and a transitive dependency is not present at the
 *    package root at all. The path probe therefore reports missing packages that
 *    are perfectly resolvable.
 * 2. **`onnxruntime-node` was on the required list and is not a declared
 *    dependency.** It arrives as an optional dependency of
 *    `@huggingface/transformers`, which resolves it from its own tree. Probing
 *    for it at our root returns a false positive on EVERY server start — which,
 *    upstream, meant every start shelled out to npm inside a pnpm workspace.
 *
 * So: resolve, don't path-probe; and diagnose, don't install. If something is
 * genuinely unresolvable the operator gets one clear line telling them to run
 * `pnpm install`, and the server exits rather than mutating the tree underneath
 * itself.
 */

import { createRequire } from "node:module";

/**
 * Declared runtime dependencies the server cannot start without.
 *
 * Excludes `onnxruntime-node` and `sharp`: both are transitive, optional and
 * platform-specific, resolved by `@huggingface/transformers` from its own tree,
 * and it reports its own error if a backend is unavailable.
 */
export const REQUIRED_PACKAGES = [
  "@anthropic-ai/claude-agent-sdk",
  "@huggingface/transformers",
  "@modelcontextprotocol/sdk",
  "marked",
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
