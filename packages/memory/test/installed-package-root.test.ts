import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { resolveInstalledPackageRoot } from "../src/installed-package-root.js";

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(THIS_DIR, "..");

describe("resolveInstalledPackageRoot", () => {
  it("resolves the package root from dist/index.js", () => {
    const distIndex = pathToFileURL(resolve(PACKAGE_ROOT, "dist", "index.js"));
    expect(resolveInstalledPackageRoot(distIndex)).toBe(PACKAGE_ROOT);
  });

  it("resolves the package root from dist/cli.js", () => {
    const distCli = pathToFileURL(resolve(PACKAGE_ROOT, "dist", "cli.js"));
    expect(resolveInstalledPackageRoot(distCli)).toBe(PACKAGE_ROOT);
  });

  it("resolves the package root from src/index.js (dev)", () => {
    const srcIndex = pathToFileURL(resolve(PACKAGE_ROOT, "src", "index.js"));
    expect(resolveInstalledPackageRoot(srcIndex)).toBe(PACKAGE_ROOT);
  });

  it("rejects a shared chunk that is not a known entrypoint", () => {
    const chunk = pathToFileURL(resolve(PACKAGE_ROOT, "dist", "db.js"));
    expect(() => resolveInstalledPackageRoot(chunk)).toThrow(/entrypoint/);
  });

  it("accepts a string URL", () => {
    const url = pathToFileURL(resolve(PACKAGE_ROOT, "dist", "index.js")).href;
    expect(resolveInstalledPackageRoot(url)).toBe(PACKAGE_ROOT);
  });
});
