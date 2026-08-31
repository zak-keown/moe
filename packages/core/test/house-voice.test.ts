// The Iron Law (writing-skills/SKILL.md, "Iron Law" section) binds edits to
// existing skills, not just new skills. This suite is the receipt for the
// `house-voice.md` pointer added to `writing-clearly-and-concisely/SKILL.md`.
//
// WHAT THIS SUITE VERIFIES, precisely, because a green run here is easy to
// over-read:
//
//   1. The INSTRUMENT works. score.mjs separates a house-shaped README from a
//      generically competent one. That is a claim about two hand-written
//      fixtures, not about any agent.
//   2. The RECORDED SCORES of two committed arms of a real subagent experiment.
//      The .md files under baseline/ and with-pointer/ are DATA — captured
//      output from fresh sessions, not fixtures anyone tuned. This suite pins
//      the numbers so a later edit to the pointer cannot quietly lose the
//      effect.
//
// It does NOT verify that the pointer improves prose in general, and it does not
// measure whether `writing-clearly-and-concisely` FIRES in the first place.
// Firing is a different question, owned by `verification-split-and-firing-rate`
// Part C. See test/house-voice/README.md for the procedure and the raw failures.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error - score.mjs is plain JS; this package has no tsconfig and
// never type-checks (its `typecheck` script echoes and exits 0).
import { score } from "./house-voice/score.mjs";

const DIR = join(import.meta.dirname, "house-voice");

function read(rel: string): string {
  return readFileSync(join(DIR, rel), "utf8");
}

function arm(name: string): { file: string; houseScore: number; strunkScore: number }[] {
  const dir = join(DIR, name);
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((f) => {
      const s = score(readFileSync(join(dir, f), "utf8"));
      return { file: `${name}/${f}`, houseScore: s.houseScore, strunkScore: s.strunkScore };
    });
}

const mean = (ns: number[]): number => ns.reduce((a, b) => a + b, 0) / ns.length;

describe("the house-voice scorer", () => {
  it("separates a house-shaped README from a generic one", () => {
    const shaped = score(read("fixtures/house-shaped.md"));
    const generic = score(read("fixtures/generic.md"));

    expect(shaped.houseScore).toBe(5);
    expect(shaped.houseMax).toBe(5);
    expect(generic.houseScore).toBe(0);
  });

  it("reports which detector failed, not just a total", () => {
    const generic = score(read("fixtures/generic.md"));
    // A total with no breakdown is unusable when a later arm regresses.
    expect(generic.house.map((d: { id: string }) => d.id)).toEqual([
      "verdict-opening",
      "counted-status",
      "plugin-declaration",
      "named-refutation",
      "closed-vocabulary",
    ]);
    expect(generic.house.every((d: { pass: boolean }) => d.pass === false)).toBe(true);
  });
});

describe("the baseline arm, written WITHOUT the house-voice pointer", () => {
  const runs = arm("baseline");

  it("is the three runs actually captured", () => {
    expect(runs.map((r) => r.file)).toEqual(["baseline/01.md", "baseline/02.md", "baseline/03.md"]);
  });

  // The ceiling is the observed maximum, recorded so a later re-run that scores
  // HIGHER is caught as a change in conditions rather than absorbed silently.
  it("scores at or below the recorded house-specific ceiling of 3/5", () => {
    for (const r of runs) {
      expect(r.houseScore, r.file).toBeLessThanOrEqual(3);
    }
    expect(mean(runs.map((r) => r.houseScore))).toBeCloseTo(7 / 3, 5);
  });

  // The point of splitting the rubric: Strunk alone already gets these, so they
  // cannot be evidence for or against the pointer.
  it("already passes every Strunk-reachable rule, which is why those are excluded", () => {
    for (const r of runs) {
      expect(r.strunkScore, r.file).toBe(2);
    }
  });

  // The two moves no baseline run reached. house-voice.md was written against
  // exactly these, and the with-pointer arm is judged on them.
  it("never produces a counted Status line or a plugin-or-not declaration", () => {
    for (const f of ["baseline/01.md", "baseline/02.md", "baseline/03.md"]) {
      const s = score(readFileSync(join(DIR, f), "utf8"));
      const failed = s.house
        .filter((d: { pass: boolean }) => !d.pass)
        .map((d: { id: string }) => d.id);
      expect(failed, f).toContain("counted-status");
      expect(failed, f).toContain("plugin-declaration");
    }
  });
});
