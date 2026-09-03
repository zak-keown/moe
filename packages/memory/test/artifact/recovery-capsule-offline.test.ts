import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  verifyRecoveryCapsule,
  type RecoveryCapsuleManifest,
} from "../../src/recovery-capsule.js";

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
    dependencies: [
      { name: "better-sqlite3", version: "12.4.1", integrity: "sha512-abc" },
    ],
    lifecyclePolicy: [
      { package: "better-sqlite3", script: "install", executed: true },
    ],
    legalFiles: [
      {
        path: "LICENSE",
        sha256: sha256(license),
        bytes: license.length,
      },
    ],
  };

  fs.writeFileSync(
    path.join(root, "manifest.json"),
    JSON.stringify(manifest, null, 2),
  );

  return manifest;
}

describe("recovery capsule offline verification", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "recovery-offline-"),
    );
  });

  afterEach(async () => {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  });

  it("verifies a self-contained fixture capsule with no network", () => {
    const capsuleRoot = path.join(tmpDir, "darwin-arm64");
    buildFixtureCapsule(capsuleRoot, "darwin-arm64");

    const result = verifyRecoveryCapsule(capsuleRoot, {
      platform: "darwin",
      arch: "arm64",
    });

    expect(result.verified).toBe(true);
    expect(result.manifest.memoryVersion).toBe("0.1.5");
    expect(result.manifest.target).toBe("darwin-arm64");
    expect(result.manifest.dependencies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "better-sqlite3" }),
      ]),
    );
  });

  it("captures lifecycle policy for native dependencies", () => {
    const capsuleRoot = path.join(tmpDir, "linux-x64");
    const manifest = buildFixtureCapsule(capsuleRoot, "linux-x64");

    const result = verifyRecoveryCapsule(capsuleRoot, {
      platform: "linux",
      arch: "x64",
    });

    expect(result.manifest.lifecyclePolicy).toEqual([
      { package: "better-sqlite3", script: "install", executed: true },
    ]);
  });

  it("requires legal files in the capsule", () => {
    const capsuleRoot = path.join(tmpDir, "linux-arm64");
    buildFixtureCapsule(capsuleRoot, "linux-arm64");

    // Read and tamper the manifest to have empty legalFiles
    const manifestPath = path.join(capsuleRoot, "manifest.json");
    const m = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    m.legalFiles = [];
    fs.writeFileSync(manifestPath, JSON.stringify(m));

    expect(() =>
      verifyRecoveryCapsule(capsuleRoot, {
        platform: "linux",
        arch: "arm64",
      }),
    ).toThrow(/invalid/);
  });

  it("verifies all four supported targets", () => {
    for (const [platform, arch] of [
      ["darwin", "arm64"],
      ["darwin", "x64"],
      ["linux", "arm64"],
      ["linux", "x64"],
    ] as const) {
      const target = `${platform}-${arch}`;
      const capsuleRoot = path.join(tmpDir, target);
      buildFixtureCapsule(capsuleRoot, target);

      const result = verifyRecoveryCapsule(capsuleRoot, { platform, arch });
      expect(result.verified).toBe(true);
      expect(result.target).toBe(target);
    }
  });
});
