import { describe, it, expect } from "vitest";
import path from "node:path";
import { spawnSync } from "node:child_process";

const CLI_PATH = path.resolve(import.meta.dirname, "../dist/cli.js");

function runHook(extraArgs: string[] = [], env: Record<string, string> = {}): {
  status: number | null;
  stdout: string;
  stderr: string;
} {
  const result = spawnSync(process.execPath, [CLI_PATH, "sync", "--hook", ...extraArgs], {
    encoding: "utf-8",
    timeout: 10_000,
    env: {
      ...process.env,
      MOE_MEMORY_SUMMARIZER_GUARD: "1",
      ...env,
    },
  });
  return {
    status: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

describe("sync --hook mode", () => {
  it("returns zero even when reentrancy guard fires", () => {
    const result = runHook();
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
  });

  it("returns zero and produces no stdout", () => {
    const result = runHook([], { MOE_MEMORY_SUMMARIZER_GUARD: "0" });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
  });

  it("bounds stderr output", () => {
    const result = runHook();
    if (result.stderr) {
      expect(result.stderr.length).toBeLessThan(2048);
    }
  });
});
