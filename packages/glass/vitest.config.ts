import { defineConfig } from "vitest/config";

// Two projects, because three suites drive a real Chrome. Upstream ran everything
// in one `node --test` pass and shipped no CI; that does not survive contact with a
// container. `pnpm test` is the CI-safe set; `pnpm test:chrome` is opt-in and needs
// a local Chrome install.
const CHROME_SUITES = [
  "test/smoke.test.mjs",
  "test/dialogs.smoke.test.mjs",
  "test/popup-dialog-integration.test.mjs",
];

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: ["test/**/*.test.mjs"],
          exclude: [...CHROME_SUITES, "test/manual/**", "**/node_modules/**"],
        },
      },
      {
        test: {
          name: "chrome",
          include: CHROME_SUITES,
          testTimeout: 60_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
