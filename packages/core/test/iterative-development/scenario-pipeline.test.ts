import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runHelper } from "./cli-harness.js";

const AGGREGATOR = "skills/extracting-requirements/scripts/aggregate_scenarios.mjs";
const BACKLINKER = "skills/extracting-requirements/scripts/backlink_scenarios.mjs";
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

function runAggregator(output: string, stories: string, inputs: readonly string[]) {
  return runHelper(AGGREGATOR, ["-o", output, "--stories-dir", stories, ...inputs]);
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("aggregate_scenarios", () => {
  it("accepts both JSON input shapes, deduplicates exact trimmed titles first-wins, and renders exact grouped Markdown", () => {
    const root = tempDir("scenario-aggregate-");
    const stories = join(root, "requirements");
    mkdirSync(stories);
    writeFileSync(
      join(stories, "EPIC-002.md"),
      "## STORY-0002\n**Title:** Checkout\n\n## STORY-0099\n**Title:** Duplicate\n",
    );
    writeFileSync(
      join(stories, "EPIC-001.md"),
      "## STORY-0001\n**Title:** Login\n\n## STORY-0003\n**Title:** Duplicate\n",
    );
    writeFileSync(join(stories, "EPIC-003.md"), "## STORY-0004\n**Title:** Duplicate\n");
    mkdirSync(join(stories, "nested"));
    writeFileSync(
      join(stories, "nested", "EPIC-000.md"),
      "## STORY-0000\n**Title:** Nested only\n",
    );

    const listInput = writeJson(root, "list.json", [
      {
        title: "  Surface  ",
        kind: "surface",
        proof_seam: "unit",
        owning_story_titles: [" Login ", "Missing"],
        preconditions: ["ready"],
        steps: [{ action: "click", expected: ["shown"] }],
        final_observables: ["done"],
        sources: [{ file: "a.md", lines: "1-2" }, "raw.md"],
      },
      {
        title: "Trip",
        kind: "journey",
        proof_seam: "ignored",
        owning_story_titles: ["Checkout", "Duplicate"],
        preconditions: ["signed in"],
        steps: [{ action: "start", expected: ["middle", "end"] }],
        final_observables: ["complete"],
        sources: [],
      },
    ]);
    const wrappedInput = writeJson(root, "wrapped.json", {
      scenarios: [
        {
          title: "Surface",
          kind: "journey",
          owning_story_titles: ["Checkout", "Login"],
          sources: [
            { lines: "1-2", file: "a.md" },
            { file: "b.md", lines: "" },
          ],
        },
        {
          title: "Second",
          steps: [],
          owning_story_titles: ["Nested only"],
          sources: [],
        },
      ],
    });
    const ignoredInput = writeJson(root, "ignored.json", { stories: [] });
    const output = join(root, "behavior-scenarios.md");

    const result = runAggregator(output, stories, [listInput, wrappedInput, ignoredInput]);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toBe("OK: 1 journey scenarios, 2 surface scenarios\n");
    expect(readFileSync(output, "utf8")).toBe(
      [
        "# Behavior Scenarios",
        "",
        "## Journey Scenarios",
        "",
        "## JOURNEY-0001 — Trip",
        "",
        "**Kind:** journey",
        "**Proof seam:** e2e",
        "**Owning stories:** STORY-0002, STORY-0004",
        "",
        "**Preconditions:**",
        "- signed in",
        "",
        "**Steps:**",
        "1. start",
        "   → middle",
        "   → end",
        "",
        "**Final observables:**",
        "- complete",
        "",
        "**Automation status:** pending",
        "**Execution command:** TBD",
        "",
        "**Sources:**",
        "",
        "## Surface Scenarios",
        "",
        "## SCENARIO-0001 —   Surface  ",
        "",
        "**Kind:** surface",
        "**Proof seam:** unit",
        "**Owning stories:** STORY-0001, UNRESOLVED(Missing), STORY-0002, STORY-0001",
        "",
        "**Preconditions:**",
        "- ready",
        "",
        "**Action:**",
        "- click",
        "",
        "**Expected observables:**",
        "- shown",
        "- done",
        "",
        "**Automation status:** pending",
        "**Execution command:** TBD",
        "",
        "**Sources:**",
        "- `a.md:1-2`",
        "- `raw.md`",
        "- `b.md`",
        "",
        "## SCENARIO-0002 — Second",
        "",
        "**Kind:** surface",
        "**Proof seam:** unknown",
        "**Owning stories:** UNRESOLVED(Nested only)",
        "",
        "**Preconditions:**",
        "",
        "**Action:**",
        "",
        "**Expected observables:**",
        "",
        "**Automation status:** pending",
        "**Execution command:** TBD",
        "",
        "**Sources:**",
        "",
      ].join("\n"),
    );
  });

  it("deduplicates blank titles and merges owners and structurally equal sources in encounter order", () => {
    const root = tempDir("scenario-blank-");
    const stories = join(root, "requirements");
    mkdirSync(stories);
    const input = writeJson(root, "scenarios.json", [
      {
        title: "",
        owning_story_titles: ["First"],
        sources: [{ file: "same.md", lines: "1" }],
      },
      {
        title: "   ",
        owning_story_titles: ["First", "Second"],
        sources: [{ lines: "1", file: "same.md" }, "new.md"],
      },
    ]);
    const output = join(root, "behavior-scenarios.md");

    const result = runAggregator(output, stories, [input]);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("OK: 0 journey scenarios, 1 surface scenarios\n");
    const content = readFileSync(output, "utf8");
    expect(content.match(/^## SCENARIO-/gm)).toHaveLength(1);
    expect(content).toContain("**Owning stories:** UNRESOLVED(First), UNRESOLVED(Second)");
    expect(content.match(/same\.md:1/g)).toHaveLength(1);
    expect(content.indexOf("same.md:1")).toBeLessThan(content.indexOf("new.md"));
  });

  it("writes the exact empty document and warning without creating a missing output parent", () => {
    const root = tempDir("scenario-empty-");
    const stories = join(root, "requirements");
    mkdirSync(stories);
    const input = writeJson(root, "empty.json", { scenarios: [] });
    const output = join(root, "behavior-scenarios.md");

    const result = runAggregator(output, stories, [input]);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("warning: no scenarios found in input files\n");
    expect(readFileSync(output, "utf8")).toBe("# Behavior Scenarios\n\nNo scenarios extracted.\n");

    const missingParent = runAggregator(join(root, "missing", "output.md"), stories, [input]);
    expect(missingParent.status).toBe(1);
    expect(missingParent.stderr).toContain("warning: no scenarios found in input files\n");
    expect(missingParent.stderr).toContain(join(root, "missing", "output.md"));
  });

  it("reports malformed JSON with its source path", () => {
    const root = tempDir("scenario-malformed-");
    const stories = join(root, "requirements");
    mkdirSync(stories);
    const input = join(root, "broken.json");
    writeFileSync(input, '{"scenarios": [}');

    const result = runAggregator(join(root, "out.md"), stories, [input]);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain(input);
  });

  it("preserves argparse-compatible help, errors, option spellings, and path spelling", () => {
    const noArgs = runHelper(AGGREGATOR, []);
    expect(noArgs.status).toBe(2);
    expect(noArgs.stdout).toBe("");
    expect(noArgs.stderr).toBe(
      "usage: aggregate_scenarios.mjs [-h] -o OUTPUT --stories-dir STORIES_DIR\n" +
        "                               json_files [json_files ...]\n" +
        "aggregate_scenarios.mjs: error: the following arguments are required: -o/--output, --stories-dir, json_files\n",
    );

    const expectedHelp = [
      "usage: aggregate_scenarios.mjs [-h] -o OUTPUT --stories-dir STORIES_DIR",
      "                               json_files [json_files ...]",
      "",
      "Aggregate scenarios into behavior-scenarios.md",
      "",
      "positional arguments:",
      "  json_files            Extracted scenario JSON files",
      "",
      "options:",
      "  -h, --help            show this help message and exit",
      "  -o, --output OUTPUT   Output file path",
      "  --stories-dir STORIES_DIR",
      "                        Requirements directory for resolving story title -> ID",
      "",
    ].join("\n");
    for (const option of ["-h", "--help"]) {
      const help = runHelper(AGGREGATOR, [option]);
      expect(help.status).toBe(0);
      expect(help.stderr).toBe("");
      expect(help.stdout).toBe(expectedHelp);
    }

    const root = tempDir("scenario-options-");
    const stories = join(root, "requirements");
    mkdirSync(stories);
    const input = writeJson(root, "empty.json", []);
    const longOutput = join(root, "long.md");
    const long = runHelper(AGGREGATOR, [
      `--output=${longOutput}`,
      `--stories-dir=${stories}`,
      input,
    ]);
    expect(long.status).toBe(0);
    expect(readFileSync(longOutput, "utf8")).toBe(
      "# Behavior Scenarios\n\nNo scenarios extracted.\n",
    );

    const missing = join(root, "relative-looking-missing.json");
    const missingResult = runAggregator(join(root, "out.md"), stories, [missing]);
    expect(missingResult.status).toBe(2);
    expect(missingResult.stderr).toBe(`error: file not found: ${missing}\n`);

    const missingStories = join(root, "missing-stories");
    const missingStoriesResult = runAggregator(join(root, "out.md"), missingStories, [input]);
    expect(missingStoriesResult.status).toBe(2);
    expect(missingStoriesResult.stderr).toBe(
      `error: stories directory not found: ${missingStories}\n`,
    );
  });
});

describe("backlink_scenarios", () => {
  it("parses mappings in encounter order and updates sorted top-level epics with exact BASE line rules", () => {
    const root = tempDir("scenario-backlink-");
    const requirements = join(root, "requirements");
    mkdirSync(requirements);
    const epic2 = join(requirements, "EPIC-002.md");
    const epic1 = join(requirements, "EPIC-001.md");
    const other = join(requirements, "OTHER.md");
    writeFileSync(
      epic2,
      [
        "prefix",
        "## STORY-0002",
        "- AC-1: do thing",
        "- AC-2: no effect · impact:`none`",
        "- AC-3: prelinked · Scenario:`SCENARIO-9999`",
        "- AC-X: unrelated",
        "suffix",
        "",
      ].join("\n"),
    );
    writeFileSync(
      epic1,
      [
        "## STORY-0001",
        "- AC-1: first",
        "- AC-2: spaced impact: `none`",
        "  - AC-3: indented",
        "## STORY-9999",
        "- AC-1: unmapped",
        "",
      ].join("\n"),
    );
    writeFileSync(other, "## STORY-0001\n- AC-1: untouched\n");
    const scenarios = join(root, "behavior-scenarios.md");
    writeFileSync(
      scenarios,
      [
        "## JOURNEY-0001 — First",
        "**Owning stories:** STORY-0002, STORY-0001",
        "## SCENARIO-0001 — Second",
        "**Owning stories:** STORY-0001, STORY-0001",
        "## SCENARIO-0002 — None",
        "**Owning stories:** UNRESOLVED(Missing)",
        "",
      ].join("\n"),
    );

    const result = runHelper(BACKLINKER, [scenarios, requirements]);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toBe(
      "EPIC-001.md: 2 AC(s) linked\n" +
        "EPIC-002.md: 1 AC(s) linked\n" +
        "OK: 3 AC(s) linked, 1 already linked\n",
    );
    expect(readFileSync(epic1, "utf8")).toBe(
      [
        "## STORY-0001",
        "- AC-1: first · scenario:`JOURNEY-0001`",
        "- AC-2: spaced impact: `none` · scenario:`JOURNEY-0001`",
        "  - AC-3: indented",
        "## STORY-9999",
        "- AC-1: unmapped",
      ].join("\n"),
    );
    expect(readFileSync(epic2, "utf8")).toBe(
      [
        "prefix",
        "## STORY-0002",
        "- AC-1: do thing · scenario:`JOURNEY-0001`",
        "- AC-2: no effect · impact:`none`",
        "- AC-3: prelinked · Scenario:`SCENARIO-9999`",
        "- AC-X: unrelated",
        "suffix",
      ].join("\n"),
    );
    expect(readFileSync(other, "utf8")).toBe("## STORY-0001\n- AC-1: untouched\n");

    const second = runHelper(BACKLINKER, [scenarios, requirements]);
    expect(second.status).toBe(0);
    expect(second.stdout).toBe("OK: 0 AC(s) linked, 4 already linked\n");
  });

  it("warns and exits zero without changing files when there are no mappings", () => {
    const root = tempDir("scenario-no-mapping-");
    const requirements = join(root, "requirements");
    mkdirSync(requirements);
    const epic = join(requirements, "EPIC-001.md");
    const original = "## STORY-0001\n- AC-1: untouched\n";
    writeFileSync(epic, original);
    const scenarios = join(root, "empty.md");
    writeFileSync(scenarios, "# Behavior Scenarios\n\nNo scenarios extracted.\n");

    const result = runHelper(BACKLINKER, [scenarios, requirements]);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("warning: no scenario-to-story mappings found\n");
    expect(readFileSync(epic, "utf8")).toBe(original);
  });

  it("returns exit 2 for invalid invocation and missing inputs with exact path spelling", () => {
    const invalid = runHelper(BACKLINKER, []);
    expect(invalid.status).toBe(2);
    expect(invalid.stdout).toBe("");
    expect(invalid.stderr).toBe(
      "usage: backlink_scenarios.mjs <scenarios-file> <requirements-dir>\n",
    );

    const root = tempDir("scenario-backlink-errors-");
    const missing = join(root, "missing.md");
    const requirements = join(root, "requirements");
    mkdirSync(requirements);
    const missingFile = runHelper(BACKLINKER, [missing, requirements]);
    expect(missingFile.status).toBe(2);
    expect(missingFile.stderr).toBe(`error: file not found: ${missing}\n`);

    const scenarios = join(root, "scenarios.md");
    writeFileSync(scenarios, "");
    const missingDirectory = join(root, "missing-dir");
    const missingDir = runHelper(BACKLINKER, [scenarios, missingDirectory]);
    expect(missingDir.status).toBe(2);
    expect(missingDir.stderr).toBe(`error: directory not found: ${missingDirectory}\n`);
  });
});
