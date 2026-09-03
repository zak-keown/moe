import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, relative, normalize } from "node:path";
import type { InstalledPackageRoot } from "./installed-package-root.js";

export type NativeTarget =
	| "darwin-arm64"
	| "darwin-x64"
	| "linux-arm64"
	| "linux-x64"
	| "win32-x64";

export interface NativeAssetRecord {
	target: NativeTarget;
	path: string;
	bytes: number;
	sha256: string;
	minimumPlatform: string;
	source: { package?: string; integrity?: string; revision?: string };
}

export interface NativeAssetManifest {
	name: string;
	version: string;
	targets: Record<NativeTarget, NativeAssetRecord>;
}

export interface ResolvedNativeAsset {
	record: NativeAssetRecord;
	absolutePath: string;
}

const ALL_TARGETS: NativeTarget[] = [
	"darwin-arm64",
	"darwin-x64",
	"linux-arm64",
	"linux-x64",
	"win32-x64",
];

export function loadNativeAssetManifest(
	root: InstalledPackageRoot,
): NativeAssetManifest {
	const manifestPath = resolve(root, "vendor", "sqlite-vec", "manifest.json");
	const raw = JSON.parse(readFileSync(manifestPath, "utf-8"));

	if (!raw.targets || typeof raw.targets !== "object") {
		throw new Error(`native asset manifest at ${manifestPath} has no targets`);
	}

	for (const target of ALL_TARGETS) {
		if (!raw.targets[target]) {
			throw new Error(
				`native asset manifest missing required target: ${target}`,
			);
		}
	}

	return raw as NativeAssetManifest;
}

export function verifyNativeAsset(
	root: InstalledPackageRoot,
	record: NativeAssetRecord,
): string {
	const normalized = normalize(record.path);

	if (normalized.startsWith("..") || normalized.startsWith("/")) {
		throw new Error(
			`native asset path escape detected: ${record.path} resolves outside package root`,
		);
	}

	const absolutePath = resolve(root, "vendor", "sqlite-vec", normalized);
	const rel = relative(resolve(root, "vendor", "sqlite-vec"), absolutePath);

	if (rel.startsWith("..")) {
		throw new Error(
			`native asset path escape detected: ${record.path} resolves outside vendor directory`,
		);
	}

	const content = readFileSync(absolutePath);

	if (content.byteLength !== record.bytes) {
		throw new Error(
			`native asset size mismatch for ${record.target}: expected ${record.bytes}, got ${content.byteLength}`,
		);
	}

	const sha256 = createHash("sha256").update(content).digest("hex");
	if (sha256 !== record.sha256) {
		throw new Error(
			`native asset SHA-256 mismatch for ${record.target}: expected ${record.sha256}, got ${sha256}`,
		);
	}

	return absolutePath;
}

export function resolveNativeAsset(
	root: InstalledPackageRoot,
	platform: NodeJS.Platform = process.platform,
	arch: string = process.arch,
): ResolvedNativeAsset {
	const target = `${platform}-${arch}` as NativeTarget;
	const manifest = loadNativeAssetManifest(root);
	const record = manifest.targets[target];

	if (!record) {
		throw new Error(`unsupported sqlite-vec target: ${target}`);
	}

	const absolutePath = verifyNativeAsset(root, record);
	return { record, absolutePath };
}
