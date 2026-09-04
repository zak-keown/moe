import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const CORE = fileURLToPath(new URL("..", import.meta.url));
const SCRIPTS = join(CORE, "skills/finding-duplicate-functions/scripts");
const EXTRACT = join(SCRIPTS, "extract-functions.mjs");
const PREPARE = join(SCRIPTS, "prepare-category-analysis.mjs");
const REPORT = join(SCRIPTS, "generate-report.mjs");

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function tmp(prefix = "dup-test-") {
  const d = mkdtempSync(join(tmpdir(), prefix));
  roots.push(d);
  return d;
}

describe("extract-functions", () => {
  it("prints help and exits 0 on --help", () => {
    const r = spawnSync(process.execPath, [EXTRACT, "--help"], { encoding: "utf8" });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("Usage:");
  });

  it("exits nonzero when source directory is missing", () => {
    const r = spawnSync(process.execPath, [EXTRACT], { encoding: "utf8" });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("source directory required");
  });

  it("exits nonzero when directory does not exist", () => {
    const r = spawnSync(process.execPath, [EXTRACT, "/nonexistent-dup-path"], {
      encoding: "utf8",
    });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("directory not found");
  });

  it("extracts name, file, line, and exportType from source files", () => {
    const dir = tmp();
    const src = join(dir, "src");
    mkdirSync(src);
    writeFileSync(
      join(src, "utils.ts"),
      [
        "export function greet(name: string): string {",
        // biome-ignore lint/suspicious/noTemplateCurlyInString: fixture content
        "  return `Hello, ${name}!`;",
        "}",
        "",
        "export const add = (a: number, b: number) => a + b;",
        "",
        "function internal() {",
        "  return 42;",
        "}",
      ].join("\n"),
    );

    const outFile = join(dir, "catalog.json");
    const r = spawnSync(process.execPath, [EXTRACT, "-o", outFile, "-c", "2", src], {
      encoding: "utf8",
    });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stderr).toContain("Extracted");

    const catalog = JSON.parse(readFileSync(outFile, "utf8"));
    expect(catalog.length).toBe(3);

    const names = catalog.map((e: { name: string }) => e.name);
    expect(names).toContain("greet");
    expect(names).toContain("add");
    expect(names).toContain("internal");

    const greet = catalog.find((e: { name: string }) => e.name === "greet");
    expect(greet.file).toBe("utils.ts");
    expect(greet.line).toBe(1);
    expect(greet.exportType).toBe("named");

    const internal = catalog.find((e: { name: string }) => e.name === "internal");
    expect(internal.exportType).toBe("internal");
  });

  it("excludes test files by default and includes them with --include-tests", () => {
    const dir = tmp();
    const src = join(dir, "src");
    mkdirSync(src);
    writeFileSync(join(src, "lib.ts"), "export function realFunc() {}\n");
    writeFileSync(join(src, "lib.test.ts"), "export function testHelper() {}\n");
    const testDir = join(src, "test");
    mkdirSync(testDir);
    writeFileSync(join(testDir, "setup.ts"), "export function setupTest() {}\n");

    const r1 = spawnSync(process.execPath, [EXTRACT, src], { encoding: "utf8" });
    expect(r1.status, r1.stderr).toBe(0);
    const cat1 = JSON.parse(r1.stdout);
    expect(cat1.map((e: { name: string }) => e.name)).toEqual(["realFunc"]);

    const r2 = spawnSync(process.execPath, [EXTRACT, "--include-tests", src], {
      encoding: "utf8",
    });
    expect(r2.status, r2.stderr).toBe(0);
    const cat2 = JSON.parse(r2.stdout);
    expect(cat2.length).toBe(3);
  });

  it("handles paths with spaces and shell metacharacters", () => {
    const dir = tmp();
    const src = join(dir, "src code; $(echo hi)");
    mkdirSync(src);
    writeFileSync(join(src, "mod.ts"), "export function hello() {}\n");

    const r = spawnSync(process.execPath, [EXTRACT, src], { encoding: "utf8" });
    expect(r.status, r.stderr).toBe(0);
    const cat = JSON.parse(r.stdout);
    expect(cat.length).toBe(1);
    expect(cat[0].name).toBe("hello");
  });
});

describe("prepare-category-analysis", () => {
  it("prints help and exits 0 on --help", () => {
    const r = spawnSync(process.execPath, [PREPARE, "--help"], { encoding: "utf8" });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("Usage:");
  });

  it("exits nonzero when arguments are missing", () => {
    const r = spawnSync(process.execPath, [PREPARE], { encoding: "utf8" });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("categorized.json required");
  });

  it("exits nonzero when input file does not exist", () => {
    const r = spawnSync(process.execPath, [PREPARE, "/nonexistent-cat.json"], {
      encoding: "utf8",
    });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("file not found");
  });

  it("creates files only for categories with 3+ functions", () => {
    const dir = tmp();
    const input = join(dir, "categorized.json");
    const outDir = join(dir, "cats");

    writeFileSync(
      input,
      JSON.stringify([
        { name: "a", category: "big" },
        { name: "b", category: "big" },
        { name: "c", category: "big" },
        { name: "d", category: "big" },
        { name: "x", category: "small" },
        { name: "y", category: "small" },
      ]),
    );

    const r = spawnSync(process.execPath, [PREPARE, input, outDir], { encoding: "utf8" });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stderr).toContain("big: 4 functions");
    expect(r.stderr).toContain("small: 2 functions (skipped, < 3)");

    const bigFile = JSON.parse(readFileSync(join(outDir, "big.json"), "utf8"));
    expect(bigFile.length).toBe(4);
    expect(() => readFileSync(join(outDir, "small.json"))).toThrow();
  });

  it("sanitizes category names that would traverse outside output directory", () => {
    const dir = tmp();
    const input = join(dir, "categorized.json");
    const outDir = join(dir, "out");

    writeFileSync(
      input,
      JSON.stringify([
        { name: "a", category: "../../etc/passwd" },
        { name: "b", category: "../../etc/passwd" },
        { name: "c", category: "../../etc/passwd" },
      ]),
    );

    const r = spawnSync(process.execPath, [PREPARE, input, outDir], { encoding: "utf8" });
    expect(r.status, r.stderr).toBe(0);

    const sanitized = JSON.parse(readFileSync(join(outDir, "etc-passwd.json"), "utf8"));
    expect(sanitized.length).toBe(3);
    expect(() => readFileSync(join(dir, "passwd.json"))).toThrow();
  });

  it("exits nonzero on malformed JSON input", () => {
    const dir = tmp();
    const input = join(dir, "bad.json");
    writeFileSync(input, "not valid json {{{");

    const r = spawnSync(process.execPath, [PREPARE, input], { encoding: "utf8" });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("malformed JSON");
  });
});

describe("generate-report", () => {
  it("prints help and exits 0 on --help", () => {
    const r = spawnSync(process.execPath, [REPORT, "--help"], { encoding: "utf8" });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("Usage:");
  });

  it("exits nonzero when arguments are missing", () => {
    const r = spawnSync(process.execPath, [REPORT], { encoding: "utf8" });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("duplicates directory required");
  });

  it("exits nonzero when directory does not exist", () => {
    const r = spawnSync(process.execPath, [REPORT, "/nonexistent-dup-dir"], {
      encoding: "utf8",
    });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("directory not found");
  });

  it("includes confidence totals in sections", () => {
    const dir = tmp();
    const dupDir = join(dir, "dups");
    mkdirSync(dupDir);
    const outFile = join(dir, "report.md");

    writeFileSync(
      join(dupDir, "validation.json"),
      JSON.stringify([
        {
          intent: "check email",
          confidence: "HIGH",
          functions: [
            { name: "validateEmail", file: "a.ts", line: 1 },
            { name: "checkEmail", file: "b.ts", line: 5 },
          ],
          differences: "regex vs library",
          recommendation: {
            action: "CONSOLIDATE",
            survivor: "validateEmail",
            reason: "better tested",
          },
        },
        {
          intent: "format number",
          confidence: "MEDIUM",
          functions: [{ name: "formatNum", file: "c.ts", line: 10 }],
          differences: "locale handling",
          recommendation: { action: "INVESTIGATE", reason: "needs review" },
        },
      ]),
    );

    writeFileSync(
      join(dupDir, "string-utils.json"),
      JSON.stringify([
        {
          intent: "trim whitespace",
          confidence: "LOW",
          functions: [{ name: "trimStr", file: "d.ts", line: 1 }],
          differences: "unicode awareness",
        },
      ]),
    );

    const r = spawnSync(process.execPath, [REPORT, dupDir, outFile], { encoding: "utf8" });
    expect(r.status, r.stderr).toBe(0);

    const report = readFileSync(outFile, "utf8");
    expect(report).toContain("| HIGH | 1 |");
    expect(report).toContain("| MEDIUM | 1 |");
    expect(report).toContain("| LOW | 1 |");
    expect(report).toContain("## HIGH Confidence Duplicates");
    expect(report).toContain("## MEDIUM Confidence Duplicates");
    expect(report).toContain("## LOW Confidence (Possibly Related)");
    expect(report).toContain("check email");
    expect(report).toContain("`validateEmail`");
  });

  it("produces a timestamp matching YYYY-MM-DD HH:MM", () => {
    const dir = tmp();
    const dupDir = join(dir, "dups");
    mkdirSync(dupDir);
    writeFileSync(join(dupDir, "empty.json"), "[]");
    const outFile = join(dir, "report.md");

    const r = spawnSync(process.execPath, [REPORT, dupDir, outFile], { encoding: "utf8" });
    expect(r.status, r.stderr).toBe(0);

    const report = readFileSync(outFile, "utf8");
    expect(report).toMatch(/Generated: \d{4}-\d{2}-\d{2} \d{2}:\d{2}/);
  });

  it("exits nonzero on malformed JSON in duplicates directory", () => {
    const dir = tmp();
    const dupDir = join(dir, "dups");
    mkdirSync(dupDir);
    writeFileSync(join(dupDir, "broken.json"), "{{invalid}}");

    const r = spawnSync(process.execPath, [REPORT, dupDir], { encoding: "utf8", cwd: dir });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("malformed JSON");
  });
});
