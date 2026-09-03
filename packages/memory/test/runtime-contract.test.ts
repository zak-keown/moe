import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const PACKAGE_ROOT = join(import.meta.dirname, "..");
const CONTRACT_PATH = join(PACKAGE_ROOT, "runtime-contract.json");

interface RuntimeContract {
  schema: number;
  server: { name: string; command: string; args: string[]; cwd: string };
  forwardEnv: string[];
  assets: Record<string, string>;
}

function loadContract(): RuntimeContract {
  return JSON.parse(readFileSync(CONTRACT_PATH, "utf-8"));
}

const INTERNAL_ENV_ALLOWLIST = new Set([
  "MOE_MEMORY_SUMMARIZER_GUARD",
  "CLAUDE_CODE_MAX_OUTPUT_TOKENS",
]);

const TEST_ENV_ALLOWLIST = new Set([
  "TEST_ARCHIVE_DIR",
  "TEST_DB_PATH",
  "TEST_PROJECTS_DIR",
]);

const PLATFORM_ENV = new Set([
  "HOME",
  "USERPROFILE",
  "TEMP",
  "TMP",
  "NODE_OPTIONS",
  "PATH",
  "ANTHROPIC_BASE_URL",
  "ANTHROPIC_AUTH_TOKEN",
]);

function scanEnvironmentVariables(srcDir: string): Set<string> {
  const vars = new Set<string>();
  const envPattern = /process\.env\.([A-Z][A-Z0-9_]*)/g;

  function walk(dir: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") && !entry.name.endsWith(".d.ts")) {
        const content = readFileSync(full, "utf-8");
        let match: RegExpExecArray | null;
        while ((match = envPattern.exec(content)) !== null) {
          vars.add(match[1]);
        }
      }
    }
  }

  walk(srcDir);
  return vars;
}

describe("runtime-contract reconciliation", () => {
  it("matches every supported host-forwarded variable exactly", () => {
    const contract = loadContract();
    expect(contract.server).toEqual({
      name: "moe-memory",
      command: "node",
      args: ["./dist/cli.js", "mcp-server"],
      cwd: ".",
    });

    const allSourceVars = scanEnvironmentVariables(join(PACKAGE_ROOT, "src"));

    const hostConfigurable = new Set<string>();
    for (const v of allSourceVars) {
      if (INTERNAL_ENV_ALLOWLIST.has(v)) continue;
      if (TEST_ENV_ALLOWLIST.has(v)) continue;
      if (PLATFORM_ENV.has(v)) continue;
      hostConfigurable.add(v);
    }

    const forwarded = new Set(contract.forwardEnv);

    const missingFromContract = [...hostConfigurable].filter((v) => !forwarded.has(v)).sort();
    const extraInContract = [...forwarded].filter((v) => !hostConfigurable.has(v)).sort();

    expect(missingFromContract).toEqual([]);
    expect(extraInContract).toEqual([]);
  });

  it("does not forward internal or test-only variables", () => {
    const contract = loadContract();
    const forwarded = new Set(contract.forwardEnv);

    for (const v of INTERNAL_ENV_ALLOWLIST) {
      expect(forwarded.has(v)).toBe(false);
    }
    for (const v of TEST_ENV_ALLOWLIST) {
      expect(forwarded.has(v)).toBe(false);
    }
  });

  it("forwardEnv is sorted alphabetically", () => {
    const contract = loadContract();
    const sorted = [...contract.forwardEnv].sort();
    expect(contract.forwardEnv).toEqual(sorted);
  });

  it("has no duplicate forwardEnv entries", () => {
    const contract = loadContract();
    const unique = new Set(contract.forwardEnv);
    expect(unique.size).toBe(contract.forwardEnv.length);
  });

  it("asset paths are package-relative and contained", () => {
    const contract = loadContract();
    for (const [key, value] of Object.entries(contract.assets)) {
      expect(value).not.toMatch(/^\//);
      expect(value).not.toContain("..");
    }
  });
});
