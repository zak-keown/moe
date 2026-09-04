import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { runHelper } from "./cli-harness.js";

const HELPER = "skills/extracting-requirements/scripts/chunk_spec.mjs";
const PROGRAM = "chunk_spec.mjs";
const CORE = resolve(import.meta.dirname, "..", "..");
const HELPER_PATH = join(CORE, HELPER);
const temporaryRoots: string[] = [];

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temporaryRoots.push(dir);
  return dir;
}

function run(path: string, args: readonly string[] = [], cwd?: string) {
  return runHelper(HELPER, [path, ...args], cwd);
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("chunk_spec", () => {
  it("returns one chunk for a file under the token threshold", () => {
    const root = tempDir("chunk-spec-small-");
    const spec = join(root, "small.md");
    writeFileSync(spec, "# Small Spec\n\nJust a few words here.\n");

    const result = run(spec);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    const chunks = JSON.parse(result.stdout) as Array<Record<string, unknown>>;
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.content).toContain("Small Spec");
    expect(chunks[0]?.source_file).toBe(spec);
  });

  it("splits an oversized file at H2 headings", () => {
    const root = tempDir("chunk-spec-h2-");
    const spec = join(root, "big.md");
    writeFileSync(
      spec,
      "# Big Spec\n\nPreamble text.\n\n" +
        "## Section A\n\n" +
        "word ".repeat(2_000) +
        "\n\n## Section B\n\n" +
        "word ".repeat(2_000) +
        "\n",
    );

    const result = run(spec, ["--max-tokens=3000"]);

    expect(result.status).toBe(0);
    const chunks = JSON.parse(result.stdout) as Array<{ heading: string | null }>;
    expect(chunks.map((chunk) => chunk.heading)).toEqual(["(preamble)", "Section A", "Section B"]);
  });

  it("recursively discovers Markdown files in sorted path order", () => {
    const root = tempDir("chunk-spec-directory-");
    const nested = join(root, "nested");
    mkdirSync(nested);
    writeFileSync(join(root, "z.md"), "# Z\n\nContent Z.\n");
    writeFileSync(join(root, "a.md"), "# A\n\nContent A.\n");
    writeFileSync(join(root, "ignored.txt"), "Not markdown.\n");
    writeFileSync(join(nested, "b.md"), "# B\n\nContent B.\n", { flag: "w" });

    const result = run(root);

    expect(result.status).toBe(0);
    const chunks = JSON.parse(result.stdout) as Array<{ source_file: string; content: string }>;
    expect(chunks.map((chunk) => chunk.source_file)).toEqual([
      join(root, "a.md"),
      join(root, "nested", "b.md"),
      join(root, "z.md"),
    ]);
    expect(chunks.every((chunk) => chunk.content.includes("Content"))).toBe(true);
  });

  it("recursively discovers Markdown files in depth-first path-component order", () => {
    const root = tempDir("chunk-spec-component-order-");
    const directory = join(root, "a");
    mkdirSync(directory);
    writeFileSync(join(root, "a-.md"), "# Dash\n\nContent dash.\n");
    writeFileSync(join(directory, "inner.md"), "# Inner\n\nContent inner.\n");

    const result = run(root);

    expect(result.status).toBe(0);
    const chunks = JSON.parse(result.stdout) as Array<{ source_file: string }>;
    expect(chunks.map((chunk) => chunk.source_file)).toEqual([
      join(root, "a", "inner.md"),
      join(root, "a-.md"),
    ]);
  });

  it("prints argparse-compatible help and exits successfully", () => {
    const result = runHelper(HELPER, ["--help"]);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toBe(
      [
        `usage: ${PROGRAM} [-h] [--max-tokens MAX_TOKENS] path`,
        "",
        "Chunk spec files for extraction",
        "",
        "positional arguments:",
        "  path                  File or directory to chunk",
        "",
        "options:",
        "  -h, --help            show this help message and exit",
        "  --max-tokens MAX_TOKENS",
        "                        Max tokens per chunk (default 4000)",
        "",
      ].join("\n"),
    );
  });

  it("prints argparse-compatible missing-path errors", () => {
    const result = runHelper(HELPER, []);

    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(
      [
        `usage: ${PROGRAM} [-h] [--max-tokens MAX_TOKENS] path`,
        `${PROGRAM}: error: the following arguments are required: path`,
        "",
      ].join("\n"),
    );
  });

  it("prints argparse-compatible malformed-option errors", () => {
    const result = runHelper(HELPER, ["/tmp/example.md", "--max-tokens", "not-an-int"]);

    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(
      [
        `usage: ${PROGRAM} [-h] [--max-tokens MAX_TOKENS] path`,
        `${PROGRAM}: error: argument --max-tokens: invalid int value: 'not-an-int'`,
        "",
      ].join("\n"),
    );
  });

  it.each(["--help", "--other"])(
    "treats %s after --max-tokens as a missing token argument",
    (followingOption) => {
      const result = runHelper(HELPER, ["/tmp/example.md", "--max-tokens", followingOption]);

      expect(result.status).toBe(2);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe(
        [
          `usage: ${PROGRAM} [-h] [--max-tokens MAX_TOKENS] path`,
          `${PROGRAM}: error: argument --max-tokens: expected one argument`,
          "",
        ].join("\n"),
      );
    },
  );

  it("normalizes CLI-relative paths before reporting the source file", () => {
    const root = tempDir("chunk-spec-relative-");
    writeFileSync(join(root, "spec.md"), "# Relative\n\nContent.\n");

    const result = run("./spec.md", [], root);

    expect(result.status).toBe(0);
    const chunks = JSON.parse(result.stdout) as Array<{ source_file: string }>;
    expect(chunks[0]?.source_file).toBe("spec.md");
  });

  it("preserves parent segments in CLI source-file spelling", () => {
    const root = tempDir("chunk-spec-parent-segment-");
    mkdirSync(join(root, "a"));
    writeFileSync(join(root, "b.md"), "# Parent segment\n\nContent.\n");
    const spec = ["a", "..", "b.md"].join(sep);

    const result = run(spec, [], root);

    expect(result.status).toBe(0);
    const chunks = JSON.parse(result.stdout) as Array<{ source_file: string }>;
    expect(chunks[0]?.source_file).toBe(spec);
  });

  it("returns exit 2 and an error for a missing path", () => {
    const missing = join(tempDir("chunk-spec-missing-"), "does-not-exist.md");

    const result = run(missing);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("not found");
  });

  it("returns every required field in each chunk", () => {
    const root = tempDir("chunk-spec-fields-");
    const spec = join(root, "test.md");
    writeFileSync(spec, "# Test\n\nHello world.\n");

    const result = run(spec);

    expect(result.status).toBe(0);
    const chunks = JSON.parse(result.stdout) as Array<Record<string, unknown>>;
    for (const chunk of chunks) {
      for (const field of [
        "source_file",
        "heading",
        "start_line",
        "end_line",
        "content",
        "estimated_tokens",
      ]) {
        expect(chunk).toHaveProperty(field);
      }
    }
  });

  it("sub-splits an oversized H2 section at H3 headings", () => {
    const root = tempDir("chunk-spec-h3-");
    const spec = join(root, "big.md");
    writeFileSync(
      spec,
      "# Big Doc\n\n## Large Section\n\n" +
        "### Sub A\n\n" +
        "word ".repeat(1_500) +
        "\n\n### Sub B\n\n" +
        "word ".repeat(1_500) +
        "\n",
    );

    const result = run(spec, ["--max-tokens", "2000"]);

    expect(result.status).toBe(0);
    const chunks = JSON.parse(result.stdout) as Array<{ heading: string | null }>;
    expect(chunks.map((chunk) => chunk.heading)).toEqual([
      "(preamble)",
      "Large Section",
      "Large Section > Sub A",
      "Large Section > Sub B",
    ]);
  });

  it("uses a 4000-token threshold when --max-tokens is omitted", () => {
    const root = tempDir("chunk-spec-default-");
    const spec = join(root, "default.md");
    writeFileSync(
      spec,
      "# Default Threshold\n\n" +
        "## First\n\n" +
        "word ".repeat(1_540) +
        "\n\n## Second\n\n" +
        "word ".repeat(1_540) +
        "\n",
    );

    const result = run(spec);

    expect(result.status).toBe(0);
    const chunks = JSON.parse(result.stdout) as Array<{ heading: string | null }>;
    expect(chunks.map((chunk) => chunk.heading)).toEqual(["(preamble)", "First", "Second"]);
  });

  it("sorts recursive Markdown paths by Python code points", () => {
    const root = tempDir("chunk-spec-code-point-order-");
    writeFileSync(join(root, "\uE000.md"), "# BMP private use\n");
    writeFileSync(join(root, "\u{10000}.md"), "# Astral\n");

    const result = run(root);

    expect(result.status).toBe(0);
    const chunks = JSON.parse(result.stdout) as Array<{ source_file: string }>;
    expect(chunks.map((chunk) => chunk.source_file)).toEqual([
      join(root, "\uE000.md"),
      join(root, "\u{10000}.md"),
    ]);
  });

  it.each(["\r", "\r\n"])(
    "translates %j newlines at the file boundary before chunking and line counting",
    (newline) => {
      const root = tempDir("chunk-spec-universal-newlines-");
      const spec = join(root, "spec.md");
      writeFileSync(
        spec,
        ["# Preamble", "", "## Alpha", "one two", "## Beta", "three"].join(newline),
      );

      const result = run(spec, ["--max", "3"]);

      expect(result.status).toBe(0);
      const chunks = JSON.parse(result.stdout) as Array<{
        heading: string | null;
        content: string;
        start_line: number;
        end_line: number;
      }>;
      expect(
        chunks.map(({ heading, content, start_line, end_line }) => ({
          heading,
          content,
          start_line,
          end_line,
        })),
      ).toEqual([
        { heading: "(preamble)", content: "# Preamble", start_line: 1, end_line: 1 },
        { heading: "Alpha", content: "## Alpha\none two", start_line: 3, end_line: 4 },
        { heading: "Beta", content: "## Beta\nthree", start_line: 5, end_line: 6 },
      ]);
    },
  );

  it.each(["\u2028", "\u2029"])("does not treat %j as a Python regex line anchor", (separator) => {
    const root = tempDir("chunk-spec-unicode-separator-");
    const spec = join(root, "spec.md");
    writeFileSync(spec, `## Alpha${separator}## Not a heading\nbody words`);

    const result = run(spec, ["--max", "1"]);

    expect(result.status).toBe(0);
    const chunks = JSON.parse(result.stdout) as Array<Record<string, unknown>>;
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({
      heading: `Alpha${separator}## Not a heading`,
      content: `## Alpha${separator}## Not a heading\nbody words`,
      start_line: 1,
      end_line: 2,
    });
  });

  it("accepts argparse abbreviations, negative values and paths, option ordering, and --", () => {
    const root = tempDir("chunk-spec-argparse-complete-");
    writeFileSync(join(root, "-1"), "# Negative path\n");
    writeFileSync(join(root, "--spec"), "# Option-looking path\n");
    writeFileSync(join(root, "ordered.md"), "# Ordered\n");

    for (const args of [
      ["--max", "-1", "ordered.md"],
      ["ordered.md", "--max", "-1"],
      ["-1"],
      ["--", "--spec"],
    ]) {
      const result = runHelper(HELPER, args, root);
      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
    }
  });

  it("accepts an empty positional path as pathlib's current directory", () => {
    const root = tempDir("chunk-spec-empty-path-");
    writeFileSync(join(root, "only.md"), "# Current directory\n");

    const result = runHelper(HELPER, [""], root);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    const chunks = JSON.parse(result.stdout) as Array<{ source_file: string }>;
    expect(chunks.map((chunk) => chunk.source_file)).toEqual([join(".", "only.md")]);
  });

  it("accepts Unicode decimal digits in --max-tokens like Python argparse(type=int)", () => {
    const root = tempDir("chunk-spec-unicode-decimal-");
    writeFileSync(join(root, "spec.md"), "# Unicode\n\nContent.\n");

    const result = run(join(root, "spec.md"), ["--max-tokens", "١٠٠٠"]);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    const chunks = JSON.parse(result.stdout) as Array<{ estimated_tokens: number }>;
    expect(chunks).toHaveLength(1);
  });

  it("preserves argparse empty, missing, and ambiguous option errors", () => {
    for (const [args, message] of [
      [["--max-tokens=", "missing.md"], "argument --max-tokens: invalid int value: ''"],
      [["--max"], "argument --max-tokens: expected one argument"],
      [["--=x"], "ambiguous option: --=x could match --help, --max-tokens"],
    ] as const) {
      const result = runHelper(HELPER, args);
      expect(result.status).toBe(2);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe(
        `usage: ${PROGRAM} [-h] [--max-tokens MAX_TOKENS] path\n` +
          `${PROGRAM}: error: ${message}\n`,
      );
    }
  });

  it("executes through a symlink while remaining silent when imported", () => {
    const root = tempDir("chunk-spec-direct-entry-");
    const link = join(root, "chunk-link.mjs");
    const spec = join(root, "spec.md");
    symlinkSync(HELPER_PATH, link);
    writeFileSync(spec, "# Linked\n");

    const linked = spawnSync(process.execPath, [link, spec], { encoding: "utf8" });
    expect(linked.status).toBe(0);
    expect(linked.stderr).toBe("");
    expect(JSON.parse(linked.stdout)).toHaveLength(1);

    const imported = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "--eval",
        `import ${JSON.stringify(pathToFileURL(HELPER_PATH).href)}`,
      ],
      { encoding: "utf8" },
    );
    expect(imported.status).toBe(0);
    expect(imported.stdout).toBe("");
    expect(imported.stderr).toBe("");
  });
});
