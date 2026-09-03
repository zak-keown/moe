import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runHelper } from "./cli-harness.js";

const HELPER = "skills/extracting-requirements/scripts/aggregate_stories.mjs";
const PROGRAM = "aggregate_stories.mjs";
const temporaryRoots: string[] = [];

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temporaryRoots.push(dir);
  return dir;
}

function writeJson(root: string, name: string, value: unknown): string {
  const path = join(root, name);
  writeFileSync(path, JSON.stringify(value));
  return path;
}

function run(outputDir: string, inputs: readonly string[], outputOption = "-o") {
  return runHelper(HELPER, [outputOption, outputDir, ...inputs]);
}

function readEpics(outputDir: string): string {
  return readdirSync(outputDir)
    .filter((name) => /^EPIC-.*\.md$/.test(name))
    .sort()
    .map((name) => readFileSync(join(outputDir, name), "utf8"))
    .join("\n");
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("aggregate_stories", () => {
  it.each(["-o", "--output-dir"])(
    "accepts the %s output option and both supported input shapes",
    (option) => {
      const root = tempDir("aggregate-stories-shapes-");
      const output = join(root, "requirements");
      const listInput = writeJson(root, "list.json", [
        {
          title: "First story",
          epic_theme: "First epic",
          acceptance_criteria: ["AC-1: first"],
          sources: ["z.md"],
        },
      ]);
      const objectInput = writeJson(root, "object.json", {
        stories: [
          {
            title: "Second story",
            epic_theme: "Second epic",
            acceptance_criteria: ["AC-1: second"],
            sources: ["a.md"],
          },
        ],
      });

      const result = run(output, [listInput, objectInput], option);

      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toBe(
        `wrote ${join(output, "EPIC-001.md")} (1 stories)\n` +
          `wrote ${join(output, "EPIC-002.md")} (1 stories)\n` +
          "OK: 2 epics, 2 stories\n",
      );
      expect(readdirSync(output).sort()).toEqual(["EPIC-001.md", "EPIC-002.md"]);
    },
  );

  it("renders the covered Markdown exactly and sorts primary sources", () => {
    const root = tempDir("aggregate-stories-markdown-");
    const output = join(root, "requirements");
    const input = writeJson(root, "stories.json", [
      {
        title: "Ship it",
        epic_theme: "Delivery",
        as_a: "maintainer",
        i_want: "a release",
        so_that: "users benefit",
        acceptance_criteria: [
          { id: "AC-1", text: "publish", behavioral_impact: "external", proof_seam: "CLI" },
          "AC-2: announce",
        ],
        sources: [{ file: "z.md", lines: "8-9" }, "a.md"],
      },
    ]);

    const result = run(output, [input]);

    expect(result.status).toBe(0);
    expect(readFileSync(join(output, "EPIC-001.md"), "utf8")).toBe(
      [
        "# EPIC-001 — Delivery",
        "",
        "**Summary:** Delivery",
        "**Stories:** STORY-0001",
        "**Primary sources:** `a.md`, `z.md`",
        "**Status:** 0/1 done",
        "",
        "## STORY-0001",
        "",
        "**Epic:** EPIC-001 — Delivery",
        "**Title:** Ship it",
        "",
        "**As a** maintainer",
        "**I want** a release",
        "**So that** users benefit",
        "",
        "**Acceptance criteria:**",
        "- AC-1: publish · impact:`external` · seam:`CLI`",
        "- AC-2: announce",
        "",
        "**Sources:**",
        "- `z.md:8-9`",
        "- `a.md`",
        "",
        "**Status:** pending",
        "",
      ].join("\n"),
    );
  });

  it("deduplicates only exact theme, title, and body matches and merges unique sources in encounter order", () => {
    const root = tempDir("aggregate-stories-dedup-");
    const output = join(root, "requirements");
    const shared = {
      title: "Same story",
      epic_theme: "Test",
      i_want: "x",
      so_that: "y",
      acceptance_criteria: ["AC-1: test"],
    };
    const input = writeJson(root, "stories.json", [
      { ...shared, sources: ["first.md", "shared.md"] },
      { ...shared, sources: ["shared.md", "second.md"] },
    ]);

    expect(run(output, [input]).status).toBe(0);
    const content = readEpics(output);
    expect(content.match(/^## STORY-/gm)).toHaveLength(1);
    const storySources = content.slice(content.indexOf("**Sources:**"));
    expect(storySources.indexOf("`first.md`")).toBeLessThan(storySources.indexOf("`shared.md`"));
    expect(storySources.indexOf("`shared.md`")).toBeLessThan(storySources.indexOf("`second.md`"));
    expect(content.match(/`shared\.md`/g)).toHaveLength(2);
  });

  it("keeps same-title stories distinct across epics, body collisions, and blank titles", () => {
    const root = tempDir("aggregate-stories-identity-");
    const output = join(root, "requirements");
    const input = writeJson(root, "stories.json", [
      { title: "Validate", epic_theme: "Auth", i_want: "password", sources: ["auth.md"] },
      { title: "Validate", epic_theme: "Billing", i_want: "password", sources: ["billing.md"] },
      { title: "Collide", epic_theme: "Auth", i_want: "password", sources: ["one.md"] },
      { title: "Collide", epic_theme: "Auth", i_want: "email", sources: ["two.md"] },
      { title: "", epic_theme: "Misc", sources: ["blank-one.md"] },
      { title: "   ", epic_theme: "Misc", sources: ["blank-two.md"] },
    ]);

    expect(run(output, [input]).status).toBe(0);
    const content = readEpics(output);
    expect(content.match(/^## STORY-/gm)).toHaveLength(6);
    expect(content).toContain("**Title:** ");
    for (const source of [
      "auth.md",
      "billing.md",
      "one.md",
      "two.md",
      "blank-one.md",
      "blank-two.md",
    ]) {
      expect(content).toContain(source);
    }
  });

  it("preserves first-seen epic grouping order and assigns sequential epic and story IDs", () => {
    const root = tempDir("aggregate-stories-order-");
    const output = join(root, "requirements");
    const input = writeJson(root, "stories.json", [
      { title: "B1", epic_theme: "Beta", sources: [] },
      { title: "A1", epic_theme: "Alpha", sources: [] },
      { title: "B2", epic_theme: "Beta", sources: [] },
    ]);

    expect(run(output, [input]).status).toBe(0);
    const first = readFileSync(join(output, "EPIC-001.md"), "utf8");
    const second = readFileSync(join(output, "EPIC-002.md"), "utf8");
    expect(first).toContain("# EPIC-001 — Beta");
    expect(first.match(/^## STORY-\d+$/gm)).toEqual(["## STORY-0001", "## STORY-0002"]);
    expect(second).toContain("# EPIC-002 — Alpha");
    expect(second.match(/^## STORY-\d+$/gm)).toEqual(["## STORY-0003"]);
  });

  it("removes every stale EPIC Markdown file before writing a smaller replacement set", () => {
    const root = tempDir("aggregate-stories-stale-");
    const output = join(root, "requirements");
    mkdirSync(output);
    writeFileSync(join(output, "EPIC-001.md"), "old one");
    writeFileSync(join(output, "EPIC-999.md"), "stale");
    writeFileSync(join(output, "notes.md"), "keep");
    const input = writeJson(root, "stories.json", [
      { title: "Fresh", epic_theme: "Only", sources: [] },
    ]);

    expect(run(output, [input]).status).toBe(0);
    expect(readdirSync(output).sort()).toEqual(["EPIC-001.md", "notes.md"]);
    expect(readFileSync(join(output, "EPIC-001.md"), "utf8")).toContain("**Title:** Fresh");
  });

  it("warns and skips unexpected input shapes", () => {
    const root = tempDir("aggregate-stories-warning-");
    const output = join(root, "requirements");
    const skipped = writeJson(root, "skipped.json", { notStories: [] });
    const valid = writeJson(root, "valid.json", [
      { title: "Kept", epic_theme: "Only", sources: [] },
    ]);

    const result = run(output, [skipped, valid]);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe(`warning: ${skipped} has unexpected format, skipping\n`);
    expect(result.stdout).toBe(
      `wrote ${join(output, "EPIC-001.md")} (1 stories)\nOK: 1 epics, 1 stories\n`,
    );
  });

  it.each([
    ["null wrapper", { stories: null }],
    ["object wrapper", { stories: {} }],
    ["string wrapper", { stories: "abc" }],
    ["number wrapper", { stories: 42 }],
    ["null top level", null],
    ["string top level", "abc"],
    ["number top level", 42],
  ])("warns and reaches the no-stories result for a malformed %s", (_label, value) => {
    const root = tempDir("aggregate-stories-malformed-");
    const output = join(root, "requirements");
    const input = writeJson(root, "malformed.json", value);

    const result = run(output, [input]);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(
      `warning: ${input} has unexpected format, skipping\n` +
        "error: no stories found in input files\n",
    );
    expect(() => readdirSync(output)).toThrow();
  });

  it("returns exit 1 for valid input containing no stories", () => {
    const root = tempDir("aggregate-stories-empty-");
    const output = join(root, "requirements");
    const input = writeJson(root, "empty.json", { stories: [] });

    const result = run(output, [input]);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("error: no stories found in input files\n");
  });

  it("returns argparse-compatible exit 2 when required arguments are absent", () => {
    const result = runHelper(HELPER, []);

    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(
      `usage: ${PROGRAM} [-h] -o OUTPUT_DIR json_files [json_files ...]\n` +
        `${PROGRAM}: error: the following arguments are required: -o/--output-dir, json_files\n`,
    );
  });

  it("prints argparse-compatible help", () => {
    const result = runHelper(HELPER, ["--help"]);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toBe(
      [
        `usage: ${PROGRAM} [-h] -o OUTPUT_DIR json_files [json_files ...]`,
        "",
        "Aggregate stories into per-epic files",
        "",
        "positional arguments:",
        "  json_files            Extracted story JSON files",
        "",
        "options:",
        "  -h, --help            show this help message and exit",
        "  -o, --output-dir OUTPUT_DIR",
        "                        Directory to write per-epic files (created if needed)",
        "",
      ].join("\n"),
    );
  });

  it.each(["-o", "--output-dir"])(
    "reports an argparse-compatible missing value for %s",
    (option) => {
      const result = runHelper(HELPER, [option, "--help"]);

      expect(result.status).toBe(2);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe(
        `usage: ${PROGRAM} [-h] -o OUTPUT_DIR json_files [json_files ...]\n` +
          `${PROGRAM}: error: argument -o/--output-dir: expected one argument\n`,
      );
    },
  );

  it("honors -- so an option-looking JSON filename remains positional", () => {
    const root = tempDir("aggregate-stories-end-options-");
    writeJson(root, "-stories.json", [{ title: "End options", epic_theme: "CLI", sources: [] }]);

    const result = runHelper(HELPER, ["-o", "requirements", "--", "-stories.json"], root);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toBe(
      "wrote requirements/EPIC-001.md (1 stories)\nOK: 1 epics, 1 stories\n",
    );
    expect(readFileSync(join(root, "requirements", "EPIC-001.md"), "utf8")).toContain(
      "**Title:** End options",
    );
  });

  it("accepts argparse's unique --output-d abbreviation", () => {
    const root = tempDir("aggregate-stories-abbreviation-");
    writeJson(root, "stories.json", [{ title: "Abbreviated", epic_theme: "CLI", sources: [] }]);

    const result = runHelper(HELPER, ["--output-d", "requirements", "stories.json"], root);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toBe(
      "wrote requirements/EPIC-001.md (1 stories)\nOK: 1 epics, 1 stories\n",
    );
    expect(readFileSync(join(root, "requirements", "EPIC-001.md"), "utf8")).toContain(
      "**Title:** Abbreviated",
    );
  });

  it("treats --output-dir= as the current working directory", () => {
    const root = tempDir("aggregate-stories-empty-output-");
    writeJson(root, "stories.json", [
      { title: "Current directory", epic_theme: "CLI", sources: [] },
    ]);

    const result = runHelper(HELPER, ["--output-dir=", "stories.json"], root);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toBe("wrote EPIC-001.md (1 stories)\nOK: 1 epics, 1 stories\n");
    expect(readFileSync(join(root, "EPIC-001.md"), "utf8")).toContain(
      "**Title:** Current directory",
    );
    expect(readFileSync(join(root, "stories.json"), "utf8")).not.toBe("");
  });

  it("returns exit 2 when an input file is missing", () => {
    const root = tempDir("aggregate-stories-missing-");
    const output = join(root, "requirements");
    const missing = join(root, "missing.json");

    const result = run(output, [missing]);

    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(`error: file not found: ${missing}\n`);
  });
});
