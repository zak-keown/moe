import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const CORE = fileURLToPath(new URL("..", import.meta.url));
const SCRIPT = join(CORE, "skills/docs-update/scripts/docs-verify-report.mjs");

describe("docs-verify-report", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "dv-"));
    execFileSync("git", ["init", "--quiet"], { cwd: tmp });
    execFileSync("git", ["config", "user.name", "Moe Test"], { cwd: tmp });
    execFileSync("git", ["config", "user.email", "moe-test@example.invalid"], { cwd: tmp });
    execFileSync("git", ["commit", "--allow-empty", "--quiet", "-m", "init"], { cwd: tmp });
  });

  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it("merges two doc-type findings into one report with DV-### IDs", () => {
    const staging = join(tmp, ".moe", "docs-verify");
    mkdirSync(staging, { recursive: true });
    writeFileSync(
      join(staging, "readme.json"),
      JSON.stringify([
        {
          type: "stale_reference",
          file: "README.md",
          anchor: "Run `npm start`",
          actual: "package.json has pnpm dev",
          severity: "high",
        },
      ]),
    );
    writeFileSync(
      join(staging, "contributing.json"),
      JSON.stringify([
        {
          type: "factual_error",
          file: "CONTRIBUTING.md",
          anchor: "Node 18+",
          actual: "engines requires >=20",
          severity: "high",
        },
        {
          type: "missing_coverage",
          file: "CONTRIBUTING.md",
          anchor: "(absent)",
          actual: "No lint section",
          severity: "medium",
        },
      ]),
    );

    execFileSync(
      process.execPath,
      [SCRIPT, "--staging", staging, "--out", "DOCS-VERIFY-REPORT.md"],
      { cwd: tmp },
    );
    const report = readFileSync(join(tmp, "DOCS-VERIFY-REPORT.md"), "utf8");
    expect(report).toContain("report: docs-verify");
    expect(report).toContain("### DV-001:");
    expect(report).toContain("### DV-002:");
    expect(report).toContain("### DV-003:");
    expect(report).toContain("**Severity:** high");
    expect(report).toContain("**Severity:** medium");
    expect(report).toMatch(/findings:.*high: 2/);
    expect(report).toMatch(/findings:.*medium: 1/);
    expect(report).toMatch(/status: issues_found/);
  });

  it("produces a clean report when no findings exist", () => {
    const staging = join(tmp, ".moe", "docs-verify");
    mkdirSync(staging, { recursive: true });
    writeFileSync(join(staging, "readme.json"), JSON.stringify([]));
    execFileSync(
      process.execPath,
      [SCRIPT, "--staging", staging, "--out", "DOCS-VERIFY-REPORT.md"],
      { cwd: tmp },
    );
    const report = readFileSync(join(tmp, "DOCS-VERIFY-REPORT.md"), "utf8");
    expect(report).toContain("status: clean");
    expect(report).toMatch(/findings:.*total: 0/);
  });

  it("assigns IDs in severity order: high before medium before low", () => {
    const staging = join(tmp, ".moe", "docs-verify");
    mkdirSync(staging, { recursive: true });
    writeFileSync(
      join(staging, "readme.json"),
      JSON.stringify([
        {
          type: "missing_coverage",
          file: "README.md",
          anchor: "(absent)",
          actual: "missing",
          severity: "low",
        },
        {
          type: "stale_reference",
          file: "README.md",
          anchor: "old path",
          actual: "moved",
          severity: "high",
        },
        {
          type: "factual_error",
          file: "README.md",
          anchor: "wrong ver",
          actual: "v2",
          severity: "medium",
        },
      ]),
    );
    execFileSync(
      process.execPath,
      [SCRIPT, "--staging", staging, "--out", "DOCS-VERIFY-REPORT.md"],
      { cwd: tmp },
    );
    const report = readFileSync(join(tmp, "DOCS-VERIFY-REPORT.md"), "utf8");
    const ids = [...report.matchAll(/### (DV-\d+):.*\n[\s\S]*?\*\*Severity:\*\*\s*(\w+)/g)];
    expect(ids.map((match) => [match[1], match[2]])).toEqual([
      ["DV-001", "high"],
      ["DV-002", "medium"],
      ["DV-003", "low"],
    ]);
  });
});
