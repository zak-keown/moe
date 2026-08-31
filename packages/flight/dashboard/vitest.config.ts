import { defineConfig } from "vitest/config";

// One project. `dashboard-server.test.ts` boots a real in-process HTTP server
// on an ephemeral port and drives it with `fetch`; nothing here needs an
// external tool, so there is no CI-safe/opt-in split to make.
//
// Kept as its own vitest config rather than folded into packages/flight's: a
// loose `**/*.test.ts` there would collect these eight suites and run them
// twice, under two different resolutions. Upstream avoided the same collision
// with bunfig's `[test] root = "test"`, which is why `bun test test/` at the
// quorum root never picked them up.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
});
