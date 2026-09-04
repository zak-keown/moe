/**
 * Tests for the docs-verify-report.mjs report generator.
 *
 * A sibling `skills/docs-update/scripts/docs-verify-report.test.mjs` exists
 * but is not matched by this package's vitest `include` glob
 * (`test/*.test.ts`), so it never runs under `pnpm test`. These tests live
 * here instead so `pnpm --filter @bubstack/moe-core test` actually exercises
 * them.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const SCRIPT = new URL("../skills/docs-update/scripts/docs-verify-report.mjs", import.meta.url)
  .pathname;

describe("docs-verify-report", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "dv-"));
    execFileSync("git", ["init"], { cwd: tmp });
    execFileSync(
      "git",
      [
        "-c",
        "user.name=Test",
        "-c",
        "user.email=test@test",
        "commit",
        "--allow-empty",
        "-m",
        "init",
      ],
      { cwd: tmp },
    );
  });

  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  function runDocsVerify(findings: unknown[]): string {
    const staging = join(tmp, ".moe", "docs-verify");
    mkdirSync(staging, { recursive: true });
    writeFileSync(join(staging, "readme.json"), JSON.stringify(findings));
    execFileSync("node", [SCRIPT, "--staging", staging, "--out", "DOCS-VERIFY-REPORT.md"], {
      cwd: tmp,
    });
    return readFileSync(join(tmp, "DOCS-VERIFY-REPORT.md"), "utf8");
  }

  it("renders every finding it counts, even when severity casing differs from canonical lowercase", () => {
    const report = runDocsVerify([
      { type: "stale_reference", file: "README.md", anchor: "a", actual: "one", severity: "high" },
      {
        type: "factual_error",
        file: "README.md",
        anchor: "b",
        actual: "two",
        severity: "Critical",
      },
    ]);

    const totalMatch = report.match(/findings:.*total:\s*(\d+)/);
    expect(totalMatch).not.toBeNull();
    const total = Number(totalMatch![1]);

    const renderedIds = [...report.matchAll(/^### (DV-\d+):/gm)].map((m) => m[1]);

    // Every finding counted in the frontmatter total must actually appear
    // in the body under some severity heading — a finding assigned an id
    // and counted must not be silently invisible.
    expect(renderedIds.length).toBe(total);
    expect(report).toContain("## Critical");
  });

  it("prints an empty Critical heading with 'No findings.' just like High/Medium/Low", () => {
    const report = runDocsVerify([
      { type: "stale_reference", file: "README.md", anchor: "a", actual: "one", severity: "high" },
    ]);

    // High/Medium/Low all print their heading followed by "No findings."
    // when their group is empty. Critical must behave the same way — its
    // absence otherwise reads as "the report is truncated" rather than
    // "deliberately empty".
    for (const heading of ["Critical", "Medium", "Low"]) {
      const idx = report.indexOf(`## ${heading}`);
      expect(idx, `expected a "## ${heading}" heading in:\n${report}`).toBeGreaterThanOrEqual(0);
      const nextLines = report.slice(idx).split("\n").slice(1, 3).join("\n");
      expect(nextLines).toContain("No findings.");
    }
  });
});
