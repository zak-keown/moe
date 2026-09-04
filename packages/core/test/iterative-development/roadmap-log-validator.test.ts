import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { runHelper } from "./cli-harness.js";

const ROADMAP_VALIDATOR = "skills/scope-core/scripts/validate_roadmap.mjs";
const LOG_VALIDATOR = "skills/run-iteration/scripts/validate_iteration_log.mjs";
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

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("validate_roadmap", () => {
  it("accepts the fixture and preserves the invoked path spelling in success output", () => {
    const result = runHelper(
      ROADMAP_VALIDATOR,
      ["./test/iterative-development/fixtures/roadmap.example.md"],
      CORE,
    );
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toBe("OK: test/iterative-development/fixtures/roadmap.example.md\n");
  });

  it("exports ordered validation and isolates walking-skeleton fields at the next H2", async () => {
    const modulePath = pathToFileURL(join(CORE, ROADMAP_VALIDATOR)).href;
    const { validateRoadmap } = await import(modulePath);

    expect(validateRoadmap("")).toEqual([
      "missing walking skeleton section (expected '## Walking skeleton (ITER-0000)')",
      "missing iteration list section (expected '## Iteration list')",
    ]);
    expect(
      validateRoadmap(
        [
          "## Walking skeleton (ITER-0000)",
          "**Intent:** present",
          "## Other",
          "**Status:** outside",
          "**Stories committed:** outside",
          "**Journey scenario:** outside",
          "## Iteration list",
        ].join("\n"),
      ),
    ).toEqual([
      "walking skeleton: missing required field **Status:**",
      "walking skeleton: missing required field **Stories committed:**",
      "walking skeleton: missing required field **Journey scenario:**",
    ]);
  });

  it("requires exact headings and all four exact walking-skeleton fields in order", () => {
    const root = tempDir("roadmap-invalid-");
    const path = write(root, "roadmap.md", "## Walking Skeleton (ITER-0000)\n## Iteration List\n");
    const result = runHelper(ROADMAP_VALIDATOR, [path]);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(
      "error: missing walking skeleton section (expected '## Walking skeleton (ITER-0000)')\n" +
        "error: missing iteration list section (expected '## Iteration list')\n",
    );

    const invalidFixture = join(FIXTURES, "roadmap.invalid.md");
    const invalid = runHelper(ROADMAP_VALIDATOR, [invalidFixture]);
    expect(invalid.status).toBe(1);
    expect(invalid.stdout).toBe("");
    expect(invalid.stderr).toBe(
      "error: missing iteration list section (expected '## Iteration list')\n" +
        "error: walking skeleton: missing required field **Intent:**\n" +
        "error: walking skeleton: missing required field **Status:**\n" +
        "error: walking skeleton: missing required field **Stories committed:**\n" +
        "error: walking skeleton: missing required field **Journey scenario:**\n",
    );
  });

  it("normalizes bare CR before isolating the walking-skeleton section", () => {
    const root = tempDir("roadmap-cr-");
    const path = write(
      root,
      "roadmap.md",
      [
        "## Walking skeleton (ITER-0000)",
        "**Intent:** present",
        "## Other",
        "**Status:** outside",
        "**Stories committed:** outside",
        "**Journey scenario:** outside",
        "## Iteration list",
      ].join("\r"),
    );

    const result = runHelper(ROADMAP_VALIDATOR, [path]);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(
      "error: walking skeleton: missing required field **Status:**\n" +
        "error: walking skeleton: missing required field **Stories committed:**\n" +
        "error: walking skeleton: missing required field **Journey scenario:**\n",
    );
  });

  it("preserves exact usage and normalized missing-path errors", () => {
    const usage = runHelper(ROADMAP_VALIDATOR, []);
    expect(usage.status).toBe(2);
    expect(usage.stdout).toBe("");
    expect(usage.stderr).toBe("usage: validate_roadmap.mjs <file>\n");

    const root = tempDir("roadmap-missing-");
    const missing = runHelper(ROADMAP_VALIDATOR, ["./missing.md"], root);
    expect(missing.status).toBe(2);
    expect(missing.stdout).toBe("");
    expect(missing.stderr).toBe("error: file not found: missing.md\n");
  });

  it("runs validation when invoked through a symbolic link", () => {
    const root = tempDir("roadmap-symlink-");
    const link = join(root, "validate-roadmap.mjs");
    symlinkSync(join(CORE, ROADMAP_VALIDATOR), link);
    const input = join(FIXTURES, "roadmap.example.md");

    const result = spawnSync(process.execPath, [link, input], { encoding: "utf8" });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toBe(`OK: ${input}\n`);
  });
});

describe("validate_iteration_log", () => {
  it("accepts the fixture and preserves the invoked path spelling in success output", () => {
    const result = runHelper(
      LOG_VALIDATOR,
      ["./test/iterative-development/fixtures/iteration-log.example.md"],
      CORE,
    );
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toBe(
      "OK: test/iterative-development/fixtures/iteration-log.example.md\n",
    );
  });

  it("exports ordered validation with Unicode-decimal iteration IDs", async () => {
    const modulePath = pathToFileURL(join(CORE, LOG_VALIDATOR)).href;
    const { validateIterationLog } = await import(modulePath);
    const valid = [
      "## ITER-١ — Unicode",
      "**Completed:** today",
      "**Stories delivered:** STORY-١",
      "**Tasks executed:** 1",
      "**Scenarios:** none",
      "**Summary:** complete",
    ].join("\n");
    expect(validateIterationLog(valid)).toEqual([]);
    expect(validateIterationLog("# Empty log")).toEqual([
      "no iteration sections found (expected at least one '## ITER-NNNN')",
    ]);
  });

  it("ends sections only at the next matching iteration header and orders every missing field", async () => {
    const modulePath = pathToFileURL(join(CORE, LOG_VALIDATOR)).href;
    const { validateIterationLog } = await import(modulePath);
    const fieldsUnderOtherH2 = [
      "## ITER-2",
      "## Other section",
      "**Completed:** today",
      "**Stories delivered:** STORY-1",
      "**Tasks executed:** 1",
      "**Scenarios:** none",
      "**Summary:** complete",
    ].join("\n");
    expect(validateIterationLog(fieldsUnderOtherH2)).toEqual([]);
    expect(validateIterationLog("## ITER-2\n## ITER-1\n")).toEqual([
      "ITER-2: missing required field **Completed:**",
      "ITER-2: missing required field **Stories delivered:**",
      "ITER-2: missing required field **Tasks executed:**",
      "ITER-2: missing required field **Scenarios:**",
      "ITER-2: missing required field **Summary:**",
      "ITER-1: missing required field **Completed:**",
      "ITER-1: missing required field **Stories delivered:**",
      "ITER-1: missing required field **Tasks executed:**",
      "ITER-1: missing required field **Scenarios:**",
      "ITER-1: missing required field **Summary:**",
    ]);
  });

  it("normalizes CRLF and bare CR before parsing iteration sections", () => {
    const root = tempDir("iteration-log-newlines-");
    const path = write(
      root,
      "iteration-log.md",
      ["## ITER-1", "**Completed:** today"].join("\r\n") +
        `\r${[
          "**Stories delivered:** STORY-1",
          "**Tasks executed:** 1",
          "**Scenarios:** none",
          "**Summary:** complete",
        ].join("\r")}`,
    );

    const result = runHelper(LOG_VALIDATOR, [path]);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toBe(`OK: ${path}\n`);
  });

  it.each(["\u2028", "\u2029"])(
    "does not treat Unicode separator %j as an iteration-header line boundary",
    (separator) => {
      const root = tempDir("iteration-log-unicode-separator-");
      const path = write(
        root,
        "iteration-log.md",
        `${[
          "## ITER-1",
          "**Completed:** today",
          "**Stories delivered:** STORY-1",
          "**Tasks executed:** 1",
          "**Scenarios:** none",
          "**Summary:** complete",
        ].join("\n")}${separator}## ITER-2`,
      );

      const result = runHelper(LOG_VALIDATOR, [path]);

      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toBe(`OK: ${path}\n`);
    },
  );

  it("preserves exact invalid-fixture, usage, and normalized missing-path streams", () => {
    const invalid = runHelper(LOG_VALIDATOR, [join(FIXTURES, "iteration-log.invalid.md")]);
    expect(invalid.status).toBe(1);
    expect(invalid.stdout).toBe("");
    expect(invalid.stderr).toBe(
      "error: ITER-0000: missing required field **Completed:**\n" +
        "error: ITER-0000: missing required field **Stories delivered:**\n" +
        "error: ITER-0000: missing required field **Tasks executed:**\n" +
        "error: ITER-0000: missing required field **Scenarios:**\n" +
        "error: ITER-0000: missing required field **Summary:**\n",
    );

    const usage = runHelper(LOG_VALIDATOR, []);
    expect(usage.status).toBe(2);
    expect(usage.stdout).toBe("");
    expect(usage.stderr).toBe("usage: validate_iteration_log.mjs <file>\n");

    const root = tempDir("iteration-log-missing-");
    const missing = runHelper(LOG_VALIDATOR, ["./missing.md"], root);
    expect(missing.status).toBe(2);
    expect(missing.stdout).toBe("");
    expect(missing.stderr).toBe("error: file not found: missing.md\n");
  });

  it("runs validation when invoked through a symbolic link", () => {
    const root = tempDir("iteration-log-symlink-");
    const link = join(root, "validate-iteration-log.mjs");
    symlinkSync(join(CORE, LOG_VALIDATOR), link);
    const input = join(FIXTURES, "iteration-log.example.md");

    const result = spawnSync(process.execPath, [link, input], { encoding: "utf8" });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toBe(`OK: ${input}\n`);
  });
});
