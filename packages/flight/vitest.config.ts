import { defineConfig } from "vitest/config";

/**
 * Four projects, because three groups of suites need something a container does
 * not have.
 *
 * Upstream ran all 145 suites in one `bun test` pass. The tmux suites probe for
 * the binary and skip themselves, so a machine without tmux reported a fully
 * green run with the entire TUI adapter unexercised. The Chrome suites do not
 * even do that — they call `session.startChrome(...)` in a `beforeAll` and fail
 * outright without a browser. Both were invisible in one flat pass.
 *
 * `unit` is the CI-safe set: no Chrome, no tmux, no network. `test:chrome` and
 * `test:tmux` are opt-in, which makes the gap countable — CI can assert the
 * gated projects actually ran, which a silent skip inside a green suite cannot.
 *
 * Two `unit` suites drive the built `dist/cli.js` (test/qa/cli/
 * show-prompt-and-exit and test/qa/e2e/built-cli-smoke). turbo's `test
 * dependsOn build` supplies it; they self-skip with a printed reason otherwise.
 *
 * `include` is deliberately narrow. A loose recursive test glob would collect
 * `dashboard/test/` and `ui/test/` — both their own workspace packages with
 * their own configs — and run them twice under the wrong resolution.
 */

/**
 * Every suite that launches a real Chrome. The eight under `adapters/web/`
 * were in upstream's default pass; they are here because each one calls
 * `startChrome()`, which needs a browser on the box.
 */
const CHROME_SUITES = [
  "test/qa/adapters/web/adapter.test.ts",
  "test/qa/adapters/web/chrome-ws-lib-context-isolation.test.ts",
  "test/qa/adapters/web/side-trip-popup.test.ts",
  "test/qa/adapters/web/lib/browser-bridge.test.ts",
  "test/qa/adapters/web/lib/browser-session.test.ts",
  "test/qa/adapters/web/lib/page-session.test.ts",
  "test/qa/adapters/web/lib/tabs.test.ts",
  "test/qa/adapters/web/lib/webauthn-context.test.ts",
  "test/qa/integration/chrome-profile-rotation.test.ts",
  "test/qa/integration/web-form-post-nav.test.ts",
  "test/qa/integration/web-smoke.test.ts",
  "test/qa/integration/web-todomvc.test.ts",
];

/**
 * Suites that dlopen `@tc/moe-tab`'s cdylib. Its own project for the same
 * reason packages/tab/bindings/typescript splits: the library only exists after
 * `pnpm tab:build`, and CI's node:24 image has no cargo.
 */
const FFI_SUITES = ["test/lab/tab-ffi.test.ts", "test/lab/usage-row-contract.test.ts"];

/** Suites that need a `tmux` binary. Each also probes and self-skips. */
const TMUX_SUITES = [
  "test/qa/adapters/tui/adapter.test.ts",
  "test/qa/integration/tui-colored-alphabet.test.ts",
  "test/qa/integration/tui-nano.test.ts",
];

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          root: import.meta.dirname,
          include: ["test/qa/**/*.test.ts", "test/lab/**/*.test.ts"],
          exclude: [...CHROME_SUITES, ...TMUX_SUITES, ...FFI_SUITES, "**/node_modules/**"],
          environment: "node",
        },
      },
      {
        test: {
          name: "chrome",
          root: import.meta.dirname,
          include: CHROME_SUITES,
          environment: "node",
          testTimeout: 60_000,
          hookTimeout: 60_000,
        },
      },
      {
        test: {
          name: "ffi",
          root: import.meta.dirname,
          include: FFI_SUITES,
          environment: "node",
          // One file, run alone under `--project ffi`, so there is no
          // cross-file race over the process-global MOE_TAB_PRICING_DIR the
          // dlopen'd core reads back through getenv. Add a second FFI suite and
          // this needs root-level `fileParallelism: false`, the way
          // packages/tab/bindings/typescript does it.
          testTimeout: 30_000,
        },
      },
      {
        test: {
          name: "tmux",
          root: import.meta.dirname,
          include: TMUX_SUITES,
          environment: "node",
          testTimeout: 60_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
