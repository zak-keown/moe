#!/usr/bin/env node
/**
 * Download sqlite-vec native binaries from npm and update the vendor manifest.
 *
 * Usage:
 *   node scripts/refresh-sqlite-vec.mjs           # download and overwrite
 *   node scripts/refresh-sqlite-vec.mjs --check    # verify without writing
 */

import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	readFileSync,
	writeFileSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	copyFileSync,
} from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const VENDOR = resolve(ROOT, "vendor", "sqlite-vec");
const MANIFEST_PATH = resolve(VENDOR, "manifest.json");
const VERSION = "0.1.9";
const check = process.argv.includes("--check");

const TARGETS = [
	{
		target: "darwin-arm64",
		npmPkg: "sqlite-vec-darwin-arm64",
		file: "vec0.dylib",
		minimumPlatform: "macOS 13.5",
	},
	{
		target: "darwin-x64",
		npmPkg: "sqlite-vec-darwin-x64",
		file: "vec0.dylib",
		minimumPlatform: "macOS 13.5",
	},
	{
		target: "linux-arm64",
		npmPkg: "sqlite-vec-linux-arm64",
		file: "vec0.so",
		minimumPlatform: "glibc 2.31",
	},
	{
		target: "linux-x64",
		npmPkg: "sqlite-vec-linux-x64",
		file: "vec0.so",
		minimumPlatform: "glibc 2.31",
	},
	{
		target: "win32-x64",
		npmPkg: "sqlite-vec-windows-x64",
		file: "vec0.dll",
		minimumPlatform: "Windows 10",
	},
];

const tmpDir = mkdtempSync(join(tmpdir(), "sqlite-vec-refresh-"));
const problems = [];

const manifest = { name: "sqlite-vec", version: VERSION, targets: {} };

for (const t of TARGETS) {
	const spec = `${t.npmPkg}@${VERSION}`;
	console.log(`Fetching ${spec}...`);

	execSync(`npm pack ${spec} --pack-destination ${tmpDir}`, {
		stdio: "pipe",
	});

	const tgzName = `${t.npmPkg}-${VERSION}.tgz`;
	const tgzPath = join(tmpDir, tgzName);

	const extractDir = join(tmpDir, t.target);
	mkdirSync(extractDir, { recursive: true });
	execSync(`tar xzf ${tgzPath} -C ${extractDir}`);

	const binaryPath = join(extractDir, "package", t.file);
	const content = readFileSync(binaryPath);
	const sha256 = createHash("sha256").update(content).digest("hex");

	const npmInfo = JSON.parse(
		execSync(`npm view ${spec} --json`, { encoding: "utf-8" }),
	);
	const integrity = npmInfo.dist?.integrity || "";

	const record = {
		target: t.target,
		path: `${t.target}/${t.file}`,
		bytes: content.byteLength,
		sha256,
		minimumPlatform: t.minimumPlatform,
		source: { package: spec, integrity },
	};

	manifest.targets[t.target] = record;

	if (check) {
		const existingBinary = resolve(VENDOR, record.path);
		try {
			const existing = readFileSync(existingBinary);
			const existingHash = createHash("sha256")
				.update(existing)
				.digest("hex");
			if (existingHash !== sha256) {
				problems.push(
					`${t.target}: SHA-256 mismatch (committed: ${existingHash}, upstream: ${sha256})`,
				);
			} else if (existing.byteLength !== content.byteLength) {
				problems.push(
					`${t.target}: size mismatch (committed: ${existing.byteLength}, upstream: ${content.byteLength})`,
				);
			}
		} catch {
			problems.push(`${t.target}: binary missing at ${existingBinary}`);
		}
	} else {
		const destDir = resolve(VENDOR, t.target);
		mkdirSync(destDir, { recursive: true });
		copyFileSync(binaryPath, resolve(destDir, t.file));
	}
}

if (check) {
	try {
		const existingManifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));
		const newJson = JSON.stringify(manifest, null, 2);
		const existingJson = JSON.stringify(existingManifest, null, 2);
		if (newJson !== existingJson) {
			problems.push("manifest.json content differs from upstream");
		}
	} catch {
		problems.push("manifest.json missing or unreadable");
	}

	rmSync(tmpDir, { recursive: true, force: true });

	if (problems.length > 0) {
		console.error("sqlite-vec refresh check FAILED:");
		for (const p of problems) console.error(`  - ${p}`);
		process.exit(1);
	}
	console.log("sqlite-vec refresh check passed — vendored assets match upstream");
} else {
	writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");
	rmSync(tmpDir, { recursive: true, force: true });
	console.log(`Wrote manifest and binaries for ${TARGETS.length} targets`);
}
