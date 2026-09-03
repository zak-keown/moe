import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import {
  type InstalledPackageRoot,
  resolveInstalledPackageRoot,
} from "../src/installed-package-root.js";
import {
  loadNativeAssetManifest,
  type NativeAssetManifest,
  resolveNativeAsset,
  verifyNativeAsset,
} from "../src/native-assets.js";

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(THIS_DIR, "..") as InstalledPackageRoot;

describe("native asset manifest", () => {
  let manifest: NativeAssetManifest;

  beforeAll(() => {
    manifest = loadNativeAssetManifest(PACKAGE_ROOT);
  });

  it("loads the manifest from the package root", () => {
    expect(manifest.name).toBe("sqlite-vec");
    expect(manifest.version).toBe("0.1.9");
  });

  it.each(["darwin-arm64", "darwin-x64", "linux-arm64", "linux-x64", "win32-x64"] as const)(
    "accounts for %s once",
    (target) => {
      expect(manifest.targets[target]).toBeDefined();
      expect(manifest.targets[target].target).toBe(target);
    },
  );

  it("verifies the local platform binary", () => {
    const target = `${process.platform}-${process.arch}` as keyof typeof manifest.targets;
    const record = manifest.targets[target];
    if (!record) return; // skip on unsupported CI platforms
    const absolutePath = verifyNativeAsset(PACKAGE_ROOT, record);
    expect(absolutePath).toContain("vec0.");
  });

  it("rejects a path escape", () => {
    const record = {
      ...manifest.targets["darwin-arm64"],
      path: "../vec0.dylib",
    };
    expect(() => verifyNativeAsset(PACKAGE_ROOT, record)).toThrow(/escape/);
  });

  it("rejects an absolute path", () => {
    const record = {
      ...manifest.targets["darwin-arm64"],
      path: "/etc/passwd",
    };
    expect(() => verifyNativeAsset(PACKAGE_ROOT, record)).toThrow(/escape/);
  });

  it("rejects a tampered hash", () => {
    const record = {
      ...manifest.targets["darwin-arm64"],
      sha256: "0000000000000000000000000000000000000000000000000000000000000000",
    };
    expect(() => verifyNativeAsset(PACKAGE_ROOT, record)).toThrow(/SHA-256 mismatch/);
  });

  it("rejects a tampered size", () => {
    const record = {
      ...manifest.targets["darwin-arm64"],
      bytes: 1,
    };
    expect(() => verifyNativeAsset(PACKAGE_ROOT, record)).toThrow(/size mismatch/);
  });
});

describe("resolveNativeAsset", () => {
  it("resolves the local platform binary", () => {
    const asset = resolveNativeAsset(PACKAGE_ROOT);
    expect(asset.record.target).toBe(`${process.platform}-${process.arch}`);
    expect(asset.absolutePath).toContain("vec0.");
  });

  it("selects a specific target", () => {
    const asset = resolveNativeAsset(PACKAGE_ROOT, "darwin", "arm64");
    expect(asset.record.target).toBe("darwin-arm64");
  });

  it("throws for unsupported target", () => {
    expect(() => resolveNativeAsset(PACKAGE_ROOT, "freebsd" as NodeJS.Platform, "x64")).toThrow(
      /unsupported/,
    );
  });
});

describe("fixture-based containment", () => {
  it("selects exactly one verified asset from a fixture package root", () => {
    const tmpRoot = mkdtempSync(resolve(tmpdir(), "native-asset-test-")) as InstalledPackageRoot;
    const vendorDir = resolve(tmpRoot, "vendor", "sqlite-vec", "linux-x64");
    mkdirSync(vendorDir, { recursive: true });

    const srcManifest = loadNativeAssetManifest(PACKAGE_ROOT);
    const linuxRecord = srcManifest.targets["linux-x64"];

    const srcBinary = resolve(PACKAGE_ROOT, "vendor", "sqlite-vec", linuxRecord.path);
    copyFileSync(srcBinary, resolve(vendorDir, "vec0.so"));

    const dummyRecord = (target: string) => ({
      ...linuxRecord,
      target,
      path: "linux-x64/vec0.so",
    });
    const fixtureManifest = {
      name: "sqlite-vec",
      version: "0.1.9",
      targets: {
        "darwin-arm64": dummyRecord("darwin-arm64"),
        "darwin-x64": dummyRecord("darwin-x64"),
        "linux-arm64": dummyRecord("linux-arm64"),
        "linux-x64": linuxRecord,
        "win32-x64": dummyRecord("win32-x64"),
      },
    };
    const manifestDir = resolve(tmpRoot, "vendor", "sqlite-vec");
    writeFileSync(resolve(manifestDir, "manifest.json"), JSON.stringify(fixtureManifest));

    const asset = resolveNativeAsset(tmpRoot, "linux", "x64");
    expect(asset.record.target).toBe("linux-x64");
    expect(asset.absolutePath).toContain(tmpRoot);
  });
});
