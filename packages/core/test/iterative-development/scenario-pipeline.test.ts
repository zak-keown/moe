import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
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

  it("preserves large JSON integers and JSON structural equality without equating booleans to numbers", () => {
    const root = tempDir("scenario-lossless-numbers-");
    const stories = join(root, "requirements");
    mkdirSync(stories);
    const input = join(root, "scenarios.json");
    writeFileSync(
      input,
      [
        "[",
        '{"title":"Numbers","sources":[{"file":"large","lines":9007199254740992},{"file":"same","meta":{"a":1,"b":true}}]},',
        '{"title":"Numbers","sources":[{"file":"large","lines":9007199254740993},{"meta":{"b":true,"a":1.0},"file":"same"},{"file":"same","meta":{"a":true,"b":true}}]}',
        "]",
      ].join(""),
    );
    const output = join(root, "behavior-scenarios.md");

    const result = runAggregator(output, stories, [input]);

    expect(result.status).toBe(0);
    const content = readFileSync(output, "utf8");
    expect(content).toContain("- `large:9007199254740992`");
    expect(content).toContain("- `large:9007199254740993`");
    expect(content.match(/^- `same`$/gm)).toHaveLength(2);
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

  it.each([
    ["null", null],
    ["number", 42],
    ["string", "x"],
  ])("fails for a non-list scenarios wrapper containing %s", (_label, scenariosValue) => {
    const root = tempDir("scenario-malformed-wrapper-");
    const stories = join(root, "requirements");
    mkdirSync(stories);
    const input = writeJson(root, "bad-wrapper.json", { scenarios: scenariosValue });
    const output = join(root, "out.md");

    const result = runAggregator(output, stories, [input]);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).not.toBe("");
    expect(existsSync(output)).toBe(false);
  });

  it("uses Python code-point filename order and Unicode decimal digits in story IDs", () => {
    const root = tempDir("scenario-unicode-stories-");
    const stories = join(root, "requirements");
    mkdirSync(stories);
    writeFileSync(
      join(stories, "EPIC-\uE000.md"),
      "## STORY-1111\n**Title:** Duplicate\n\n## STORY-١\n**Title:** Arabic\n",
    );
    writeFileSync(join(stories, "EPIC-\u{10000}.md"), "## STORY-2222\n**Title:** Duplicate\n");
    const input = writeJson(root, "scenarios.json", [
      { title: "Check", owning_story_titles: ["Duplicate", "Arabic"] },
    ]);
    const output = join(root, "out.md");

    const result = runAggregator(output, stories, [input]);

    expect(result.status).toBe(0);
    expect(readFileSync(output, "utf8")).toContain("**Owning stories:** STORY-2222, STORY-١");
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

  it("accepts argparse long abbreviations, dash values, and end-of-options", () => {
    const root = tempDir("scenario-argparse-edges-");
    mkdirSync(join(root, "stories"));
    writeFileSync(join(root, "empty.json"), "[]");
    writeFileSync(join(root, "-input.json"), "[]");

    const abbreviated = runHelper(
      AGGREGATOR,
      ["--out", "abbreviated.md", "--stories-d", "stories", "empty.json"],
      root,
    );
    expect(abbreviated.status).toBe(0);
    expect(abbreviated.stdout).toBe("");
    expect(abbreviated.stderr).toBe("warning: no scenarios found in input files\n");
    expect(readFileSync(join(root, "abbreviated.md"), "utf8")).toBe(
      "# Behavior Scenarios\n\nNo scenarios extracted.\n",
    );

    const dashOutput = runHelper(
      AGGREGATOR,
      ["-o", "-", "--stories-dir", "stories", "empty.json"],
      root,
    );
    expect(dashOutput.status).toBe(0);
    expect(dashOutput.stdout).toBe("");
    expect(dashOutput.stderr).toBe("warning: no scenarios found in input files\n");
    expect(readFileSync(join(root, "-"), "utf8")).toBe(
      "# Behavior Scenarios\n\nNo scenarios extracted.\n",
    );

    const dashRoot = join(root, "dash-stories");
    mkdirSync(join(dashRoot, "-"), { recursive: true });
    writeFileSync(join(dashRoot, "empty.json"), "[]");
    const dashStories = runHelper(
      AGGREGATOR,
      ["-o", "out.md", "--stories-dir", "-", "empty.json"],
      dashRoot,
    );
    expect(dashStories.status).toBe(0);
    expect(dashStories.stdout).toBe("");
    expect(dashStories.stderr).toBe("warning: no scenarios found in input files\n");
    expect(readFileSync(join(dashRoot, "out.md"), "utf8")).toContain("No scenarios extracted.");

    const endOptions = runHelper(
      AGGREGATOR,
      ["-o", "end.md", "--stories-dir", "stories", "--", "-input.json"],
      root,
    );
    expect(endOptions.status).toBe(0);
    expect(endOptions.stdout).toBe("");
    expect(endOptions.stderr).toBe("warning: no scenarios found in input files\n");
    expect(readFileSync(join(root, "end.md"), "utf8")).toContain("No scenarios extracted.");
  });

  it("normalizes leading-dot path spellings in aggregate errors", () => {
    const root = tempDir("scenario-relative-errors-");
    mkdirSync(join(root, "stories"));

    const missingInput = runHelper(
      AGGREGATOR,
      ["-o", "out.md", "--stories-dir", "stories", "./missing.json"],
      root,
    );
    expect(missingInput.status).toBe(2);
    expect(missingInput.stderr).toBe("error: file not found: missing.json\n");

    writeFileSync(join(root, "empty.json"), "[]");
    const missingStories = runHelper(
      AGGREGATOR,
      ["-o", "out.md", "--stories-dir", "./missing-stories", "empty.json"],
      root,
    );
    expect(missingStories.status).toBe(2);
    expect(missingStories.stderr).toBe("error: stories directory not found: missing-stories\n");
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

  it("recognizes Unicode decimal digits in scenario, story, and AC identifiers", () => {
    const root = tempDir("scenario-backlink-unicode-");
    const requirements = join(root, "requirements");
    mkdirSync(requirements);
    const epic = join(requirements, "EPIC-001.md");
    writeFileSync(epic, "## STORY-١\n- AC-١: observable\n");
    const scenarios = join(root, "scenarios.md");
    writeFileSync(scenarios, "## SCENARIO-١ — Arabic\n**Owning stories:** STORY-١\n");

    const result = runHelper(BACKLINKER, [scenarios, requirements]);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe(
      "EPIC-001.md: 1 AC(s) linked\nOK: 1 AC(s) linked, 0 already linked\n",
    );
    expect(readFileSync(epic, "utf8")).toBe(
      "## STORY-١\n- AC-١: observable · scenario:`SCENARIO-١`",
    );
  });

  it("processes epic filenames in Python code-point order", () => {
    const root = tempDir("scenario-backlink-unicode-order-");
    const requirements = join(root, "requirements");
    mkdirSync(requirements);
    writeFileSync(join(requirements, "EPIC-\uE000.md"), "## STORY-0001\n- AC-1: first\n");
    writeFileSync(join(requirements, "EPIC-\u{10000}.md"), "## STORY-0002\n- AC-1: second\n");
    const scenarios = join(root, "scenarios.md");
    writeFileSync(
      scenarios,
      "## SCENARIO-0001 — Both\n**Owning stories:** STORY-0001, STORY-0002\n",
    );

    const result = runHelper(BACKLINKER, [scenarios, requirements]);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe(
      "EPIC-\uE000.md: 1 AC(s) linked\n" +
        "EPIC-\u{10000}.md: 1 AC(s) linked\n" +
        "OK: 2 AC(s) linked, 0 already linked\n",
    );
  });

  it("returns exit 2 for invalid invocation and missing inputs with exact path spelling", () => {
    const invalid = runHelper(BACKLINKER, []);
    expect(invalid.status).toBe(2);
    expect(invalid.stdout).toBe("");
    expect(invalid.stderr).toBe(
      `usage: ${join(resolve(import.meta.dirname, "..", ".."), BACKLINKER)} <scenarios-file> <requirements-dir>\n`,
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

  it("normalizes leading-dot path spellings in backlink errors", () => {
    const root = tempDir("scenario-backlink-relative-");
    mkdirSync(join(root, "requirements"));

    const missingFile = runHelper(BACKLINKER, ["./missing.md", "requirements"], root);

    expect(missingFile.status).toBe(2);
    expect(missingFile.stdout).toBe("");
    expect(missingFile.stderr).toBe("error: file not found: missing.md\n");

    writeFileSync(join(root, "scenarios.md"), "");
    const missingDirectory = runHelper(
      BACKLINKER,
      ["scenarios.md", "./missing-requirements"],
      root,
    );
    expect(missingDirectory.status).toBe(2);
    expect(missingDirectory.stdout).toBe("");
    expect(missingDirectory.stderr).toBe("error: directory not found: missing-requirements\n");
  });
});
