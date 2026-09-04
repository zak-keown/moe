import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

// The CDP library under src/qa/adapters/web/lib/ is vendored CommonJS.
// Bun tolerated a bare `require()` in an ESM file; Node and vitest do
// not. Same fix as src/qa/adapters/web/adapter.ts.
const require = createRequire(import.meta.url);

// PRI-1280 regression: within a single process (as in `moe-flight qa serve`),
// successive startChrome calls with different profile names must launch
// Chrome against different --user-data-dirs. Before the fix, the module
// cached the first run's dir and reused it for every later run, leaking
// cookies across scenarios.
describe("chrome profile rotation (PRI-1280)", () => {
  const originalXdg = process.env.XDG_CACHE_HOME;
  const cacheRoot = mkdtempSync(join(tmpdir(), "moe-flight-profile-rotation-"));

  beforeAll(() => {
    process.env.XDG_CACHE_HOME = cacheRoot;
  });

  afterAll(() => {
    if (originalXdg === undefined) delete process.env.XDG_CACHE_HOME;
    else process.env.XDG_CACHE_HOME = originalXdg;
    try {
      rmSync(cacheRoot, { recursive: true, force: true });
    } catch {
      // best-effort
    }
  });

  test("two startChrome calls with different profile names use different user-data-dirs", async () => {
    // PRI-1436: chrome-ws-lib's only top-level export is now createSession().
    // The rotation invariant — successive startChrome calls with different
    // profile names use different --user-data-dirs — must hold within a
    // single session (same WebAdapter, multiple runs).
    let chrome: any;
    try {
      const { createSession } = require("../../../src/qa/adapters/web/lib/chrome-ws-lib.js");
      chrome = createSession();
    } catch {
      console.log("Skipping: chrome-ws-lib not available");
      return;
    }

    const profileA = "moe-flight-run-rotation-a";
    const profileB = "moe-flight-run-rotation-b";
    const dirA = chrome.getChromeProfileDir(profileA);
    const dirB = chrome.getChromeProfileDir(profileB);
    expect(dirA).not.toBe(dirB);

    try {
      await chrome.startChrome(true, profileA);
      const statusA = await chrome.getBrowserMode();
      expect(statusA.profileDir).toBe(dirA);
      // Chrome populates the profile dir on first launch (Preferences,
      // First Run, etc.). Non-empty => Chrome actually used this dir.
      expect(existsSync(dirA)).toBe(true);
      expect(readdirSync(dirA).length).toBeGreaterThan(0);

      await chrome.killChrome();

      await chrome.startChrome(true, profileB);
      const statusB = await chrome.getBrowserMode();
      // The regression would leave profileDir pointing at dirA here.
      expect(statusB.profileDir).toBe(dirB);
      expect(existsSync(dirB)).toBe(true);
      expect(readdirSync(dirB).length).toBeGreaterThan(0);
    } finally {
      try {
        await chrome.killChrome();
      } catch {
        // best-effort
      }
      // Reset module-level profile name so subsequent tests in the
      // same process don't inherit our rotation-b profile in their logs.
      try {
        chrome.setProfileName("moe-flight");
      } catch {
        // best-effort
      }
    }
  }, 60_000);
});
