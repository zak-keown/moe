import { defineConfig } from "vitest/config";

/**
 * The SPA had no test runner upstream: its four logic suites lived in
 * `gauntlet/test/ui/` and ran under the outer package's `bun test`, reaching
 * across what is now a package boundary.
 *
 * They moved to `ui/test/` on import. That removes a test-only edge pointing
 * sideways into a non-composite JSX package, and it closes a green-by-absence
 * hole: `packages/flight/ui` had only a `lint` script, and turbo silently skips
 * a package that declares no task — so the SPA could have been imported broken
 * and reported green forever.
 *
 * `environment: node`. The suites test pure reducers; `static-run-page.test.ts`
 * hand-fakes `globalThis.window` rather than pulling in jsdom, which is
 * upstream behaviour worth keeping — it is what makes the payload reader
 * testable without a DOM at all.
 */
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
});
