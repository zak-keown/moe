import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";

const PACKAGE_ROOT = join(import.meta.dirname, "..");

function readJson(relPath: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(PACKAGE_ROOT, relPath), "utf-8"));
}

function readYaml(relPath: string): Record<string, unknown> {
  return parse(readFileSync(join(PACKAGE_ROOT, relPath), "utf-8"));
}

describe("package contract", () => {
  const pkg = readJson("package.json") as Record<string, unknown>;
  const mint = readYaml("mint/moe-memory.yaml") as Record<string, unknown>;

  it("source package version is 0.2.0", () => {
    expect(pkg.version).toBe("0.2.0");
  });

  it("mint yaml version matches source package", () => {
    expect(mint.version).toBe(pkg.version);
  });

  it("source dependencies include the bundled runtime inputs", () => {
    const deps = pkg.dependencies as Record<string, string>;
    expect(deps["@huggingface/tokenizers"]).toBe("0.1.3");
    expect(deps["onnxruntime-web"]).toBeDefined();
    expect(deps["@modelcontextprotocol/sdk"]).toBeDefined();
  });

  it("preserves source exports and main entry", () => {
    expect(pkg.main).toBe("dist/index.js");
    const exports = pkg.exports as Record<string, unknown>;
    const root = exports["."] as Record<string, string>;
    expect(root.import).toBe("./dist/index.js");
  });

  it("declares bundled dependency policy in mint yaml", () => {
    const artifact = mint.artifact as Record<string, unknown>;
    const nodePackage = artifact.node_package as Record<string, string>;
    expect(nodePackage.dependencies).toBe("bundled");
  });

  it("declares all required payload roots", () => {
    const artifact = mint.artifact as Record<string, unknown>;
    const payloads = artifact.payloads as Array<{ from: string; to: string; required: boolean }>;
    const fromPaths = payloads.map((p) => p.from);
    expect(fromPaths).toContain("dist");
    expect(fromPaths).toContain("runtime");
    expect(fromPaths).toContain("vendor/sqlite-vec");
    expect(fromPaths).toContain("skills");
    expect(fromPaths).toContain("agents");
    expect(fromPaths).toContain("prompts");
    expect(fromPaths).toContain("hooks");
  });

  it("recovery payload is optional", () => {
    const artifact = mint.artifact as Record<string, unknown>;
    const payloads = artifact.payloads as Array<{ from: string; required: boolean }>;
    const recovery = payloads.find((p) => p.from === "recovery");
    expect(recovery).toBeDefined();
    expect(recovery!.required).toBe(false);
  });

  it("has no lifecycle scripts in the generated artifact scope", () => {
    const scripts = pkg.scripts as Record<string, string>;
    expect(scripts.postinstall).toBeUndefined();
    expect(scripts.preinstall).toBeUndefined();
    expect(scripts.install).toBeUndefined();
  });
});
