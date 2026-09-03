import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ensureRecoveryCapsule,
  loadCatalog,
  RecoveryCapsuleError,
  type RecoveryCapsuleManifest,
  validateManifest,
  verifyRecoveryCapsule,
} from "../src/recovery-capsule.js";

function sha256(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function writeCapsule(root: string, manifest: RecoveryCapsuleManifest): void {
  fs.mkdirSync(root, { recursive: true });

  // Write the package tarball
  const tarballContent = Buffer.from("fake-tarball-content");
  const tarballPath = path.join(root, manifest.packageTarball.path);
  fs.writeFileSync(tarballPath, tarballContent);
  (manifest.packageTarball as any).sha256 = sha256(tarballContent);
  (manifest.packageTarball as any).bytes = tarballContent.length;

  // Write installed files
  for (const file of manifest.installedFiles as any[]) {
    const content = Buffer.from(`installed-${file.path}`);
    const filePath = path.join(root, file.path);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
    file.sha256 = sha256(content);
    file.bytes = content.length;
  }

  // Write legal files
  for (const file of manifest.legalFiles as any[]) {
    const content = Buffer.from(`MIT License\nCopyright 2026`);
    const filePath = path.join(root, file.path);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
    file.sha256 = sha256(content);
    file.bytes = content.length;
  }

  fs.writeFileSync(path.join(root, "manifest.json"), JSON.stringify(manifest, null, 2));
}

function makeManifest(target: string): RecoveryCapsuleManifest {
  return {
    schema: 1,
    memoryVersion: "0.1.5",
    nodeRange: ">=24",
    target,
    packageTarball: { path: "bubstack-moe-memory-0.1.5.tgz", sha256: "", bytes: 0 },
    installedFiles: [
      { path: "dist/index.js", sha256: "", bytes: 0 },
      { path: "dist/db.js", sha256: "", bytes: 0 },
    ],
    dependencies: [{ name: "better-sqlite3", version: "12.4.1", integrity: "sha512-fake" }],
    lifecyclePolicy: [{ package: "better-sqlite3", script: "install", executed: true }],
    legalFiles: [{ path: "LICENSE", sha256: "", bytes: 0 }],
  };
}

describe("recovery capsule validation", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "recovery-test-"));
  });

  afterEach(async () => {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  });

  it("validates a well-formed manifest", () => {
    expect(validateManifest(makeManifest("darwin-arm64"))).toBe(true);
  });

  it("rejects manifest with wrong schema", () => {
    const m = { ...makeManifest("darwin-arm64"), schema: 2 };
    expect(validateManifest(m)).toBe(false);
  });

  it("rejects manifest with wrong memoryVersion", () => {
    const m = { ...makeManifest("darwin-arm64"), memoryVersion: "0.1.4" };
    expect(validateManifest(m)).toBe(false);
  });

  it("rejects manifest with unsupported target", () => {
    const m = { ...makeManifest("win32-x64") };
    expect(validateManifest(m)).toBe(false);
  });

  it("rejects manifest with empty legalFiles", () => {
    const m = { ...makeManifest("darwin-arm64"), legalFiles: [] };
    expect(validateManifest(m)).toBe(false);
  });

  it("rejects null/undefined manifest", () => {
    expect(validateManifest(null)).toBe(false);
    expect(validateManifest(undefined)).toBe(false);
  });

  it("verifies a valid capsule", () => {
    const manifest = makeManifest("darwin-arm64");
    const capsuleRoot = path.join(tmpDir, "capsule");
    writeCapsule(capsuleRoot, manifest);

    const result = verifyRecoveryCapsule(capsuleRoot, {
      platform: "darwin",
      arch: "arm64",
    });
    expect(result.verified).toBe(true);
    expect(result.target).toBe("darwin-arm64");
    expect(result.manifest.memoryVersion).toBe("0.1.5");
  });

  it("rejects capsule with target mismatch", () => {
    const manifest = makeManifest("linux-x64");
    const capsuleRoot = path.join(tmpDir, "capsule");
    writeCapsule(capsuleRoot, manifest);

    expect(() =>
      verifyRecoveryCapsule(capsuleRoot, {
        platform: "darwin",
        arch: "arm64",
      }),
    ).toThrow(RecoveryCapsuleError);
  });

  it("rejects capsule with unsupported platform", () => {
    expect(() =>
      verifyRecoveryCapsule(path.join(tmpDir, "nonexistent"), {
        platform: "win32",
        arch: "x64",
      }),
    ).toThrow(/unsupported target/);
  });

  it("detects tampered file (integrity mismatch)", () => {
    const manifest = makeManifest("darwin-arm64");
    const capsuleRoot = path.join(tmpDir, "capsule");
    writeCapsule(capsuleRoot, manifest);

    // Tamper with a file — same byte count, different content
    const original = fs.readFileSync(path.join(capsuleRoot, "dist/index.js"));
    const tampered = Buffer.alloc(original.length, "X");
    fs.writeFileSync(path.join(capsuleRoot, "dist/index.js"), tampered);

    expect(() =>
      verifyRecoveryCapsule(capsuleRoot, {
        platform: "darwin",
        arch: "arm64",
      }),
    ).toThrow(/integrity mismatch/);
  });

  it("detects tampered file (size mismatch)", () => {
    const manifest = makeManifest("darwin-arm64");
    const capsuleRoot = path.join(tmpDir, "capsule");
    writeCapsule(capsuleRoot, manifest);

    // Read the manifest, change the declared size without changing the file
    const rawManifest = JSON.parse(
      fs.readFileSync(path.join(capsuleRoot, "manifest.json"), "utf8"),
    );
    rawManifest.installedFiles[0].bytes = 999;
    fs.writeFileSync(path.join(capsuleRoot, "manifest.json"), JSON.stringify(rawManifest));

    expect(() =>
      verifyRecoveryCapsule(capsuleRoot, {
        platform: "darwin",
        arch: "arm64",
      }),
    ).toThrow(/size mismatch/);
  });

  it("rejects path escape in installed files", () => {
    const manifest = makeManifest("darwin-arm64");
    (manifest.installedFiles as any[])[0].path = "../escape.js";
    const capsuleRoot = path.join(tmpDir, "capsule");
    writeCapsule(capsuleRoot, manifest);

    expect(() =>
      verifyRecoveryCapsule(capsuleRoot, {
        platform: "darwin",
        arch: "arm64",
      }),
    ).toThrow(/path escape/);
  });

  it("rejects absolute path in files", () => {
    const manifest = makeManifest("darwin-arm64");
    (manifest.installedFiles as any[])[0].path = "/etc/passwd";
    const capsuleRoot = path.join(tmpDir, "capsule");
    writeCapsule(capsuleRoot, manifest);

    expect(() =>
      verifyRecoveryCapsule(capsuleRoot, {
        platform: "darwin",
        arch: "arm64",
      }),
    ).toThrow(/path escape/);
  });

  it("rejects unknown files in capsule", () => {
    const manifest = makeManifest("darwin-arm64");
    const capsuleRoot = path.join(tmpDir, "capsule");
    writeCapsule(capsuleRoot, manifest);

    // Add an extra file
    fs.writeFileSync(path.join(capsuleRoot, "sneaky.txt"), "unexpected");

    expect(() =>
      verifyRecoveryCapsule(capsuleRoot, {
        platform: "darwin",
        arch: "arm64",
      }),
    ).toThrow(/unknown file/);
  });

  it("rejects missing declared file", () => {
    const manifest = makeManifest("darwin-arm64");
    const capsuleRoot = path.join(tmpDir, "capsule");
    writeCapsule(capsuleRoot, manifest);

    // Remove a declared file
    fs.unlinkSync(path.join(capsuleRoot, "dist/db.js"));

    expect(() =>
      verifyRecoveryCapsule(capsuleRoot, {
        platform: "darwin",
        arch: "arm64",
      }),
    ).toThrow(/missing/);
  });

  it("rejects missing manifest.json", () => {
    const capsuleRoot = path.join(tmpDir, "capsule");
    fs.mkdirSync(capsuleRoot, { recursive: true });

    expect(() =>
      verifyRecoveryCapsule(capsuleRoot, {
        platform: "darwin",
        arch: "arm64",
      }),
    ).toThrow(/manifest.json not found/);
  });
});

describe("recovery catalog", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "catalog-test-"));
  });

  afterEach(async () => {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  });

  it("loads a valid catalog", () => {
    const catalogPath = path.join(tmpDir, "catalog.json");
    fs.writeFileSync(
      catalogPath,
      JSON.stringify({
        schema: 1,
        memoryVersion: "0.1.5",
        targets: [
          {
            target: "darwin-arm64",
            platform: "darwin",
            arch: "arm64",
            manifestSha256: "abc",
            assetKey: "recovery-darwin-arm64.tar.gz",
          },
        ],
      }),
    );

    const catalog = loadCatalog(catalogPath);
    expect(catalog.targets).toHaveLength(1);
    expect(catalog.targets[0]!.target).toBe("darwin-arm64");
  });

  it("rejects invalid catalog schema", () => {
    const catalogPath = path.join(tmpDir, "catalog.json");
    fs.writeFileSync(
      catalogPath,
      JSON.stringify({ schema: 2, memoryVersion: "0.1.5", targets: [] }),
    );

    expect(() => loadCatalog(catalogPath)).toThrow(/invalid/);
  });
});

describe("ensureRecoveryCapsule", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "ensure-test-"));
  });

  afterEach(async () => {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  });

  it("rejects unsupported version", () => {
    expect(() =>
      ensureRecoveryCapsule({
        fromVersion: "0.1.4",
        platform: "darwin",
        arch: "arm64",
      }),
    ).toThrow(/only 0.1.5/);
  });

  it("rejects unsupported target via ensureRecoveryCapsule", () => {
    expect(() =>
      ensureRecoveryCapsule({
        fromVersion: "0.1.5",
        platform: "win32",
        arch: "x64",
      }),
    ).toThrow(/unsupported target/);
  });

  it("verifies a fixture capsule end-to-end", () => {
    const target = "linux-x64";
    const manifest = makeManifest(target);
    const capsuleRoot = path.join(tmpDir, target);
    writeCapsule(capsuleRoot, manifest);

    const catalogPath = path.join(tmpDir, "catalog.json");
    fs.writeFileSync(
      catalogPath,
      JSON.stringify({
        schema: 1,
        memoryVersion: "0.1.5",
        targets: [
          {
            target,
            platform: "linux",
            arch: "x64",
            manifestSha256: "",
            assetKey: "recovery.tar.gz",
          },
        ],
      }),
    );

    const result = ensureRecoveryCapsule({
      fromVersion: "0.1.5",
      platform: "linux",
      arch: "x64",
      catalogPath,
      capsuleDir: capsuleRoot,
    });

    expect(result.verified).toBe(true);
    expect(result.target).toBe(target);
  });
});
