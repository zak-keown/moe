import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

type TranscriptRow = {
  type?: unknown;
  message?: {
    role?: unknown;
    content?: unknown;
  };
};

type Scenario = {
  expected_decision: boolean;
  transcript: TranscriptRow[];
};

const SCENARIOS = join(import.meta.dirname, "latte", "scenarios");
const scenarioFiles = () =>
  readdirSync(SCENARIOS)
    .filter((name) => name.endsWith(".json"))
    .sort();
const readScenario = (file: string) =>
  JSON.parse(readFileSync(join(SCENARIOS, file), "utf8")) as Scenario;
const textBlocks = (scenario: Scenario) =>
  scenario.transcript.flatMap((row) => {
    if (!Array.isArray(row.message?.content)) return [];
    return row.message.content.flatMap((item) => {
      if (!item || typeof item !== "object" || !("text" in item)) return [];
      return typeof item.text === "string" ? [item.text] : [];
    });
  });

describe("Latte scenario corpus", () => {
  test("uses the production Claude transcript envelope", () => {
    const files = scenarioFiles();

    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const scenario = readScenario(file);
      expect(Array.isArray(scenario.transcript), file).toBe(true);

      for (const [index, row] of scenario.transcript.entries()) {
        const label = `${file} transcript[${index}]`;
        expect(["user", "assistant"], label).toContain(row.type);
        expect(row.message?.role, label).toBe(row.type);
        expect(Array.isArray(row.message?.content), label).toBe(true);
        expect(row.message?.content, label).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              type: "text",
              text: expect.any(String),
            }),
          ]),
        );
      }
    }
  });

  test("does not leak labels through fabricated summary prefixes or question marks", () => {
    const scenarios = scenarioFiles().map(readScenario);
    const labelsWithQuestions = new Set<boolean>();
    const labelsWithoutQuestions = new Set<boolean>();

    for (const scenario of scenarios) {
      const texts = textBlocks(scenario);
      for (const text of texts) {
        expect(text).not.toMatch(/^\[[^\]\n]+\]/);
      }
      const labels = texts.some((text) => text.includes("?"))
        ? labelsWithQuestions
        : labelsWithoutQuestions;
      labels.add(scenario.expected_decision);
    }

    expect(labelsWithQuestions).toEqual(new Set([false, true]));
    expect(labelsWithoutQuestions).toEqual(new Set([false, true]));
  });
});
