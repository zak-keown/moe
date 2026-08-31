import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // `inlineAllAssets: true` was also passed upstream. It is not an option
    // vite-plugin-singlefile has ever had — not in 2.3.3, the version upstream
    // itself pinned — so it was silently ignored, and nothing about the output
    // changes by dropping it. It only surfaced here because this config file is
    // now typechecked; upstream's tsconfig `include` was `src/**/*` only.
    // What actually makes the report self-contained is the plugin's default
    // inlinePattern plus the fact that the SPA ships no non-JS/CSS assets.
    viteSingleFile({ removeViteModuleLoader: true }),
  ],
  build: {
    outDir: "dist-static",
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(here, "static.html"),
    },
  },
});
