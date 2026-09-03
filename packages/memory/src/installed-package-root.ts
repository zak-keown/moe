/**
 * Branded type and resolver for the installed package root directory.
 *
 * Every native asset and vendored binary is resolved relative to this root.
 * The root is derived from a known public entrypoint URL (index.js or cli.js),
 * never from an internal chunk or a random import.meta.url.
 */

import { fileURLToPath } from "node:url";
import { dirname, resolve, basename } from "node:path";

declare const installedPackageRootBrand: unique symbol;

export type InstalledPackageRoot = string & {
	readonly [installedPackageRootBrand]: true;
};

const KNOWN_ENTRYPOINTS = new Set(["index.js", "cli.js", "index.ts", "cli.ts"]);

export function resolveInstalledPackageRoot(
	entrypointUrl: URL | string,
): InstalledPackageRoot {
	const url =
		typeof entrypointUrl === "string" ? new URL(entrypointUrl) : entrypointUrl;
	const filePath = fileURLToPath(url);
	const file = basename(filePath);

	if (!KNOWN_ENTRYPOINTS.has(file)) {
		throw new Error(
			`resolveInstalledPackageRoot requires a known entrypoint (${[...KNOWN_ENTRYPOINTS].join(", ")}), got: ${file}`,
		);
	}

	const dir = dirname(filePath);
	const dirName = basename(dir);

	if (dirName === "dist" || dirName === "src") {
		return resolve(dir, "..") as InstalledPackageRoot;
	}

	return dir as InstalledPackageRoot;
}
