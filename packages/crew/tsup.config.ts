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
    metafile: true,
    outExtension: () => ({ js: ".cjs" }),
    // `moe-crew` is a declared bin (package.json `bin`), and src/cli.ts opens
    // with `import` rather than a shebang — so without this the bundle began
    // `"use strict";`. It was the only one of the five package bins with no
    // shebang: glass, mint, memory and flight all carry `#!/usr/bin/env node`
    // in their entry source, where tsup preserves it.
    //
    // On Unix that only costs a direct `./dist/moe-crew.cjs`. On Windows it
    // breaks the bin outright: there are no symlinks, so npm and pnpm generate
    // .cmd/.ps1 shims via cmd-shim and READ THE SHEBANG to pick an interpreter.
    // No shebang, no interpreter, dead shim.
    //
    // The banner applies to emit-event.cjs too. That is invoked as
    // `node dist/emit-event.cjs` (src/hooks/emit-event.ts:198), where a shebang
    // is an inert first-line comment Node strips — harmless there, and correct
    // if anything ever execs it directly.
    banner: { js: "#!/usr/bin/env node" },
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
    metafile: true,
    outExtension: () => ({ js: ".mjs" }),
    treeshake: true,
  },
]);
