import { describe, expect, test } from "vitest";
import { isValidCardId } from "../src/lib/cardId";

describe("isValidCardId", () => {
  test("accepts letters, digits, and hyphens", () => {
    expect(isValidCardId("login-001")).toBe(true);
    expect(isValidCardId("sign-up-flow")).toBe(true);
  });

  test("rejects spaces — would break makeRunId/parseRunId's round-trip", () => {
    expect(isValidCardId("user auth")).toBe(false);
  });

  test("rejects underscores — the runId separator, must not appear in cardId", () => {
    expect(isValidCardId("sign_up-flow")).toBe(false);
  });

  test("rejects slashes and dots", () => {
    expect(isValidCardId("a/b")).toBe(false);
    expect(isValidCardId("a.b")).toBe(false);
  });

  test("rejects empty string", () => {
    expect(isValidCardId("")).toBe(false);
  });
});
