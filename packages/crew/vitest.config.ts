import { defineConfig } from "vitest/config";

// One project, deliberately. The three `test/integration/*-flow.test.ts` suites
// drive a live tmux server, but each probes for `tmux -V` and skips itself with a
// stderr reason when tmux is absent — so they are already CI-safe, and splitting
// them into an opt-in project (the shape `packages/glass` needed for Chrome)
// would only stop them running on a developer box that does have tmux.
//
// They do need `dist/`: they exercise the bundled `dist/moe-crew.cjs` and
// `dist/emit-event.cjs`. turbo's `test dependsOn build` guarantees it exists.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
});
