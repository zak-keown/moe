import { existsSync, mkdtempSync, rmSync, unlinkSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

// The CDP library under src/qa/adapters/web/lib/ is vendored CommonJS.
// Bun tolerated a bare `require()` in an ESM file; Node and vitest do not.
// Same fix as src/qa/adapters/web/adapter.ts.
const require = createRequire(import.meta.url);

const { attachScreenshot } = require("../../../../../src/qa/adapters/web/lib/screenshot.js");

// A minimal fake page session satisfying screenshot()'s CDP calls: the
// default (no selector, no fullPage) clip mode reads window.innerWidth/
// innerHeight via Runtime.evaluate, then captures via
// Page.captureScreenshot.
function makeFakePs() {
  return {
    async send(method: string, _params?: Record<string, unknown>) {
      if (method === "Runtime.evaluate") {
        return { result: { value: { width: 800, height: 600 } } };
      }
      if (method === "Page.captureScreenshot") {
        // A tiny (invalid, but that's fine — nothing here decodes it as a
        // real PNG) base64 payload is enough for fs.writeFileSync.
        return { data: Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64") };
      }
      throw new Error(`unexpected CDP method in test fake: ${method}`);
    },
  };
}

// CR-077: downscaleImageIfNeeded() (reached only through screenshot(), which
// isn't itself exported — every call goes through the top-level
// `screenshot()` this test drives) builds `sips`/`identify`/`convert` shell
// command strings by interpolating `filepath` directly into a template
// passed to execSync, wrapped only in double quotes. A filepath containing a
// double quote lets a caller break out of the intended argument and run
// arbitrary shell syntax.
//
// darwin-only: this reproduces the injection through the `sips` branch,
// which only exists on macOS (this repo's dev/CI environment per
// AGENTS.md's darwin-specific PATH notes). The Linux (`identify`/`convert`)
// branch shares the exact same interpolation pattern.
describe.runIf(process.platform === "darwin")(
  "CR-077: downscaleImageIfNeeded does not let filepath break out of the shell command",
  () => {
    let dir: string;
    let markerName: string;
    let markerPath: string;

    afterEach(() => {
      try {
        if (markerPath && existsSync(markerPath)) unlinkSync(markerPath);
      } catch {
        // best-effort
      }
      if (dir) rmSync(dir, { recursive: true, force: true });
    });

    test("a filepath containing shell metacharacters cannot execute an injected command", async () => {
      dir = mkdtempSync(join(tmpdir(), "moe-flight-cr077-"));
      markerName = `moe-flight-cr077-pwned-${process.pid}`;
      // execSync (production code) never sets a `cwd` option, so an
      // injected relative-path command lands in this test process's own
      // cwd — readable here for the assertion below.
      markerPath = join(process.cwd(), markerName);

      // Breaks out of the `"${filepath}"` double-quoted template and
      // sequences an extra shell command, if (and only if) filepath is
      // interpolated into a shell string rather than passed as an argv
      // entry. Deliberately has no "/" of its own beyond the real `dir`
      // prefix `join()` adds, so fs.writeFileSync(filename, ...) — which
      // screenshot() calls before downscaleImageIfNeeded() — still writes
      // to a real, single-level path instead of failing on an unrelated
      // ENOENT from a bogus nested "directory".
      const maliciousSegment = `x"; touch ${markerName}; echo "` + ".png";
      const maliciousPath = join(dir, maliciousSegment);

      const { screenshot } = attachScreenshot({ getPageSession: async () => makeFakePs() });

      // screenshot() itself is expected to succeed (or at least not throw
      // because of the downscale step, which is documented as
      // best-effort/silent-on-failure) regardless of the injection outcome
      // — the assertion that matters is whether the injected command ran.
      await screenshot(0, maliciousPath, null, false, {});

      expect(existsSync(markerPath)).toBe(false);
    });
  },
);
