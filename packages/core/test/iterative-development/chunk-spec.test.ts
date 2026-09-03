import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runHelper } from "./cli-harness.js";

const HELPER = "skills/extracting-requirements/scripts/chunk_spec.mjs";
const temporaryRoots: string[] = [];

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temporaryRoots.push(dir);
  return dir;
}

function run(path: string, args: readonly string[] = []) {
  return runHelper(HELPER, [path, ...args]);
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

    const result = run(spec, ["--max-tokens", "3000"]);

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
