import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ensureRecoveryCapsule,
  RecoveryCapsuleError,
  type RecoveryCapsuleManifest,
} from "../../src/recovery-capsule.js";
import { abortRollback } from "../../src/rollback/abort.js";
import { assertWritesAllowed, RollbackFencedError } from "../../src/rollback/fence.js";
import {
  advanceRollbackState,
  createRollbackState,
  RollbackStateError,
  readRollbackState,
} from "../../src/rollback/state.js";

function sha256(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function buildFixtureCapsule(root: string, target: string): RecoveryCapsuleManifest {
  fs.mkdirSync(root, { recursive: true });

  const tarball = Buffer.from("fake-0.1.5-tarball");
  fs.writeFileSync(path.join(root, "package.tgz"), tarball);

  const cliContent = Buffer.from('#!/usr/bin/env node\nconsole.log("0.1.5");');
  fs.mkdirSync(path.join(root, "dist"), { recursive: true });
  fs.writeFileSync(path.join(root, "dist/cli.js"), cliContent);

  const license = Buffer.from("MIT License\nCopyright (c) 2026 Bubstack");
  fs.writeFileSync(path.join(root, "LICENSE"), license);

  const manifest: RecoveryCapsuleManifest = {
    schema: 1,
    memoryVersion: "0.1.5",
    nodeRange: ">=24",
    target,
    packageTarball: {
      path: "package.tgz",
      sha256: sha256(tarball),
      bytes: tarball.length,
    },
    installedFiles: [
      {
        path: "dist/cli.js",
        sha256: sha256(cliContent),
        bytes: cliContent.length,
      },
    ],
    dependencies: [{ name: "better-sqlite3", version: "12.4.1", integrity: "sha512-abc" }],
    lifecyclePolicy: [{ package: "better-sqlite3", script: "install", executed: true }],
    legalFiles: [
      {
        path: "LICENSE",
        sha256: sha256(license),
        bytes: license.length,
      },
    ],
  };

  fs.writeFileSync(path.join(root, "manifest.json"), JSON.stringify(manifest, null, 2));

  return manifest;
}

function buildCatalog(tmpDir: string, target: string): string {
  const manifestPath = path.join(tmpDir, target, "manifest.json");
  const manifestHash = sha256(fs.readFileSync(manifestPath));

  const catalog = {
    schema: 1,
    memoryVersion: "0.1.5",
    targets: [
      {
        target,
        platform: target.split("-")[0],
        arch: target.split("-")[1],
        manifestSha256: manifestHash,
        assetKey: `recovery-0.1.5-${target}.tar.gz`,
      },
    ],
  };

  const catalogPath = path.join(tmpDir, "catalog.json");
  fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2));
  return catalogPath;
}

describe("offline rollback integration", () => {
  let tmpDir: string;
  const target = `${process.platform}-${process.arch}`;

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "rollback-offline-"));
  });

  afterEach(async () => {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  });

  it("ensureRecoveryCapsule succeeds with local capsule and catalog", () => {
    const capsuleRoot = path.join(tmpDir, target);
    buildFixtureCapsule(capsuleRoot, target);
    const catalogPath = buildCatalog(tmpDir, target);

    const result = ensureRecoveryCapsule({
      fromVersion: "0.1.5",
      platform: process.platform,
      arch: process.arch,
      catalogPath,
      capsuleDir: capsuleRoot,
    });

    expect(result.verified).toBe(true);
    expect(result.target).toBe(target);
  });

  it("rejects capsule with tampered file integrity", () => {
    const capsuleRoot = path.join(tmpDir, target);
    buildFixtureCapsule(capsuleRoot, target);
    const catalogPath = buildCatalog(tmpDir, target);

    fs.writeFileSync(path.join(capsuleRoot, "package.tgz"), "corrupted-data");

    expect(() =>
      ensureRecoveryCapsule({
        fromVersion: "0.1.5",
        platform: process.platform,
        arch: process.arch,
        catalogPath,
        capsuleDir: capsuleRoot,
      }),
    ).toThrow(RecoveryCapsuleError);
  });

  it("rejects missing manifest", () => {
    const capsuleRoot = path.join(tmpDir, "empty-capsule");
    fs.mkdirSync(capsuleRoot, { recursive: true });

    expect(() =>
      ensureRecoveryCapsule({
        fromVersion: "0.1.5",
        platform: process.platform,
        arch: process.arch,
        catalogPath: path.join(tmpDir, "catalog.json"),
        capsuleDir: capsuleRoot,
      }),
    ).toThrow();
  });

  it("full offline rollback lifecycle: capsule verify → state → fence → abort", () => {
    const capsuleRoot = path.join(tmpDir, target);
    const manifest = buildFixtureCapsule(capsuleRoot, target);
    const catalogPath = buildCatalog(tmpDir, target);

    // 1. Verify capsule offline
    const capsule = ensureRecoveryCapsule({
      fromVersion: "0.1.5",
      platform: process.platform,
      arch: process.arch,
      catalogPath,
      capsuleDir: capsuleRoot,
    });
    expect(capsule.verified).toBe(true);

    // 2. Create rollback state
    const dataDir = path.join(tmpDir, "data");
    fs.mkdirSync(dataDir, { recursive: true });

    const manifestHash = sha256(fs.readFileSync(path.join(capsuleRoot, "manifest.json")));
    createRollbackState(dataDir, {
      phase: "staging",
      databaseId: "offline-test",
      snapshotSha256: "c".repeat(64),
      capsuleSha256: manifestHash,
      stagedDatabase: "staged.db",
      retainedV3Database: "retained.db",
    });

    const state1 = readRollbackState(dataDir);
    expect(state1!.phase).toBe("staging");

    // 3. Fence writes
    advanceRollbackState(dataDir, "staging", "fenced");
    expect(() => assertWritesAllowed(dataDir)).toThrow(RollbackFencedError);

    // 4. Abort — simulates user deciding not to proceed
    const result = abortRollback({ dataDir });
    expect(result.aborted).toBe(true);
    expect(readRollbackState(dataDir)).toBeNull();
    expect(() => assertWritesAllowed(dataDir)).not.toThrow();
  });
});
