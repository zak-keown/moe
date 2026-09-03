import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, normalize } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runHelper } from "./cli-harness.js";

const HELPER = "skills/extracting-requirements/scripts/chunk_spec.mjs";
const PROGRAM = "chunk_spec.mjs";
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

  it("normalizes CLI-relative paths before reporting the source file", () => {
    const root = tempDir("chunk-spec-relative-");
    writeFileSync(join(root, "spec.md"), "# Relative\n\nContent.\n");

    const result = run("./spec.md", [], root);

    expect(result.status).toBe(0);
    const chunks = JSON.parse(result.stdout) as Array<{ source_file: string }>;
    expect(chunks[0]?.source_file).toBe(normalize("./spec.md"));
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
});
