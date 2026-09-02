import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";

// Why this lives in packages/core rather than at the repo root: there is no
// root-level test package, and this suite already reaches the repo root (the
// tiering assertions in metadata.test.ts read ../../plugins/). The subject is
// repo-wide, not core-specific.
//
// Why it exists at all: on 2026-08-31 a script entry parsed as a MAP rather
// than a string, because an unquoted plain scalar containing ": " (colon-space)
// makes everything before the colon a key. GitHub Actions requires every step's
// `run:` and `uses:` to be a string; a map there fails workflow parsing before
// any step runs, taking every job in the file down with it. That original
// mistake was caught by adversarial review of a GitLab pipeline; this test is
// the mechanical replacement for that review having happened to look.
//
// Ported from `.gitlab-ci.yml` to `.github/workflows/*.yml` in Sept 2026 when
// the repo moved off GitLab.

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..");
const WORKFLOWS_DIR = join(ROOT, ".github", "workflows");

type Step = Record<string, unknown>;
type Job = { steps?: unknown[]; [k: string]: unknown };
type Workflow = { jobs?: Record<string, Job>; [k: string]: unknown };

function workflows(): Array<[string, Workflow]> {
  return readdirSync(WORKFLOWS_DIR)
    .filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"))
    .map((f) => [f, parseYaml(readFileSync(join(WORKFLOWS_DIR, f), "utf8")) as Workflow]);
}

describe(".github/workflows/*.yml is a valid workflow set", () => {
  it("every workflow parses as YAML at all", () => {
    for (const [name, wf] of workflows()) {
      expect(typeof wf, `${name} did not parse to an object`).toBe("object");
      expect(wf, `${name} parsed to null`).not.toBeNull();
    }
  });

  it("every step's `run` and `uses` is a string, never a map", () => {
    const offenders: string[] = [];
    for (const [file, wf] of workflows()) {
      for (const [jobName, job] of Object.entries(wf.jobs ?? {})) {
        const steps = (job.steps ?? []) as Step[];
        steps.forEach((step, i) => {
          for (const key of ["run", "uses"] as const) {
            const value = step[key];
            if (value === undefined) continue;
            if (typeof value === "string") continue;
            // Name the parsed key, because that is what identifies the offending
            // colon: YAML made everything left of ": " into a map key.
            const shape =
              value !== null && typeof value === "object"
                ? `map with key ${JSON.stringify(Object.keys(value as object)[0])}`
                : typeof value;
            offenders.push(`${file}: jobs.${jobName}.steps[${i}].${key} parsed as ${shape}`);
          }
        });
      }
    }
    expect(
      offenders,
      "a non-string `run:` or `uses:` fails GitHub Actions workflow parsing for the WHOLE file, " +
        'not just its job. Almost always an unquoted scalar containing ": " — wrap it in double ' +
        "quotes. Offenders:\n  " +
        offenders.join("\n  "),
    ).toEqual([]);
  });

  it("the workflow set declares every job the repo's gates depend on", () => {
    const allJobs = new Set<string>();
    for (const [, wf] of workflows()) {
      for (const jobName of Object.keys(wf.jobs ?? {})) {
        allJobs.add(jobName);
      }
    }
    // A guard against a job being deleted rather than fixed when it goes red.
    for (const required of ["lint", "typecheck", "test", "build", "plugins"]) {
      expect(allJobs, `no workflow declares a \`${required}\` job`).toContain(required);
    }
  });
});
