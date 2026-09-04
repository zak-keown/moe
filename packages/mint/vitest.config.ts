import { defineConfig } from "vitest/config";

// One project, not two. Every suite here is CI-safe and offline: the container
// command is exercised through a `docker` shim on PATH rather than a real
// daemon, and the dogfood suite skips itself when no content checkout is
// present. Compare packages/glass, which had to split out three suites that
// drive a real Chrome.
//
// test/global-setup.ts builds dist/ once before any test file runs, so the
// four CLI-spawning suites don't each build it themselves (they raced when
// vitest ran them in parallel workers). Redundant under `turbo run test`,
// which already has `dependsOn: ["build"]`, but it keeps a bare
// `pnpm --filter @bubstack/moe-mint test` working.
export default defineConfig({
  test: {
    globalSetup: ["./test/global-setup.ts"],
    include: ["test/**/*.test.ts"],
    exclude: ["test/manual/**", "**/node_modules/**", "**/dist/**"],
    testTimeout: 45_000,
    hookTimeout: 45_000,
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
});
