import { describe, expect, test } from "vitest";
import { errorKey } from "../src/components/AppShell";
import type { ErrorEntry } from "../src/lib/api";

describe("errorKey", () => {
  test("is unique for two errors from the same source in the same millisecond", () => {
    // A burst of near-simultaneous failures, all logged via source: "run",
    // stamped with the same millisecond timestamp — exactly the scenario
    // the Error Log panel exists to surface reliably.
    const a: ErrorEntry = { timestamp: "2026-01-01T00:00:00.000Z", source: "run", message: "a" };
    const b: ErrorEntry = { timestamp: "2026-01-01T00:00:00.000Z", source: "run", message: "b" };

    expect(errorKey(a, 0)).not.toBe(errorKey(b, 1));
  });

  test("stays stable for the same entry at the same index", () => {
    const a: ErrorEntry = { timestamp: "2026-01-01T00:00:00.000Z", source: "run", message: "a" };
    expect(errorKey(a, 0)).toBe(errorKey(a, 0));
  });
});
