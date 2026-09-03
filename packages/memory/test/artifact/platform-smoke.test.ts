import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SCRIPTS_DIR = join(import.meta.dirname, "../../scripts");

interface RuntimeMatrix {
  node: readonly string[];
  native: readonly string[];
  databaseOnly: readonly string[];
}

function readRuntimeMatrix(): RuntimeMatrix {
  const source = readFileSync(join(SCRIPTS_DIR, "smoke-runtime.mjs"), "utf8");

  const nodeMatch = source.match(/NODE_LANES\s*=\s*(\[[^\]]+\])/);
  const nativeMatch = source.match(/NATIVE_LANES\s*=\s*(\[[^\]]+\])/);
  const dbOnlyMatch = source.match(/DATABASE_ONLY_LANES\s*=\s*(\[[^\]]+\])/);

  if (!nodeMatch || !nativeMatch || !dbOnlyMatch) {
    throw new Error("smoke-runtime.mjs must export NODE_LANES, NATIVE_LANES, and DATABASE_ONLY_LANES");
  }

  return {
    node: JSON.parse(nodeMatch[1]) as string[],
    native: JSON.parse(nativeMatch[1]) as string[],
    databaseOnly: JSON.parse(dbOnlyMatch[1]) as string[],
  };
}

describe("runtime platform matrix", () => {
  it("declares the required node, native, and database-only lanes", () => {
    expect(readRuntimeMatrix()).toEqual({
      node: ["22.13.0", "22.23.2", "24.20.0"],
      native: ["darwin-arm64", "darwin-x64", "linux-arm64", "linux-x64"],
      databaseOnly: ["win32-x64"],
    });
  });

  it("smoke-runtime.mjs consumes a PackedArtifact record path argument", () => {
    const source = readFileSync(join(SCRIPTS_DIR, "smoke-runtime.mjs"), "utf8");
    expect(source).toContain("--packed-artifact");
    expect(source).not.toContain("node_modules");
  });

  it("CI workflow exists and uses the matrix", () => {
    const workflowPath = join(import.meta.dirname, "../../../../.github/workflows/memory-runtime.yml");
    const workflow = readFileSync(workflowPath, "utf8");
    expect(workflow).toContain("memory-runtime");
    expect(workflow).toContain("packed-artifact");
    expect(workflow).not.toMatch(/packages\/memory.*npm publish/);
    expect(workflow).not.toContain("pnpm link");
  });
});
