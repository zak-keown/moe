// @generated — do not edit; see scripts/build-runtime.mjs
import { createRequire as __createRequire } from 'module';
const require = __createRequire(import.meta.url);
import {
  acquireExclusiveMaintenanceLease
} from "./chunk-LUAEQ7DI.js";

// src/database-snapshot.ts
import crypto from "node:crypto";
import fs from "node:fs";
function hashFile(filePath) {
  const hash = crypto.createHash("sha256");
  const data = fs.readFileSync(filePath);
  hash.update(data);
  return hash.digest("hex");
}
function hashContent(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}
function validateSnapshotSources(sources) {
  const seen = /* @__PURE__ */ new Set();
  for (const src of sources) {
    if (seen.has(src.identity)) {
      throw new Error(`Duplicate source identity: ${src.identity}`);
    }
    seen.add(src.identity);
    if (src.canonicalPath.includes("..")) {
      throw new Error(`Path escape detected in source: ${src.canonicalPath}`);
    }
    if (!src.sha256 || src.sha256.length !== 64) {
      throw new Error(`Invalid SHA-256 for source ${src.identity}: ${src.sha256}`);
    }
  }
}
function collectSnapshotSources(db) {
  const sources = [];
  const exchanges = db.prepare("SELECT id, archive_path FROM exchanges ORDER BY id").all();
  for (const row of exchanges) {
    let sha256 = "";
    try {
      if (fs.existsSync(row.archive_path)) {
        sha256 = hashFile(row.archive_path);
      }
    } catch {
    }
    sources.push({
      family: "transcript",
      identity: row.id,
      canonicalPath: row.archive_path,
      sha256
    });
  }
  const journals = db.prepare("SELECT id, path FROM journal_entries ORDER BY id").all();
  for (const row of journals) {
    let sha256 = "";
    try {
      if (fs.existsSync(row.path)) {
        sha256 = hashFile(row.path);
      }
    } catch {
    }
    sources.push({
      family: "journal",
      identity: row.id,
      canonicalPath: row.path,
      sha256
    });
  }
  sources.sort((a, b) => a.identity.localeCompare(b.identity));
  return sources;
}
function createDatabaseSnapshot(db, dbPath, options) {
  if (options.callerLease) options.callerLease.release();
  const lease = acquireExclusiveMaintenanceLease(dbPath);
  try {
    const snapshotPath = `${dbPath}.snapshot-v${options.fromVersion}`;
    const sidecarPath = `${snapshotPath}.json`;
    db.exec(`VACUUM INTO '${snapshotPath.replace(/'/g, "''")}'`);
    const dbSha256 = hashFile(snapshotPath);
    const dbBytes = fs.statSync(snapshotPath).size;
    const dbIdentity = hashContent(`${dbPath}:${Date.now()}`).slice(0, 16);
    const sources = collectSnapshotSources(db);
    validateSnapshotSources(sources);
    const sidecar = {
      schema: 1,
      dbIdentity,
      dbSha256,
      dbBytes,
      fromVersion: options.fromVersion,
      toVersion: options.toVersion,
      sourceArtifactIntegrity: options.sourceArtifactIntegrity ?? "",
      sources,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    fs.writeFileSync(sidecarPath, JSON.stringify(sidecar, null, 2));
    return { snapshotPath, sidecarPath, sidecar, lease };
  } catch (error) {
    lease.release();
    throw error;
  }
}
function verifySnapshot(sidecarPath) {
  const raw = fs.readFileSync(sidecarPath, "utf-8");
  const sidecar = JSON.parse(raw);
  if (sidecar.schema !== 1) {
    throw new Error(`Unsupported snapshot schema: ${sidecar.schema}`);
  }
  if (!sidecar.dbSha256 || sidecar.dbSha256.length !== 64) {
    throw new Error("Invalid snapshot database hash");
  }
  const snapshotPath = sidecarPath.replace(/\.json$/, "");
  if (fs.existsSync(snapshotPath)) {
    const actualHash = hashFile(snapshotPath);
    if (actualHash !== sidecar.dbSha256) {
      throw new Error(
        `Snapshot database hash mismatch: expected ${sidecar.dbSha256}, got ${actualHash}`
      );
    }
  }
  validateSnapshotSources(sidecar.sources);
  return sidecar;
}

// src/recovery-capsule.ts
import { createHash } from "node:crypto";
import fs2 from "node:fs";
import path from "node:path";
var SUPPORTED_TARGETS = /* @__PURE__ */ new Set(["darwin-arm64", "darwin-x64", "linux-arm64", "linux-x64"]);
var RecoveryCapsuleError = class extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
    this.name = "RecoveryCapsuleError";
  }
};
function sha256File(filePath) {
  const content = fs2.readFileSync(filePath);
  return createHash("sha256").update(content).digest("hex");
}
function containsPathEscape(filePath) {
  const normalized = path.normalize(filePath);
  return normalized.startsWith("..") || path.isAbsolute(normalized);
}
function validateManifest(manifest) {
  if (!manifest || typeof manifest !== "object") return false;
  const m = manifest;
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
  if (m.legalFiles.length === 0) return false;
  return true;
}
function verifyRecoveryCapsule(capsuleRoot, options) {
  const target = `${options.platform}-${options.arch}`;
  if (!SUPPORTED_TARGETS.has(target)) {
    throw new RecoveryCapsuleError(`unsupported target: ${target}`, "UNSUPPORTED_TARGET");
  }
  const nodeVersion = parseInt(process.versions.node, 10);
  if (nodeVersion < 24) {
    throw new RecoveryCapsuleError(
      `Node >= 24 required, got ${process.versions.node}`,
      "NODE_TOO_OLD"
    );
  }
  const manifestPath = path.join(capsuleRoot, "manifest.json");
  if (!fs2.existsSync(manifestPath)) {
    throw new RecoveryCapsuleError("manifest.json not found in capsule root", "MISSING_MANIFEST");
  }
  const raw = JSON.parse(fs2.readFileSync(manifestPath, "utf8"));
  if (!validateManifest(raw)) {
    throw new RecoveryCapsuleError("invalid capsule manifest", "INVALID_MANIFEST");
  }
  const manifest = raw;
  if (manifest.target !== target) {
    throw new RecoveryCapsuleError(
      `capsule target ${manifest.target} does not match requested ${target}`,
      "TARGET_MISMATCH"
    );
  }
  const allFiles = [manifest.packageTarball, ...manifest.installedFiles, ...manifest.legalFiles];
  for (const file of allFiles) {
    if (containsPathEscape(file.path)) {
      throw new RecoveryCapsuleError(`path escape detected: ${file.path}`, "PATH_ESCAPE");
    }
  }
  for (const file of allFiles) {
    const filePath = path.join(capsuleRoot, file.path);
    if (!fs2.existsSync(filePath)) {
      throw new RecoveryCapsuleError(`declared file missing: ${file.path}`, "MISSING_FILE");
    }
    const stat = fs2.statSync(filePath);
    if (stat.size !== file.bytes) {
      throw new RecoveryCapsuleError(
        `size mismatch for ${file.path}: expected ${file.bytes}, got ${stat.size}`,
        "SIZE_MISMATCH"
      );
    }
    const hash = sha256File(filePath);
    if (hash !== file.sha256) {
      throw new RecoveryCapsuleError(
        `integrity mismatch for ${file.path}: expected ${file.sha256}, got ${hash}`,
        "INTEGRITY_MISMATCH"
      );
    }
  }
  const declaredPaths = new Set(allFiles.map((f) => f.path));
  declaredPaths.add("manifest.json");
  const actualFiles = walkDir(capsuleRoot, capsuleRoot);
  for (const actual of actualFiles) {
    if (!declaredPaths.has(actual)) {
      throw new RecoveryCapsuleError(`unknown file in capsule: ${actual}`, "UNKNOWN_FILE");
    }
  }
  return { manifest, root: capsuleRoot, target, verified: true };
}
function walkDir(root, current) {
  const results = [];
  for (const entry of fs2.readdirSync(current, { withFileTypes: true })) {
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
function loadCatalog(catalogPath) {
  const raw = JSON.parse(fs2.readFileSync(catalogPath, "utf8"));
  if (raw.schema !== 1 || raw.memoryVersion !== "0.1.5" || !Array.isArray(raw.targets)) {
    throw new RecoveryCapsuleError("invalid recovery catalog", "INVALID_CATALOG");
  }
  return raw;
}
function ensureRecoveryCapsule(options) {
  if (options.fromVersion !== "0.1.5") {
    throw new RecoveryCapsuleError(
      `only 0.1.5 recovery capsules are supported, got ${options.fromVersion}`,
      "UNSUPPORTED_VERSION"
    );
  }
  const target = `${options.platform}-${options.arch}`;
  if (!SUPPORTED_TARGETS.has(target)) {
    throw new RecoveryCapsuleError(`unsupported target: ${target}`, "UNSUPPORTED_TARGET");
  }
  const catalogPath = options.catalogPath ?? path.join(import.meta.dirname, "..", "recovery", "0.1.5", "catalog.json");
  const catalog = loadCatalog(catalogPath);
  const entry = catalog.targets.find((t) => t.target === target);
  if (!entry) {
    throw new RecoveryCapsuleError(
      `no capsule in catalog for target: ${target}`,
      "TARGET_NOT_IN_CATALOG"
    );
  }
  const capsuleDir = options.capsuleDir ?? path.join(import.meta.dirname, "..", "recovery", "0.1.5", target);
  return verifyRecoveryCapsule(capsuleDir, {
    platform: options.platform,
    arch: options.arch
  });
}

export {
  validateSnapshotSources,
  collectSnapshotSources,
  createDatabaseSnapshot,
  verifySnapshot,
  RecoveryCapsuleError,
  validateManifest,
  verifyRecoveryCapsule,
  loadCatalog,
  ensureRecoveryCapsule
};
