import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { withTempRoot } from "./manual/codex-e2e.js";

/**
 * CR-077: `main()` in test/manual/codex-e2e.js mkdtemp'd a root, copied the
 * user's live Codex `auth.json` into it via `copyCodexAuth`, and never
 * removed it — no try/finally, no cleanup on the failure path, and the
 * success path printed the retained path as though keeping it were the
 * point. Every run left a permanent second copy of a live credential outside
 * the credential store.
 *
 * `withTempRoot` is the extracted fix: it creates the root, runs the caller's
 * function with it, and guarantees removal in a `finally` — on both the
 * resolve and the reject path. Importing it is safe: codex-e2e.js only calls
 * its own `main()` when run directly (`node test/manual/codex-e2e.js`), which
 * this import is not, so no real Codex session is triggered.
 *
 * This is a real behavioral assertion (the directory and a stand-in
 * credential file actually cease to exist on disk), not the source-text
 * `toContain` checks codex-e2e-script.test.ts uses for the rest of the
 * script — the fix under test is exactly the runtime cleanup behavior a text
 * match cannot see.
 */
describe("CR-077: withTempRoot always removes the temp root that holds the copied Codex auth", () => {
  it("removes the root, including a copied auth.json stand-in, after the callback succeeds", async () => {
    let capturedRoot = "";

    await withTempRoot("moe-memory-codex-e2e-cleanup-test-", async (root) => {
      capturedRoot = root;
      expect(existsSync(root)).toBe(true);
      // Stand in for copyCodexAuth writing the live credential into the root.
      const fs = await import("node:fs");
      fs.writeFileSync(join(root, "auth.json"), '{"tokens":"fake"}', "utf-8");
    });

    expect(capturedRoot).not.toBe("");
    expect(existsSync(capturedRoot)).toBe(false);
    expect(existsSync(join(capturedRoot, "auth.json"))).toBe(false);
  });

  it("still removes the root when the callback throws", async () => {
    let capturedRoot = "";

    await expect(
      withTempRoot("moe-memory-codex-e2e-cleanup-test-", async (root) => {
        capturedRoot = root;
        const fs = await import("node:fs");
        fs.writeFileSync(join(root, "auth.json"), '{"tokens":"fake"}', "utf-8");
        throw new Error("simulated Codex session failure");
      }),
    ).rejects.toThrow("simulated Codex session failure");

    expect(capturedRoot).not.toBe("");
    expect(existsSync(capturedRoot)).toBe(false);
  });
});
