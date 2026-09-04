import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const REPO_ROOT = join(import.meta.dirname, "../../..");
const PACKAGE_ROOT = join(import.meta.dirname, "..");

function readNotice(): string {
  return readFileSync(join(REPO_ROOT, "NOTICE"), "utf-8");
}

function readMintYaml(): Record<string, unknown> {
  return parse(readFileSync(join(PACKAGE_ROOT, "mint/moe-memory.yaml"), "utf-8"));
}

function readPackageJson(): Record<string, unknown> {
  return JSON.parse(readFileSync(join(PACKAGE_ROOT, "package.json"), "utf-8"));
}

const BUNDLED_WORKS = [
  "@huggingface/tokenizers",
  "onnxruntime-web",
  "sqlite-vec",
  "proper-lockfile",
  "marked",
] as const;

describe("legal closure for redistributed Memory runtime", () => {
  it("every bundled runtime dependency has a NOTICE entry", () => {
    const notice = readNotice();
    const missing: string[] = [];
    for (const work of BUNDLED_WORKS) {
      const escaped = work.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (!new RegExp(`\\|\\s*\`${escaped}\`\\s*\\|`).test(notice)) {
        missing.push(work);
      }
    }
    expect(missing).toEqual([]);
  });

  it("every bundled work is listed in mint imported_works", () => {
    const mint = readMintYaml();
    const importedWorks = (mint.imported_works as Array<{ name: string }>).map((w) => w.name);
    const missing = BUNDLED_WORKS.filter((work) => !importedWorks.includes(work));
    expect(missing).toEqual([]);
  });

  it("sqlite-vec vendor manifest exists and declares platform binaries", () => {
    const manifestPath = join(PACKAGE_ROOT, "vendor/sqlite-vec/manifest.json");
    expect(existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    expect(manifest.version).toBe("0.1.9");
    const platforms = Object.keys(manifest.targets);
    expect(platforms).toContain("darwin-arm64");
    expect(platforms).toContain("linux-x64");
    expect(platforms).toContain("win32-x64");
  });

  it("every source dependency is either bundled or an SDK/framework", () => {
    const pkg = readPackageJson();
    const deps = Object.keys(pkg.dependencies as Record<string, string>);
    const notice = readNotice();
    const allowed = new Set([...BUNDLED_WORKS, "@modelcontextprotocol/sdk", "zod"]);
    const unaccounted: string[] = [];
    for (const dep of deps) {
      if (allowed.has(dep)) continue;
      const escaped = dep.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (!new RegExp(`\\|\\s*\`${escaped}\`\\s*\\|`).test(notice)) {
        unaccounted.push(dep);
      }
    }
    expect(unaccounted).toEqual([]);
  });
});
