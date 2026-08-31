import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

/**
 * The only black-box test of the shipped CLI, and the only guard on prompt
 * bundling.
 *
 * Upstream this shelled `bun build --compile ./src/index.ts` into a temp
 * binary and ran it from a foreign cwd. Its stated purpose was to catch
 * "asset-bundling regressions (e.g. import.meta.dir vs. text-imports for the
 * .md prompt files) that bun run alone cannot" — and a plan doc called it
 * "the closest thing to a real black-box e2e test the repo has".
 *
 * There is no single-file binary here (ARCHITECTURE.md §6: `tsc -b`), so the
 * subject is `dist/qa/index.js` run by `node` from a temp directory with no
 * `node_modules` and no prompt `.md` files reachable by any relative path.
 * That is the same invariant: if the seven prompt bodies ever stop being
 * string literals in the emitted JavaScript — if someone "simplifies"
 * src/qa/agent/prompts/generated.ts back into `readFileSync` — this fails.
 *
 * It needs `dist/`. turbo's `test dependsOn build` provides it; a bare
 * `vitest run` does not, so the suite self-skips with a reason rather than
 * failing confusingly.
 */
const PKG_ROOT = join(import.meta.dirname, "..", "..", "..");
const ENTRY = join(PKG_ROOT, "dist", "cli.js");
const HAVE_DIST = existsSync(ENTRY);
if (!HAVE_DIST) {
  console.error(
    `[skip] ${ENTRY} is missing — build first ` +
      "(`pnpm --filter @bubstack/moe-flight build`). This suite is the only " +
      "black-box check that the prompt bodies survive the build.",
  );
}

describe.skipIf(!HAVE_DIST)("built CLI --show-prompt-and-exit", () => {
  test("works from a directory outside the build tree", () => {
    const runDir = mkdtempSync(join(tmpdir(), "moe-flight-bin-run-"));
    try {
      mkdirSync(join(runDir, ".moe-flight", "context"), { recursive: true });
      writeFileSync(join(runDir, ".moe-flight", "context", "x.md"), "x", "utf-8");
      const cardPath = join(runDir, "card.md");
      writeFileSync(
        cardPath,
        "---\nid: bs-001\ntitle: Smoke\n---\n\n## Acceptance Criteria\n- ok\n",
        "utf-8",
      );

      const r = spawnSync(
        process.execPath,
        [
          ENTRY,
          // `qa` is the namespace the upstream `gauntlet` bin collapsed into.
          "qa",
          "run",
          cardPath,
          "--target",
          "http://x",
          "--project-dir",
          runDir,
          "--show-prompt-and-exit",
        ],
        { cwd: runDir, encoding: "utf-8" },
      );

      expect(r.status).toBe(0);
      // Persona body — proves the prompt text is in the emitted JS, not read
      // from a .md relative to cwd.
      expect(r.stdout).toContain("You are a black box software QA engineer");
      // Adapter-web body — a second prompt file, loaded by a different code path.
      expect(r.stdout).toContain("Side trips for sign-in flows");
    } finally {
      rmSync(runDir, { recursive: true, force: true });
    }
  }, 60_000);
});
