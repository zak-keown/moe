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

const SCENARIOS = join(import.meta.dirname, "latte", "scenarios");

describe("Latte scenario corpus", () => {
  test("uses the production Claude transcript envelope", () => {
    const files = readdirSync(SCENARIOS)
      .filter((name) => name.endsWith(".json"))
      .sort();

    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const scenario = JSON.parse(readFileSync(join(SCENARIOS, file), "utf8")) as {
        transcript?: TranscriptRow[];
      };
      expect(Array.isArray(scenario.transcript), file).toBe(true);

      for (const [index, row] of (scenario.transcript ?? []).entries()) {
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
});
