import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CLI = join(PACKAGE_ROOT, "dist", "cli.js");

describe("sync-cli reentrancy guard (#87)", () => {
  it("exits 0 silently when MOE_MEMORY_SUMMARIZER_GUARD=1", () => {
    const result = spawnSync(process.execPath, [CLI, "sync"], {
      env: { ...process.env, MOE_MEMORY_SUMMARIZER_GUARD: "1" },
      timeout: 5000,
      encoding: "utf-8",
    });

    expect(result.status).toBe(0);
    // The guard message goes to stderr, normal sync output to stdout.
    expect(result.stderr).toMatch(/skipping sync.*subprocess/i);
    expect(result.stdout).not.toMatch(/Syncing conversations/);
  });

  it("also bails out when the guard is set together with --background", () => {
    // Without the guard, --background would fork a detached child.
    // With the guard, we should exit before reaching the spawn() call.
    const result = spawnSync(process.execPath, [CLI, "sync", "--background"], {
      env: { ...process.env, MOE_MEMORY_SUMMARIZER_GUARD: "1" },
      timeout: 5000,
      encoding: "utf-8",
    });

    expect(result.status).toBe(0);
    expect(result.stdout).not.toMatch(/Sync started in background/);
  });
});
