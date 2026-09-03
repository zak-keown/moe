import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const PACKAGE_ROOT = path.resolve(import.meta.dirname, "..");

function loadContract(): {
  schema: number;
  server: { name: string; command: string; args: string[]; cwd: string };
  forwardEnv: string[];
  assets: Record<string, string>;
} {
  return JSON.parse(readFileSync(path.join(PACKAGE_ROOT, "runtime-contract.json"), "utf-8"));
}

const INTERNAL_VARS = new Set(["MOE_MEMORY_SUMMARIZER_GUARD"]);

const TEST_ONLY_VARS = new Set([
  "TEST_ARCHIVE_DIR",
  "TEST_DB_PATH",
  "TEST_PROJECTS_DIR",
]);

const PLATFORM_VARS = new Set([
  "HOME",
  "USERPROFILE",
  "TEMP",
  "TMP",
  "NODE_OPTIONS",
  "PATH",
  "ANTHROPIC_BASE_URL",
  "ANTHROPIC_AUTH_TOKEN",
  "CLAUDE_CODE_MAX_OUTPUT_TOKENS",
]);

function scanSourceEnvironmentVariables(): Set<string> {
  const srcDir = path.join(PACKAGE_ROOT, "src");
  const vars = new Set<string>();
  const envPattern = /process\.env\.([A-Z][A-Z0-9_]*)/g;

  function scanDir(dir: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        scanDir(path.join(dir, entry.name));
      } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
        const content = readFileSync(path.join(dir, entry.name), "utf-8");
        for (const match of content.matchAll(envPattern)) {
          if (match[1]) vars.add(match[1]);
        }
      }
    }
  }

  scanDir(srcDir);
  return vars;
}

describe("runtime contract reconciliation", () => {
  const contract = loadContract();
  const sourceVars = scanSourceEnvironmentVariables();

  it("matches every supported host-forwarded variable exactly", () => {
    expect(contract.server).toEqual({
      name: "moe-memory",
      command: "node",
      args: ["./dist/cli.js", "mcp-server"],
      cwd: ".",
    });
  });

  it("accounts for every non-test, non-internal, non-platform env var used in source", () => {
    const forwardSet = new Set(contract.forwardEnv);
    const missing: string[] = [];
    for (const v of sourceVars) {
      if (TEST_ONLY_VARS.has(v) || INTERNAL_VARS.has(v) || PLATFORM_VARS.has(v)) continue;
      if (!forwardSet.has(v)) missing.push(v);
    }
    expect(missing).toEqual([]);
  });

  it("does not forward test-only or internal variables", () => {
    for (const v of TEST_ONLY_VARS) {
      expect(contract.forwardEnv).not.toContain(v);
    }
    for (const v of INTERNAL_VARS) {
      expect(contract.forwardEnv).not.toContain(v);
    }
  });

  it("is deterministically sorted", () => {
    const sorted = [...contract.forwardEnv].sort();
    expect(contract.forwardEnv).toEqual(sorted);
  });

  it("has no duplicate forwardEnv entries", () => {
    const unique = new Set(contract.forwardEnv);
    expect(unique.size).toBe(contract.forwardEnv.length);
  });

  it("asset paths are package-relative and contained", () => {
    for (const [, value] of Object.entries(contract.assets)) {
      expect(value).not.toMatch(/^\//);
      expect(value).not.toContain("..");
    }
  });
});
