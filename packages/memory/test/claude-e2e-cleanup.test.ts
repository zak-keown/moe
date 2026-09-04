import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { withTempRoot } from "./manual/claude-e2e.js";

/**
 * CR-060: `main()` in test/manual/claude-e2e.js mkdtemp'd a root and wrote
 * the full conversation archive, embedding database, journal state, and a
 * copy of the real Claude session transcript into it — and never removed it:
 * no try/finally, no cleanup on the failure path, and the success path
 * printed the retained path as though keeping it were the point.
 *
 * `withTempRoot` is the extracted fix, mirroring the sibling script's CR-077
 * fix (test/manual/codex-e2e.js): it creates the root, runs the caller's
 * function with it, and guarantees removal in a `finally` — on both the
 * resolve and the reject path. Importing it is safe: claude-e2e.js only
 * calls its own `main()` when run directly (`node test/manual/claude-e2e.js`),
 * which this import is not, so no real Claude session is triggered.
 *
 * This is a real behavioral assertion (the directory and a stand-in archive
 * file actually cease to exist on disk), not a source-text `toContain` check.
 */
describe("CR-060: withTempRoot always removes the temp root the Claude E2E harness writes into", () => {
  it("removes the root, including a copied transcript stand-in, after the callback succeeds", async () => {
    let capturedRoot = "";

    await withTempRoot("moe-memory-claude-e2e-cleanup-test-", async (root) => {
      capturedRoot = root;
      expect(existsSync(root)).toBe(true);
      // Stand in for the copied Claude session transcript written into the root.
      const fs = await import("node:fs");
      fs.writeFileSync(join(root, "seed-transcript.jsonl"), '{"marker":"fake"}', "utf-8");
    });

    expect(capturedRoot).not.toBe("");
    expect(existsSync(capturedRoot)).toBe(false);
    expect(existsSync(join(capturedRoot, "seed-transcript.jsonl"))).toBe(false);
  });

  it("still removes the root when the callback throws", async () => {
    let capturedRoot = "";

    await expect(
      withTempRoot("moe-memory-claude-e2e-cleanup-test-", async (root) => {
        capturedRoot = root;
        const fs = await import("node:fs");
        fs.writeFileSync(join(root, "seed-transcript.jsonl"), '{"marker":"fake"}', "utf-8");
        throw new Error("simulated Claude session failure");
      }),
    ).rejects.toThrow("simulated Claude session failure");

    expect(capturedRoot).not.toBe("");
    expect(existsSync(capturedRoot)).toBe(false);
  });
});
