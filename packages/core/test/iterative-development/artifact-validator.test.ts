import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { runHelper } from "./cli-harness.js";

const REQUIREMENTS_VALIDATOR =
  "skills/extract-requirements/scripts/validate_requirements_index.mjs";
const SCENARIO_VALIDATOR = "skills/extract-requirements/scripts/validate_scenarios.mjs";
const CORE = resolve(import.meta.dirname, "..", "..");
const FIXTURES = resolve(import.meta.dirname, "fixtures");
const temporaryRoots: string[] = [];

function tempDir(prefix: string): string {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  temporaryRoots.push(directory);
  return directory;
}

function write(root: string, name: string, content: string): string {
  const path = join(root, name);
  writeFileSync(path, content);
  return path;
}

function validStory(id = "0001"): string {
  return [
    `## STORY-${id}`,
    "**Epic:** EPIC-001",
    "**Title:** Checkout",
    "**Acceptance criteria:**",
    "**Sources:**",
    "**Status:** pending",
    "",
  ].join("\n");
}

function validScenario(id = "SCENARIO-0001", story = "STORY-0001"): string {
  return [
    `## ${id} — Checkout`,
    `**Kind:** ${id.startsWith("JOURNEY-") ? "journey" : "surface"}`,
    "**Proof seam:** unit",
    `**Owning stories:** ${story}`,
    ...(id.startsWith("JOURNEY-") ? ["1. Complete checkout"] : []),
    "",
  ].join("\n");
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("validate_requirements_index", () => {
  it("preserves the legacy valid single-file and directory contracts", () => {
    const file = join(FIXTURES, "requirements-index.example.md");
    const fileResult = runHelper(REQUIREMENTS_VALIDATOR, [file]);
    expect(fileResult.status).toBe(0);
    expect(fileResult.stderr).toBe("");
    expect(fileResult.stdout).toBe(`OK: ${file}\n`);

    const directory = join(FIXTURES, "requirements-dir.example");
    const directoryResult = runHelper(REQUIREMENTS_VALIDATOR, [directory]);
    expect(directoryResult.status).toBe(0);
    expect(directoryResult.stderr).toBe("");
    expect(directoryResult.stdout).toBe(`OK: ${directory}\n`);
  });

  it("reports malformed headers and all five exact required fields within each story section", async () => {
    const modulePath = pathToFileURL(join(CORE, REQUIREMENTS_VALIDATOR)).href;
    const { validateContent } = await import(modulePath);
    const errors = validateContent(
      [
        "## STORY-",
        "## STORY-0001",
        "**Epic:** one",
        "## Other section",
        "**Title:** outside the story",
        "## STORY-0002",
        "**Title:** two",
        "",
      ].join("\n"),
      "sample.md",
    );

    expect(errors).toEqual([
      "sample.md: found malformed story id: STORY- header is missing digits",
      "sample.md: STORY-0001: missing required field **Title:**",
      "sample.md: STORY-0001: missing required field **Acceptance criteria:**",
      "sample.md: STORY-0001: missing required field **Sources:**",
      "sample.md: STORY-0001: missing required field **Status:**",
      "sample.md: STORY-0002: missing required field **Epic:**",
      "sample.md: STORY-0002: missing required field **Acceptance criteria:**",
      "sample.md: STORY-0002: missing required field **Sources:**",
      "sample.md: STORY-0002: missing required field **Status:**",
    ]);
  });

  it("uses Unicode decimal digits in exact STORY headers and only the basename in diagnostics", () => {
    const root = tempDir("requirements-unicode-");
    const path = write(root, "unicode.md", validStory("١"));
    expect(runHelper(REQUIREMENTS_VALIDATOR, [path]).status).toBe(0);

    writeFileSync(path, "## STORY-١\n**Epic:** EPIC-001\n");
    const invalid = runHelper(REQUIREMENTS_VALIDATOR, [path]);
    expect(invalid.status).toBe(1);
    expect(invalid.stdout).toBe("");
    expect(invalid.stderr).toContain(
      "error: unicode.md: STORY-١: missing required field **Title:**",
    );
    expect(invalid.stderr).not.toContain(root);
  });

  it("reads sorted top-level markdown only and reports an empty directory", () => {
    const root = tempDir("requirements-directory-");
    mkdirSync(join(root, "nested"));
    writeFileSync(join(root, "nested", "nested.md"), "## STORY-\n");
    writeFileSync(join(root, "ignored.txt"), "## STORY-\n");

    const empty = runHelper(REQUIREMENTS_VALIDATOR, [root]);
    expect(empty.status).toBe(1);
    expect(empty.stdout).toBe("");
    expect(empty.stderr).toBe(`error: no .md files found in ${root}\n`);

    write(root, `EPIC-\u{10000}.md`, "## STORY-0002\n");
    write(root, `EPIC-\uE000.md`, "## STORY-0001\n");
    const invalid = runHelper(REQUIREMENTS_VALIDATOR, [root]);
    expect(invalid.status).toBe(1);
    expect(invalid.stderr.indexOf("EPIC-\uE000.md")).toBeLessThan(
      invalid.stderr.indexOf("EPIC-\u{10000}.md"),
    );
  });

  it("preserves invocation, missing-path, invalid-fixture, and leading-dot path behavior", () => {
    const noArgs = runHelper(REQUIREMENTS_VALIDATOR, []);
    expect(noArgs.status).toBe(2);
    expect(noArgs.stdout).toBe("");
    expect(noArgs.stderr).toBe("usage: validate_requirements_index.mjs <path>\n");

    const root = tempDir("requirements-errors-");
    const missing = runHelper(REQUIREMENTS_VALIDATOR, ["./missing.md"], root);
    expect(missing.status).toBe(2);
    expect(missing.stdout).toBe("");
    expect(missing.stderr).toBe("error: not found: missing.md\n");

    const invalidFixture = join(FIXTURES, "requirements-index.invalid.md");
    const invalid = runHelper(REQUIREMENTS_VALIDATOR, [invalidFixture]);
    expect(invalid.status).toBe(1);
    expect(invalid.stderr).toContain(`error: ${basename(invalidFixture)}:`);
  });

  it("runs validation when invoked through a symbolic link", () => {
    const root = tempDir("requirements-symlink-");
    const link = join(root, "validate-requirements.mjs");
    symlinkSync(join(CORE, REQUIREMENTS_VALIDATOR), link);
    const input = write(root, "requirements.md", validStory());

    const result = spawnSync(process.execPath, [link, input], { encoding: "utf8" });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toBe(`OK: ${input}\n`);
  });

  it.each(["\r", "\r\n"])("normalizes %j newlines at CLI file reads", (newline) => {
    const root = tempDir("requirements-universal-newlines-");
    const input = write(root, "requirements.md", validStory().trimEnd().replaceAll("\n", newline));

    const result = runHelper(REQUIREMENTS_VALIDATOR, [input]);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toBe(`OK: ${input}\n`);
  });

  it.each(["\u2028", "\u2029"])(
    "does not treat %j as a story or next-H2 regex boundary",
    (separator) => {
      const root = tempDir("requirements-unicode-separator-");
      const input = write(
        root,
        "requirements.md",
        [
          "## STORY-0001",
          `**Epic:** EPIC-001${separator}## Not a boundary`,
          "**Title:** Checkout",
          "**Acceptance criteria:**",
          "**Sources:**",
          "**Status:** pending",
        ].join("\n"),
      );

      const result = runHelper(REQUIREMENTS_VALIDATOR, [input]);

      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
    },
  );
});

describe("validate_scenarios", () => {
  it("accepts a valid scenario and exports ordered top-level story loading", async () => {
    const root = tempDir("scenario-valid-");
    const requirements = join(root, "requirements");
    mkdirSync(requirements);
    write(requirements, `EPIC-\u{10000}.md`, validStory("0002"));
    write(requirements, `EPIC-\uE000.md`, validStory("0001"));
    write(requirements, "OTHER.md", validStory("9999"));
    mkdirSync(join(requirements, "nested"));
    write(join(requirements, "nested"), "EPIC-000.md", validStory("0000"));
    const scenarios = write(root, "behavior-scenarios.md", validScenario());

    const result = runHelper(SCENARIO_VALIDATOR, [scenarios, requirements]);
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toBe("OK: scenarios valid\n");

    const modulePath = pathToFileURL(join(CORE, SCENARIO_VALIDATOR)).href;
    const { loadStoryIds, validateScenarios } = await import(modulePath);
    expect([...loadStoryIds(requirements)]).toEqual(["STORY-0001", "STORY-0002"]);
    expect(validateScenarios(scenarios, requirements)).toEqual([]);
  });

  it("reports duplicate IDs, unknown stories, and every unresolved reference in encounter order", () => {
    const root = tempDir("scenario-references-");
    const requirements = join(root, "requirements");
    mkdirSync(requirements);
    write(requirements, "EPIC-001.md", validStory());
    const scenarios = write(
      root,
      "scenarios.md",
      [
        validScenario(),
        "## SCENARIO-0001 — Duplicate",
        "**Kind:** surface",
        "**Proof seam:** unit",
        "**Owning stories:** STORY-9999, UNRESOLVED(First), UNRESOLVED(Second)",
        "",
      ].join("\n"),
    );

    const result = runHelper(SCENARIO_VALIDATOR, [scenarios, requirements]);
    expect(result.status).toBe(1);
    expect(result.stderr).toBe(
      "ERROR: line 6: duplicate scenario ID SCENARIO-0001\n" +
        "ERROR: SCENARIO-0001: references unknown STORY-9999\n" +
        "ERROR: SCENARIO-0001: has UNRESOLVED(First)\n" +
        "ERROR: SCENARIO-0001: has UNRESOLVED(Second)\n",
    );
    expect(result.stdout).toBe("FAIL: 4 error(s)\n");
  });

  it("requires owning-story and proof-seam fields and rejects an empty file", () => {
    const root = tempDir("scenario-fields-");
    const requirements = join(root, "requirements");
    mkdirSync(requirements);
    const missing = write(root, "missing.md", "## SCENARIO-0001 — Empty\n**Kind:** surface\n");

    const missingResult = runHelper(SCENARIO_VALIDATOR, [missing, requirements]);
    expect(missingResult.status).toBe(1);
    expect(missingResult.stderr).toBe(
      "ERROR: SCENARIO-0001: missing 'Owning stories' field\n" +
        "ERROR: SCENARIO-0001: missing 'Proof seam' field\n",
    );
    expect(missingResult.stdout).toBe("FAIL: 2 error(s)\n");

    const empty = write(root, "empty.md", "");
    const emptyResult = runHelper(SCENARIO_VALIDATOR, [empty, requirements]);
    expect(emptyResult.status).toBe(1);
    expect(emptyResult.stderr).toBe("ERROR: no scenarios found in file\n");
    expect(emptyResult.stdout).toBe("FAIL: 1 error(s)\n");
  });

  it("requires a numbered journey step and recognizes Unicode decimal numbering", () => {
    const root = tempDir("scenario-journey-");
    const requirements = join(root, "requirements");
    mkdirSync(requirements);
    write(requirements, "EPIC-001.md", validStory("١"));
    const noSteps = write(
      root,
      "no-steps.md",
      validScenario("JOURNEY-١", "STORY-١").replace("1. Complete checkout\n", ""),
    );
    const invalid = runHelper(SCENARIO_VALIDATOR, [noSteps, requirements]);
    expect(invalid.status).toBe(1);
    expect(invalid.stderr).toBe("ERROR: JOURNEY-١: journey scenario has no steps\n");

    const unicodeSteps = write(
      root,
      "unicode-steps.md",
      validScenario("JOURNEY-١", "STORY-١").replace("1.", "١."),
    );
    const valid = runHelper(SCENARIO_VALIDATOR, [unicodeSteps, requirements]);
    expect(valid.status).toBe(0);
    expect(valid.stdout).toBe("OK: scenarios valid\n");
  });

  it("recognizes Python U+001F whitespace before a numbered journey step", () => {
    const root = tempDir("scenario-python-whitespace-");
    const requirements = join(root, "requirements");
    mkdirSync(requirements);
    write(requirements, "EPIC-001.md", validStory());
    const scenarios = write(
      root,
      "scenarios.md",
      validScenario("JOURNEY-0001").replace("1. Complete checkout", "\u001f1. Complete checkout"),
    );

    const result = runHelper(SCENARIO_VALIDATOR, [scenarios, requirements]);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toBe("OK: scenarios valid\n");
  });

  it("excludes nested epics when resolving stories", () => {
    const root = tempDir("scenario-nested-");
    const requirements = join(root, "requirements");
    mkdirSync(join(requirements, "nested"), { recursive: true });
    write(join(requirements, "nested"), "EPIC-001.md", validStory());
    const scenarios = write(root, "scenarios.md", validScenario());

    const result = runHelper(SCENARIO_VALIDATOR, [scenarios, requirements]);
    expect(result.status).toBe(1);
    expect(result.stderr).toBe("ERROR: SCENARIO-0001: references unknown STORY-0001\n");
  });

  it("preserves full invoked-path usage and normalized path diagnostics", () => {
    const noArgs = runHelper(SCENARIO_VALIDATOR, []);
    expect(noArgs.status).toBe(2);
    expect(noArgs.stdout).toBe("");
    expect(noArgs.stderr).toBe(
      `usage: ${join(CORE, SCENARIO_VALIDATOR)} <scenarios-file> <requirements-dir>\n`,
    );

    const root = tempDir("scenario-errors-");
    mkdirSync(join(root, "requirements"));
    const missingFile = runHelper(SCENARIO_VALIDATOR, ["./missing.md", "requirements"], root);
    expect(missingFile.status).toBe(2);
    expect(missingFile.stderr).toBe("error: file not found: missing.md\n");

    const scenarios = write(root, "scenarios.md", "");
    const missingDirectory = runHelper(
      SCENARIO_VALIDATOR,
      [basename(scenarios), "./missing-requirements"],
      root,
    );
    expect(missingDirectory.status).toBe(2);
    expect(missingDirectory.stderr).toBe("error: directory not found: missing-requirements\n");
  });

  it("runs validation when invoked through a symbolic link", () => {
    const root = tempDir("scenario-symlink-");
    const link = join(root, "validate-scenarios.mjs");
    symlinkSync(join(CORE, SCENARIO_VALIDATOR), link);
    const requirements = join(root, "requirements");
    mkdirSync(requirements);
    write(requirements, "EPIC-001.md", validStory());
    const scenarios = write(root, "scenarios.md", validScenario());

    const result = spawnSync(process.execPath, [link, scenarios, requirements], {
      encoding: "utf8",
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toBe("OK: scenarios valid\n");
  });
});
