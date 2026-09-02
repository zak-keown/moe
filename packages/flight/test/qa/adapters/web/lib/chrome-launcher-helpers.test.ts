import { createRequire } from "node:module";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

// The CDP library under src/qa/adapters/web/lib/ is vendored CommonJS.
// Bun tolerated a bare `require()` in an ESM file; Node and vitest do not.
// Same fix as src/qa/adapters/web/adapter.ts.
const require = createRequire(import.meta.url);

const { getChromeProfileDir, getXdgCacheHome } = require(
  "../../../../../src/qa/adapters/web/lib/chrome-launcher-helpers.js",
);

// CR-030: `getChromeProfileDir` joined an unvalidated `profileName` straight
// into a cache path. `setProfileName`'s `/^[a-zA-Z0-9_-]+$/` guard only runs
// on the interactive setProfileName() path — startChrome() never calls it —
// so a traversing name (reachable from an LLM-generated story-card id via
// makeRunId -> `moe-flight-run-${runId}` -> chromeProfileName) escapes
// ~/.cache/moe/browser-profiles/ entirely. closeWebAdapter then
// `rm(dir, { recursive: true, force: true })`s whatever that resolves to.
describe("CR-030: getChromeProfileDir containment", () => {
  const root = join(getXdgCacheHome(), "moe", "browser-profiles");

  test("a traversal profile name cannot escape browser-profiles/", () => {
    const dir = getChromeProfileDir("../../../../../../tmp/evil");
    expect(dir === root || dir.startsWith(root + "/")).toBe(true);
    expect(dir).not.toContain("..");
  });

  test("a name with embedded slashes cannot introduce extra path segments", () => {
    const dir = getChromeProfileDir("moe-flight-run-a/b/c");
    expect(dir.startsWith(`${root}/`)).toBe(true);
    const rel = dir.slice(root.length + 1);
    expect(rel).not.toContain("/");
  });

  test("an ordinary alphanumeric name is preserved verbatim", () => {
    const dir = getChromeProfileDir("moe-flight-run-abc123");
    expect(dir).toBe(join(root, "moe-flight-run-abc123"));
  });
});
