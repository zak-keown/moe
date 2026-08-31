import { defineConfig } from "vitest/config";

// Two projects, because the encoder is a live external resource on first run.
//
// Upstream ran everything in one pass with a 30 s timeout and no CI. It never
// set `env.cacheDir`, so the first `initEmbeddings()` fetched
// `Xenova/bge-small-en-v1.5` from huggingface.co into whatever transformers.js
// defaults to — which under pnpm is a path inside the content-addressed store,
// shared across the workspace and possibly read-only in a container. Ten suites
// reached it. That does not survive contact with CI.
//
// `pnpm test` is the CI-safe set: no network, no model, no Claude auth.
// `pnpm test:model` is opt-in and downloads ~35 MB once into
// `<MOE_MEMORY_CONFIG_DIR>/models` (see src/paths.ts getModelCacheDir).
//
// Files under test/model/ are there because they need the real encoder. Where a
// file was mostly offline with one encoder-dependent test — embedding-migration,
// verify's repair block, exclude-nested, sync's indexing test — the test was
// split out rather than exiling the whole suite, which is why those four have a
// sibling under test/model/.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          globals: true,
          environment: "node",
          include: ["test/**/*.test.ts"],
          exclude: ["test/model/**", "test/manual/**", "**/node_modules/**"],
          testTimeout: 30_000,
        },
      },
      {
        test: {
          name: "model",
          globals: true,
          environment: "node",
          include: ["test/model/**/*.test.ts"],
          // A cold model cache is a download, not a computation.
          testTimeout: 300_000,
          hookTimeout: 300_000,
        },
      },
    ],
  },
});
