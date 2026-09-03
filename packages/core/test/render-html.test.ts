/**
 * Tests for the render-html.cjs template renderer.
 *
 * The renderer is a zero-dependency CJS script that fills slot markers in
 * report-base.html. Tests exercise both the library API (require()) and the
 * CLI (child_process.execFileSync).
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = resolve(HERE, "..");
const SCRIPT = join(PKG, "skills", "_shared", "render-html.cjs");
const DEFAULT_TEMPLATE = join(PKG, "skills", "_shared", "report-base.html");
const SKILL = join(PKG, "skills", "improve-codebase-architecture", "SKILL.md");

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { renderTemplate, parseArgs } = require(SCRIPT) as {
  renderTemplate: (template: string, data: Record<string, string | undefined>) => string;
  parseArgs: (argv: string[]) => { input: string; output: string; template: string };
};

const temporaryRoots: string[] = [];

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temporaryRoots.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of temporaryRoots) {
    rmSync(dir, { recursive: true, force: true });
  }
  temporaryRoots.length = 0;
});

// Minimal template with all four slots, used by library-level tests so they
// don't depend on the real report-base.html layout.
const MINI_TEMPLATE = [
  "<!doctype html>",
  "<html><head><title>{{TITLE}}</title></head>",
  "<body>",
  "<nav>{{NAV}}</nav>",
  "<main>{{CONTENT}}</main>",
  "{{SCRIPTS}}",
  "</body></html>",
].join("\n");

// ── Library API tests ─────────────────────────────────────────────

describe("renderTemplate", () => {
  it("replaces all four slot markers", () => {
    const result = renderTemplate(MINI_TEMPLATE, {
      title: "Test Report",
      nav: "<a href='#s1'>Section 1</a>",
      content: "<h1>Hello</h1>",
      scripts: "<script>console.log('ok')</script>",
    });
    expect(result).toContain("<title>Test Report</title>");
    expect(result).toContain("<a href='#s1'>Section 1</a>");
    expect(result).toContain("<h1>Hello</h1>");
    expect(result).toContain("console.log('ok')");
    // No leftover slot markers.
    expect(result).not.toContain("{{");
    expect(result).not.toContain("}}");
  });

  it("produces clean output when optional slots are missing", () => {
    const result = renderTemplate(MINI_TEMPLATE, {
      title: "Minimal",
      content: "<p>Body</p>",
    });
    expect(result).toContain("<title>Minimal</title>");
    expect(result).toContain("<p>Body</p>");
    // NAV and SCRIPTS markers are gone, replaced with empty strings.
    expect(result).not.toContain("{{NAV}}");
    expect(result).not.toContain("{{SCRIPTS}}");
    expect(result).toContain("<nav></nav>");
  });

  it("throws when required slot 'title' is missing", () => {
    expect(() => renderTemplate(MINI_TEMPLATE, { content: "<p>ok</p>" })).toThrow(
      /required slot "title"/,
    );
  });

  it("throws when required slot 'content' is missing", () => {
    expect(() => renderTemplate(MINI_TEMPLATE, { title: "T" })).toThrow(/required slot "content"/);
  });
});

// ── parseArgs tests ───────────────────────────────────────────────

describe("parseArgs", () => {
  it("parses --input and --output", () => {
    const result = parseArgs(["--input", "a.json", "--output", "b.html"]);
    expect(result.input).toBe("a.json");
    expect(result.output).toBe("b.html");
    // Default template path resolves to the shared template.
    expect(result.template).toBe(DEFAULT_TEMPLATE);
  });

  it("parses --template override", () => {
    const result = parseArgs([
      "--input",
      "a.json",
      "--output",
      "b.html",
      "--template",
      "/custom/t.html",
    ]);
    expect(result.template).toBe("/custom/t.html");
  });

  it("throws when --input is missing", () => {
    expect(() => parseArgs(["--output", "b.html"])).toThrow(/--input is required/);
  });

  it("throws when --output is missing", () => {
    expect(() => parseArgs(["--input", "a.json"])).toThrow(/--output is required/);
  });
});

// ── Real template validation ──────────────────────────────────────

describe("report-base.html template", () => {
  it("exists on disk", () => {
    expect(existsSync(DEFAULT_TEMPLATE)).toBe(true);
  });

  it("contains all four slot markers", () => {
    const html = readFileSync(DEFAULT_TEMPLATE, "utf-8");
    expect(html).toContain("{{TITLE}}");
    expect(html).toContain("{{NAV}}");
    expect(html).toContain("{{CONTENT}}");
    expect(html).toContain("{{SCRIPTS}}");
  });

  it("produces valid portable HTML with the documented Mermaid CDN when slots are filled", () => {
    const template = readFileSync(DEFAULT_TEMPLATE, "utf-8");
    const html = renderTemplate(template, {
      title: "Architecture Review",
      nav: "<a href='#overview'>Overview</a>",
      content: "<h1>Architecture Review</h1><p>Body text.</p>",
      scripts: "",
    });
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("<html");
    expect(html).toContain("<head>");
    expect(html).toContain("</head>");
    expect(html).toContain("<body>");
    expect(html).toContain("</body>");
    expect(html).toContain("</html>");
    expect(html).toContain("<title>Architecture Review</title>");
    // Mermaid CDN reference from cdnjs.
    expect(html).toContain("cdnjs.cloudflare.com");
    expect(html).toContain("mermaid");
    // Theme toggle and CSS custom properties.
    expect(html).toContain("data-theme");
    expect(html).toContain("prefers-color-scheme");
    expect(html).toContain("@media print");
    expect(html).toContain("viewport");
  });
});

// ── CLI integration ───────────────────────────────────────────────

describe("installed report instructions", () => {
  it("does not describe CDN-dependent output as self-contained", () => {
    const instructions = readFileSync(SKILL, "utf8");

    expect(instructions).not.toMatch(/self-contained HTML/i);
    expect(instructions).toMatch(/single local HTML file/i);
    expect(instructions).toMatch(/Tailwind via CDN/);
    expect(instructions).toMatch(/requires network access/i);
  });
});

describe("CLI (render-html.cjs)", () => {
  it("renders a report from JSON input and writes HTML output", () => {
    const dir = tempDir("moe-render-cli-");
    const inputPath = join(dir, "data.json");
    const outputPath = join(dir, "report.html");

    writeFileSync(
      inputPath,
      JSON.stringify({
        title: "CLI Test",
        content: "<section>CLI output</section>",
      }),
    );

    execFileSync("node", [SCRIPT, "--input", inputPath, "--output", outputPath]);

    expect(existsSync(outputPath)).toBe(true);
    const html = readFileSync(outputPath, "utf-8");
    expect(html).toContain("<title>CLI Test</title>");
    expect(html).toContain("<section>CLI output</section>");
    expect(html).toContain("<!doctype html>");
  });

  it("uses a custom --template", () => {
    const dir = tempDir("moe-render-tpl-");
    const customTemplate = join(dir, "custom.html");
    const inputPath = join(dir, "data.json");
    const outputPath = join(dir, "out.html");

    writeFileSync(
      customTemplate,
      "<!doctype html><html><head><title>{{TITLE}}</title></head><body>{{CONTENT}}</body></html>",
    );
    writeFileSync(inputPath, JSON.stringify({ title: "Custom", content: "<p>Custom body</p>" }));

    execFileSync("node", [
      SCRIPT,
      "--input",
      inputPath,
      "--output",
      outputPath,
      "--template",
      customTemplate,
    ]);

    const html = readFileSync(outputPath, "utf-8");
    expect(html).toContain("<title>Custom</title>");
    expect(html).toContain("<p>Custom body</p>");
    // Should NOT contain default template artifacts (mermaid, theme-toggle).
    expect(html).not.toContain("mermaid");
  });

  it("exits with non-zero status when --input is missing", () => {
    expect(() =>
      execFileSync("node", [SCRIPT, "--output", "/dev/null"], { stdio: "pipe" }),
    ).toThrow();
  });

  it("exits with non-zero status when input file does not exist", () => {
    expect(() =>
      execFileSync("node", [SCRIPT, "--input", "/nonexistent.json", "--output", "/dev/null"], {
        stdio: "pipe",
      }),
    ).toThrow();
  });

  it("creates output directory if it does not exist", () => {
    const dir = tempDir("moe-render-mkdir-");
    const nested = join(dir, "sub", "dir");
    const inputPath = join(dir, "data.json");
    const outputPath = join(nested, "report.html");

    writeFileSync(inputPath, JSON.stringify({ title: "Nested", content: "<p>Nested</p>" }));

    execFileSync("node", [SCRIPT, "--input", inputPath, "--output", outputPath]);
    expect(existsSync(outputPath)).toBe(true);
  });

  it("uses its adjacent installed template when invoked from an unrelated project cwd", () => {
    const dir = tempDir("moe-render-installed-");
    const project = join(dir, "project");
    mkdirSync(project);
    const inputPath = join(project, "data.json");
    const outputPath = join(project, "report.html");
    writeFileSync(inputPath, JSON.stringify({ title: "Installed", content: "<p>Portable</p>" }));

    execFileSync("node", [SCRIPT, "--input", inputPath, "--output", outputPath], { cwd: project });

    const html = readFileSync(outputPath, "utf-8");
    expect(html).toContain("<title>Installed</title>");
    expect(html).toContain("cdnjs.cloudflare.com");
  });
});
