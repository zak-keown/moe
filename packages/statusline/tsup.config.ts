import { defineConfig } from "tsup";

// CJS, matching packages/crew's hook bundle: the hook runs via
// `node dist/ensure-statusline.cjs`, invoked directly by Claude Code (never
// imported), so module format is not load-bearing here the way it is for
// crew's pi-extension — CJS is simplest and matches the sibling hook bundle
// this package is modeled on.
export default defineConfig({
  entry: {
    "ensure-statusline": "src/hooks/ensure-statusline.ts",
  },
  outDir: "dist",
  target: "node24",
  clean: false,
  splitting: false,
  format: ["cjs"],
  outExtension: () => ({ js: ".cjs" }),
  banner: { js: "#!/usr/bin/env node" },
});
