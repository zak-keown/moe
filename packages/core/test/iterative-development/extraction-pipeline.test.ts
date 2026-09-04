import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runHelper } from "./cli-harness.js";

const CHUNKER = "skills/extracting-requirements/scripts/chunk_spec.mjs";
const AGGREGATOR = "skills/extracting-requirements/scripts/aggregate_stories.mjs";
const VALIDATOR = "skills/extracting-requirements/scripts/validate_requirements_index.mjs";
const FIXTURES = resolve(import.meta.dirname, "fixtures");
const temporaryRoots: string[] = [];

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temporaryRoots.push(dir);
  return dir;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("extraction pipeline", () => {
  it("chunks a multi-file spec and aggregates extraction output into the requirements contract", () => {
    const output = tempDir("extraction-pipeline-");

    const chunkResult = runHelper(CHUNKER, [join(FIXTURES, "multi-file-spec")]);
    expect(chunkResult.status).toBe(0);
    expect(chunkResult.stderr).toBe("");
    const chunks = JSON.parse(chunkResult.stdout) as unknown[];
    expect(chunks.length).toBeGreaterThanOrEqual(3);

    const aggregateResult = runHelper(AGGREGATOR, [
      "-o",
      output,
      join(FIXTURES, "extracted-stories-sample.json"),
    ]);
    expect(aggregateResult.status).toBe(0);
    expect(aggregateResult.stderr).toBe("");
    expect(aggregateResult.stdout).toBe(
      `wrote ${join(output, "EPIC-001.md")} (3 stories)\n` +
        `wrote ${join(output, "EPIC-002.md")} (2 stories)\n` +
        "OK: 2 epics, 5 stories\n",
    );

    const epicFiles = readdirSync(output)
      .filter((name) => /^EPIC-\d{3}\.md$/.test(name))
      .sort();
    expect(epicFiles).toEqual(["EPIC-001.md", "EPIC-002.md"]);
    const contents = epicFiles.map((name) => readFileSync(join(output, name), "utf8"));
    expect(contents.join("\n").match(/^## STORY-\d+$/gm)).toHaveLength(5);

    const validationResult = runHelper(VALIDATOR, [output]);
    expect(validationResult.status).toBe(0);
    expect(validationResult.stderr).toBe("");
    expect(validationResult.stdout).toBe(`OK: ${output}\n`);

    for (const [fileIndex, content] of contents.entries()) {
      expect(content).toMatch(new RegExp(`^# EPIC-00${fileIndex + 1} — `));
      const sections = content.split(/^## /m).slice(1);
      expect(sections.length).toBeGreaterThan(0);
      for (const section of sections) {
        expect(section).toMatch(/^STORY-\d+$/m);
        for (const field of [
          "**Epic:**",
          "**Title:**",
          "**Acceptance criteria:**",
          "**Sources:**",
          "**Status:**",
        ]) {
          expect(section).toContain(field);
        }
      }
    }
  });
});
