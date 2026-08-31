import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { staticReportTemplate } from "../../../src/package-root.js";
import { renderRun } from "../../../src/qa/render/render-run.js";

/**
 * The one test that exercises the REAL built template.
 *
 * `test/qa/render/render-run.test.ts` covers `renderRunFromTemplate` against a
 * synthetic template it writes itself, and `test/qa/api/static-serving.test.ts`
 * covers the SPA fallback against a synthetic `ui/dist` — so upstream shipped
 * both build outputs completely unasserted. Its only guard was that
 * `bun run build:ui` exited 0.
 *
 * This is the check an upstream plan specified as `grep -c '__GAUNTLET_RUN__'
 * ui/dist-static/static.html` and never turned into a test. It matters because
 * the placeholder id spans three packages — the element and its hydration
 * script in `ui/static.html`, the `window` global in `ui/src/`, and the finder
 * regex plus its error message in `src/qa/render/render-run.ts` — and a partial
 * rename fails at render time, not at build time.
 *
 * Needs `ui/dist-static/`. flight depends on `@bubstack/moe-flight-ui`, so
 * turbo builds it first; a bare `vitest run` may not, hence the guard.
 */
const TEMPLATE = staticReportTemplate();
const HAVE_TEMPLATE = existsSync(TEMPLATE);
if (!HAVE_TEMPLATE) {
  console.error(
    `[skip] ${TEMPLATE} is missing — build the SPA first ` +
      "(`pnpm --filter @bubstack/moe-flight-ui build`).",
  );
}

describe.skipIf(!HAVE_TEMPLATE)("renderRun against the built template", () => {
  test("the built template carries the placeholder script tag", () => {
    const html = readFileSync(TEMPLATE, "utf8");
    expect(html).toContain('id="__MOE_FLIGHT_RUN__"');
    // A stale build, or a half-finished rename, would leave the upstream id.
    expect(html).not.toContain("__GAUNTLET_RUN__");
  });

  test("splices a run payload into it and writes index.html", async () => {
    const runDir = mkdtempSync(join(tmpdir(), "moe-flight-render-"));
    writeFileSync(
      join(runDir, "result.json"),
      JSON.stringify({
        schemaVersion: 5,
        runId: "card-001_20260101T000000Z_abcd",
        scenario: "card-001",
        status: "pass",
        summary: "ok",
        reasoning: "because",
        observations: [],
        evidence: { screenshots: [], log: "" },
        duration_ms: 1,
      }),
      "utf-8",
    );
    writeFileSync(join(runDir, "run.jsonl"), "", "utf-8");

    const outPath = await renderRun(runDir);
    expect(outPath).toBe(join(runDir, "index.html"));

    const rendered = readFileSync(outPath, "utf8");
    expect(rendered).toContain('id="__MOE_FLIGHT_RUN__"');
    expect(rendered).toContain('"schemaVersion":5');
    expect(rendered).toContain("card-001_20260101T000000Z_abcd");
    // The template's empty placeholder must be gone, not merely appended to.
    expect(rendered).not.toContain('id="__MOE_FLIGHT_RUN__">{}</script>');
  });
});
