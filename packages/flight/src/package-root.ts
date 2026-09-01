import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Absolute path to the `@tc/moe-flight` package root — the directory
 * holding `package.json`, `ui/`, `dashboard/`, `examples/` and `docker/`.
 *
 * Resolved by walking up from this module to the nearest `package.json`, not by
 * counting `..` segments. Upstream counted: `src/render/render-run.ts` did
 * `join(here, "..", "..", "ui", "dist-static")` and `src/index.ts` did
 * `join(here, "..", "ui", "dist")` — two different depths, both correct only
 * while the code ran straight from `src/`. Under `tsc -b` the same modules live
 * in `dist/qa/…`, and one of the two was silently wrong rather than loud:
 * `src/qa/api/server.ts` guards the UI dir with `existsSync`, so a bad path
 * just stops serving the SPA.
 *
 * This module sits at `src/package-root.ts`, i.e. `dist/package-root.js` once
 * built — one level below the package root either way, with no intervening
 * `package.json`. Every consumer therefore gets the same answer from source
 * (vitest) and from `dist/` (the shipped bin), which is the point of the
 * helper. Pinned by test/qa/package-root.test.ts.
 */
function findPackageRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 12; i++) {
    if (existsSync(join(dir, "package.json"))) return dir;
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  throw new Error(`packageRoot: no package.json found above ${import.meta.url}`);
}

let cached: string | undefined;

export function packageRoot(): string {
  if (cached === undefined) cached = findPackageRoot();
  return cached;
}

/** `<packageRoot>/ui/dist` — the built SPA the API server statically serves. */
export function uiDistDir(): string {
  return join(packageRoot(), "ui", "dist");
}

/** `<packageRoot>/ui/dist-static/static.html` — the single-file report template. */
export function staticReportTemplate(): string {
  return join(packageRoot(), "ui", "dist-static", "static.html");
}
