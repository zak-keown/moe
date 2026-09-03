/**
 * Recovery capsule schema and verification for offline rollback.
 *
 * A recovery capsule captures the exact 0.1.5 memory runtime — package tarball,
 * installed files, dependency closure, lifecycle policy, and legal files — so
 * Plan 06's rollback can restore the predecessor without network access.
 */

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export interface IntegrityFile {
  path: string;
  sha256: string;
  bytes: number;
}

export interface RecoveryCapsuleManifest {
  schema: 1;
  memoryVersion: "0.1.5";
  nodeRange: ">=24";
  target: string;
  packageTarball: IntegrityFile;
  installedFiles: readonly IntegrityFile[];
  dependencies: readonly {
    name: string;
    version: string;
    integrity: string;
  }[];
  lifecyclePolicy: readonly {
    package: string;
    script: string;
    executed: boolean;
  }[];
  legalFiles: readonly IntegrityFile[];
}

export interface VerifiedRecoveryCapsule {
  manifest: RecoveryCapsuleManifest;
  root: string;
  target: string;
  verified: true;
}

export interface RecoveryCatalog {
  schema: 1;
  memoryVersion: "0.1.5";
  targets: readonly RecoveryCatalogEntry[];
}

export interface RecoveryCatalogEntry {
  target: string;
  platform: string;
  arch: string;
  manifestSha256: string;
  assetKey: string;
}

const SUPPORTED_TARGETS = new Set([
  "darwin-arm64",
  "darwin-x64",
  "linux-arm64",
  "linux-x64",
]);

export class RecoveryCapsuleError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "RecoveryCapsuleError";
  }
}

function sha256File(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return createHash("sha256").update(content).digest("hex");
}

function sha256Buffer(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

function containsPathEscape(filePath: string): boolean {
  const normalized = path.normalize(filePath);
  return normalized.startsWith("..") || path.isAbsolute(normalized);
}

export function validateManifest(manifest: unknown): manifest is RecoveryCapsuleManifest {
  if (!manifest || typeof manifest !== "object") return false;
  const m = manifest as Record<string, unknown>;
  if (m.schema !== 1) return false;
  if (m.memoryVersion !== "0.1.5") return false;
  if (m.nodeRange !== ">=24") return false;
  if (typeof m.target !== "string") return false;
  if (!SUPPORTED_TARGETS.has(m.target)) return false;
  if (!m.packageTarball || typeof m.packageTarball !== "object") return false;
  if (!Array.isArray(m.installedFiles)) return false;
  if (!Array.isArray(m.dependencies)) return false;
  if (!Array.isArray(m.lifecyclePolicy)) return false;
  if (!Array.isArray(m.legalFiles)) return false;
  if ((m.legalFiles as unknown[]).length === 0) return false;
  return true;
}

export function verifyRecoveryCapsule(
  capsuleRoot: string,
  options: { platform: string; arch: string },
): VerifiedRecoveryCapsule {
  const target = `${options.platform}-${options.arch}`;

  if (!SUPPORTED_TARGETS.has(target)) {
    throw new RecoveryCapsuleError(
      `unsupported target: ${target}`,
      "UNSUPPORTED_TARGET",
    );
  }

  const nodeVersion = parseInt(process.versions.node, 10);
  if (nodeVersion < 24) {
    throw new RecoveryCapsuleError(
      `Node >= 24 required, got ${process.versions.node}`,
      "NODE_TOO_OLD",
    );
  }

  const manifestPath = path.join(capsuleRoot, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    throw new RecoveryCapsuleError(
      "manifest.json not found in capsule root",
      "MISSING_MANIFEST",
    );
  }

  const raw = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (!validateManifest(raw)) {
    throw new RecoveryCapsuleError(
      "invalid capsule manifest",
      "INVALID_MANIFEST",
    );
  }

  const manifest = raw as RecoveryCapsuleManifest;

  if (manifest.target !== target) {
    throw new RecoveryCapsuleError(
      `capsule target ${manifest.target} does not match requested ${target}`,
      "TARGET_MISMATCH",
    );
  }

  // Check for path escapes in all file paths
  const allFiles = [
    manifest.packageTarball,
    ...manifest.installedFiles,
    ...manifest.legalFiles,
  ];
  for (const file of allFiles) {
    if (containsPathEscape(file.path)) {
      throw new RecoveryCapsuleError(
        `path escape detected: ${file.path}`,
        "PATH_ESCAPE",
      );
    }
  }

  // Verify integrity of all declared files
  for (const file of allFiles) {
    const filePath = path.join(capsuleRoot, file.path);
    if (!fs.existsSync(filePath)) {
      throw new RecoveryCapsuleError(
        `declared file missing: ${file.path}`,
        "MISSING_FILE",
      );
    }
    const stat = fs.statSync(filePath);
    if (stat.size !== file.bytes) {
      throw new RecoveryCapsuleError(
        `size mismatch for ${file.path}: expected ${file.bytes}, got ${stat.size}`,
        "SIZE_MISMATCH",
      );
    }
    const hash = sha256File(filePath);
    if (hash !== file.sha256) {
      throw new RecoveryCapsuleError(
        `integrity mismatch for ${file.path}: expected ${file.sha256}, got ${hash}`,
        "INTEGRITY_MISMATCH",
      );
    }
  }

  // Check no unknown files exist in capsule
  const declaredPaths = new Set(allFiles.map((f) => f.path));
  declaredPaths.add("manifest.json");
  const actualFiles = walkDir(capsuleRoot, capsuleRoot);
  for (const actual of actualFiles) {
    if (!declaredPaths.has(actual)) {
      throw new RecoveryCapsuleError(
        `unknown file in capsule: ${actual}`,
        "UNKNOWN_FILE",
      );
    }
  }

  return { manifest, root: capsuleRoot, target, verified: true };
}

function walkDir(root: string, current: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    const full = path.join(current, entry.name);
    const rel = path.relative(root, full);
    if (entry.isDirectory()) {
      results.push(...walkDir(root, full));
    } else {
      results.push(rel);
    }
  }
  return results;
}

export function loadCatalog(catalogPath: string): RecoveryCatalog {
  const raw = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
  if (raw.schema !== 1 || raw.memoryVersion !== "0.1.5" || !Array.isArray(raw.targets)) {
    throw new RecoveryCapsuleError("invalid recovery catalog", "INVALID_CATALOG");
  }
  return raw as RecoveryCatalog;
}

export function ensureRecoveryCapsule(options: {
  fromVersion: string;
  platform: string;
  arch: string;
  catalogPath?: string;
  capsuleDir?: string;
}): VerifiedRecoveryCapsule {
  if (options.fromVersion !== "0.1.5") {
    throw new RecoveryCapsuleError(
      `only 0.1.5 recovery capsules are supported, got ${options.fromVersion}`,
      "UNSUPPORTED_VERSION",
    );
  }

  const target = `${options.platform}-${options.arch}`;
  if (!SUPPORTED_TARGETS.has(target)) {
    throw new RecoveryCapsuleError(
      `unsupported target: ${target}`,
      "UNSUPPORTED_TARGET",
    );
  }

  const catalogPath =
    options.catalogPath ??
    path.join(import.meta.dirname, "..", "recovery", "0.1.5", "catalog.json");

  const catalog = loadCatalog(catalogPath);
  const entry = catalog.targets.find((t) => t.target === target);
  if (!entry) {
    throw new RecoveryCapsuleError(
      `no capsule in catalog for target: ${target}`,
      "TARGET_NOT_IN_CATALOG",
    );
  }

  const capsuleDir =
    options.capsuleDir ??
    path.join(import.meta.dirname, "..", "recovery", "0.1.5", target);

  return verifyRecoveryCapsule(capsuleDir, {
    platform: options.platform,
    arch: options.arch,
  });
}

export { sha256Buffer as sha256ForTest };
