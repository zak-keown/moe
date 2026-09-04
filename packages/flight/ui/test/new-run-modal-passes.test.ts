import { describe, expect, test } from "vitest";
import { parsePasses } from "../src/components/NewRunModal";

describe("parsePasses", () => {
  test("parses exponent notation instead of truncating at the first non-digit", () => {
    // Number.parseInt("1e2", 10) stops at "e" and returns 1 — a user
    // typing "1e2" meaning "100 passes" would silently get 1 pass.
    expect(parsePasses("1e2")).toBe(100);
  });

  test("parses plain integers", () => {
    expect(parsePasses("10")).toBe(10);
  });

  test("rejects non-numeric input", () => {
    expect(parsePasses("abc")).toBeNull();
  });

  test("rejects blank input", () => {
    expect(parsePasses("")).toBeNull();
    expect(parsePasses("   ")).toBeNull();
  });
});
