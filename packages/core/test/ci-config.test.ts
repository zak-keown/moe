import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";

// Why this lives in packages/core rather than at the repo root: there is no
// root-level test package, and this suite already reaches the repo root (the
// tiering assertions in metadata.test.ts read ../../plugins/). The subject is
// repo-wide, not core-specific.
//
// Why it exists at all: on 2026-08-31 the `provenance` job shipped a script
// entry that YAML parsed as a MAP rather than a string, because an unquoted
// plain scalar containing ": " (colon-space) makes everything before the colon a
// key. GitLab requires every `script` entry to be a string; a map there is a
// job-config error that fails pipeline CREATION — so it did not merely skip the
// provenance job, it would have blocked lint, typecheck, test, build, plugins,
// tab and proof as well.
//
// It reached a merge candidate with every local gate green, because no local
// gate parsed this file. An adversarial review caught it. This test is the
// mechanical replacement for that review having happened to look.

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..");
const CI_PATH = join(ROOT, ".gitlab-ci.yml");

/** GitLab's script-bearing keys. Each takes a string or a list of strings. */
const SCRIPT_KEYS = ["script", "before_script", "after_script"] as const;

type Job = Record<string, unknown>;

function jobs(): Array<[string, Job]> {
  const parsed = parseYaml(readFileSync(CI_PATH, "utf8")) as Record<string, unknown>;
  return Object.entries(parsed).filter(
    (entry): entry is [string, Job] =>
      typeof entry[1] === "object" && entry[1] !== null && !Array.isArray(entry[1]),
  );
}

describe(".gitlab-ci.yml is a valid pipeline definition", () => {
  it("parses as YAML at all", () => {
    expect(() => parseYaml(readFileSync(CI_PATH, "utf8"))).not.toThrow();
  });

  it("every script entry is a string, never a map", () => {
    const offenders: string[] = [];
    for (const [name, job] of jobs()) {
      for (const key of SCRIPT_KEYS) {
        const value = job[key];
        if (value === undefined) continue;
        const entries = Array.isArray(value) ? value : [value];
        entries.forEach((entry, i) => {
          if (typeof entry === "string") return;
          // Name the parsed key, because that is what identifies the offending
          // colon: YAML made everything left of ": " into a map key.
          const shape =
            entry !== null && typeof entry === "object"
              ? `map with key ${JSON.stringify(Object.keys(entry as object)[0])}`
              : typeof entry;
          offenders.push(`${name}.${key}[${i}] parsed as ${shape}`);
        });
      }
    }
    expect(
      offenders,
      `a non-string script entry fails GitLab pipeline creation for the WHOLE file, not just its job. ` +
        `Almost always an unquoted scalar containing ": " — wrap the entry in double quotes. Offenders:\n  ` +
        offenders.join("\n  "),
    ).toEqual([]);
  });

  it("declares at least the jobs the repo's gates depend on", () => {
    const names = new Set(jobs().map(([n]) => n));
    // A guard against a job being deleted rather than fixed when it goes red.
    for (const required of ["lint", "typecheck", "test", "build", "plugins"]) {
      expect(names, `.gitlab-ci.yml lost its ${required} job`).toContain(required);
    }
  });

  it("scopes proof's pytest discovery to the proof package", () => {
    const proof = jobs().find(([name]) => name === "proof")?.[1];
    expect(proof, "missing proof job").toBeDefined();
    expect(proof?.script).toEqual(["uv run --project py/proof pytest py/proof/tests"]);
  });

  it("runs only the TC convention drift job in scheduled pipelines", () => {
    const byName = new Map(jobs());
    const inheritedExclusions = [
      "install",
      "lint",
      "typecheck",
      "test",
      "build",
      "plugins",
      "provenance",
      "tc-drift-manifest",
    ];
    for (const name of inheritedExclusions) {
      expect(byName.get(name)?.extends, `${name} must inherit the schedule exclusion`).toBe(
        ".not-scheduled",
      );
    }

    const explicitExclusions = [
      "bin",
      "tab",
      "proof",
      "tab-native-linux",
      "tc-release-pack",
      "tc-release-publish",
    ];
    for (const name of explicitExclusions) {
      const firstRule = (byName.get(name)?.rules as Job[] | undefined)?.[0];
      expect(firstRule?.if, `${name} must check schedule before any other rule`).toBe(
        '$CI_PIPELINE_SOURCE == "schedule"',
      );
      expect(firstRule?.when, `${name} must skip schedules`).toBe("never");
    }

    const driftRules = byName.get("tc-conventions-drift")?.rules as Job[] | undefined;
    expect(driftRules).toEqual([{ if: '$CI_PIPELINE_SOURCE == "schedule"' }]);
  });
});
