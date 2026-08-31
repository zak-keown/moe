import { defineConfig } from "tsup";

// tsup applies `format` per-config, so we ship TWO configs. The CLI and the
// Claude/Codex hook run via `node dist/*.cjs` (CJS — `src/cli.ts` resolves its
// sibling bundle through `__dirname`, which only exists in CJS). The pi
// extension is loaded by pi's jiti/ESM loader (`pi -e dist/pi-extension.mjs`),
// so it must be ESM — tsup bundles it self-contained (events/event-log/paths/
// worker-store inlined), with NO runtime require of the other dist bundles.
//
// Upstream set `clean: true` on the CJS config because it committed `dist/` and
// gated pushes on `git diff --exit-code dist/`. Here `dist/` is gitignored and
// `tsc -b` emits declarations into the same directory, so a clean would race
// away the type build. Dropped on both configs; CI builds from empty.
export default defineConfig([
  {
    entry: {
      "moe-crew": "src/cli.ts",
      "emit-event": "src/hooks/emit-event.ts",
    },
    outDir: "dist",
    target: "node24",
    clean: false,
    splitting: false,
    format: ["cjs"],
    outExtension: () => ({ js: ".cjs" }),
  },
  {
    entry: {
      "pi-extension": "src/pi-extension/index.ts",
    },
    outDir: "dist",
    target: "node24",
    clean: false,
    splitting: false,
    format: ["esm"],
    outExtension: () => ({ js: ".mjs" }),
    treeshake: true,
  },
]);
