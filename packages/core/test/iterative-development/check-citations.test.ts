import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runHelper } from "./cli-harness.js";

const SCRIPTS = [
  "skills/scoping-the-simplest-core/scripts/check_citations.mjs",
  "skills/running-an-iteration/scripts/check_citations.mjs",
] as const;
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

describe.each(SCRIPTS)("%s", (script) => {
  it("preserves valid single-file and directory requirements inputs", () => {
    const roadmap = join(FIXTURES, "roadmap.example.md");
    for (const requirements of [
      join(FIXTURES, "requirements-index.example.md"),
      join(FIXTURES, "requirements-dir.example"),
    ]) {
      const result = runHelper(script, [roadmap, requirements]);
      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toBe("OK: all 1 cited stories exist in requirements\n");
    }
  });

  it("uses every Unicode-decimal citation with set semantics and sorted missing errors", () => {
    const root = tempDir("citations-unicode-");
    const mathematicalZero = "\u{1d7ce}";
    const fullwidthZero = "\uff10";
    const roadmap = write(
      root,
      "roadmap.md",
      `prose STORY-${mathematicalZero} and STORY-${fullwidthZero} and STORY-${fullwidthZero}\n`,
    );
    const requirements = write(root, "requirements.md", "# No story headings\n");

    const result = runHelper(script, [roadmap, requirements]);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(
      `error: STORY-${fullwidthZero} cited in roadmap but not found in requirements\n` +
        `error: STORY-${mathematicalZero} cited in roadmap but not found in requirements\n`,
    );
  });

  it("defines stories only from top-level markdown H2 headings", () => {
    const root = tempDir("citation-definitions-");
    const requirements = join(root, "requirements");
    mkdirSync(join(requirements, "nested"), { recursive: true });
    write(requirements, "notes.md", "prefix STORY-9999\n## STORY-١ trailing text\n");
    write(requirements, "ignored.txt", "## STORY-0002\n");
    write(join(requirements, "nested"), "nested.md", "## STORY-0003\n");
    const roadmap = write(root, "roadmap.md", "STORY-١ STORY-0002 STORY-0003 STORY-9999\n");

    const result = runHelper(script, [roadmap, requirements]);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(
      "error: STORY-0002 cited in roadmap but not found in requirements\n" +
        "error: STORY-0003 cited in roadmap but not found in requirements\n" +
        "error: STORY-9999 cited in roadmap but not found in requirements\n",
    );
  });

  it("normalizes CRLF and bare CR before parsing citation files", () => {
    const root = tempDir("citation-newlines-");
    const roadmap = write(root, "roadmap.md", "# Roadmap\rSTORY-0001\r\nSTORY-0002\r");
    const requirements = write(
      root,
      "requirements.md",
      "# Requirements\r## STORY-0001\r\n## STORY-0002\r",
    );

    const result = runHelper(script, [roadmap, requirements]);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toBe("OK: all 2 cited stories exist in requirements\n");
  });

  it.each(["\u2028", "\u2029"])(
    "does not treat Unicode separator %j as a story-heading line boundary",
    (separator) => {
      const root = tempDir("citation-unicode-separator-");
      const roadmap = write(root, "roadmap.md", "STORY-0001\n");
      const requirements = write(
        root,
        "requirements.md",
        `# Requirements${separator}## STORY-0001\n`,
      );

      const result = runHelper(script, [roadmap, requirements]);

      expect(result.status).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe(
        "error: STORY-0001 cited in roadmap but not found in requirements\n",
      );
    },
  );

  it("preserves exact invocation and normalized missing-path diagnostics", () => {
    const usage = runHelper(script, []);
    expect(usage.status).toBe(2);
    expect(usage.stdout).toBe("");
    expect(usage.stderr).toBe(
      "usage: check_citations.mjs <roadmap.md> <requirements-dir-or-file>\n",
    );

    const root = tempDir("citation-errors-");
    const missingRoadmap = runHelper(script, ["./missing.md", "./missing-requirements"], root);
    expect(missingRoadmap.status).toBe(2);
    expect(missingRoadmap.stdout).toBe("");
    expect(missingRoadmap.stderr).toBe("error: file not found: missing.md\n");

    write(root, "roadmap.md", "STORY-0001\n");
    const missingRequirements = runHelper(script, ["./roadmap.md", "./missing-requirements"], root);
    expect(missingRequirements.status).toBe(2);
    expect(missingRequirements.stdout).toBe("");
    expect(missingRequirements.stderr).toBe("error: not found: missing-requirements\n");
  });

  it("runs validation when invoked through a symbolic link", () => {
    const root = tempDir("citation-symlink-");
    const link = join(root, "check-citations.mjs");
    symlinkSync(join(CORE, script), link);

    const result = spawnSync(
      process.execPath,
      [link, join(FIXTURES, "roadmap.example.md"), join(FIXTURES, "requirements-index.example.md")],
      { encoding: "utf8" },
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toBe("OK: all 1 cited stories exist in requirements\n");
  });
});
