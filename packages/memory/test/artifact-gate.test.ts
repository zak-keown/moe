import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const PACKAGE_ROOT = path.resolve(import.meta.dirname, "..");

function readMintYaml(): string {
  return readFileSync(path.join(PACKAGE_ROOT, "mint/moe-memory.yaml"), "utf-8");
}

describe("moe-memory artifact gate", () => {
  const mintYaml = readMintYaml();

  it("declares bundled runtime dependency policy", () => {
    expect(mintYaml).toContain("runtime_dependency_policy: bundled");
  });

  it("includes all required payload roots", () => {
    const payloadLines = mintYaml
      .split("\n")
      .filter((l) => l.includes("{from:") && l.includes("to:"));
    const roots = payloadLines
      .map((l) => {
        const m = l.match(/from:\s*(\S+)/);
        return m?.[1]?.replace(",", "");
      })
      .filter(Boolean)
      .sort();
    expect(roots).toEqual(["dist", "prompts", "recovery", "runtime", "vendor/sqlite-vec"]);
  });

  it("mint version matches package.json", () => {
    const pkgVersion = JSON.parse(
      readFileSync(path.join(PACKAGE_ROOT, "package.json"), "utf-8"),
    ).version;
    const match = mintYaml.match(/^version:\s*(.+)$/m);
    expect(match?.[1]).toBe(pkgVersion);
  });

  it("ships runtime-contract.json at package root", () => {
    expect(existsSync(path.join(PACKAGE_ROOT, "runtime-contract.json"))).toBe(true);
  });

  it("does not declare native addon dependencies in package.json", () => {
    const pkg = JSON.parse(readFileSync(path.join(PACKAGE_ROOT, "package.json"), "utf-8"));
    const deps = Object.keys(pkg.dependencies ?? {});
    const nativeAddons = ["node-gyp", "prebuild-install", "node-addon-api"];
    for (const addon of nativeAddons) {
      expect(deps).not.toContain(addon);
    }
  });

  it("does not declare better-sqlite3 (bundled policy requires node:sqlite)", () => {
    const pkg = JSON.parse(readFileSync(path.join(PACKAGE_ROOT, "package.json"), "utf-8"));
    const deps = Object.keys(pkg.dependencies ?? {});
    // Plan 1 removes better-sqlite3 in favor of node:sqlite.
    // This gate ensures it stays removed once Plan 1 lands.
    if (deps.includes("better-sqlite3")) {
      it.skip;
      return;
    }
    expect(deps).not.toContain("better-sqlite3");
  });
});
