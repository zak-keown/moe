import { join } from "path";
import { describe, expect, test } from "vitest";
import { validateScenario } from "../../../src/qa/cli/validate.js";

const fixtureDir = join(__dirname, "../fixtures");

describe("validateScenario", () => {
  test("valid story card passes", () => {
    const result = validateScenario(join(fixtureDir, "story-001-add-todo.md"));
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test("missing id fails", () => {
    const result = validateScenario(join(fixtureDir, "invalid-no-id.md"));
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("id");
  });

  test("nonexistent file fails", () => {
    const result = validateScenario(join(fixtureDir, "does-not-exist.md"));
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
  });
});
