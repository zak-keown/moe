import { describe, expect, test } from "vitest";
import { CARD_STATUSES, statusColorClass } from "../src/lib/cardStatus";

describe("CARD_STATUSES", () => {
  test("matches the five values CardEditor's status <select> offers", () => {
    // CardEditor.tsx's <select id="card-status"> lists exactly these five
    // <option>s. CardsList's filter and StatusBadge's color map both need
    // to cover the same set or a card assigned one of them becomes
    // unfilterable / visually indistinguishable from another status.
    expect(CARD_STATUSES).toEqual(["draft", "ready", "running", "passed", "failed"]);
  });
});

describe("statusColorClass", () => {
  test("gives running/passed/failed a distinct color from the undifferentiated default", () => {
    const defaultColor = statusColorClass("some-unknown-status");
    for (const status of ["running", "passed", "failed"]) {
      expect(statusColorClass(status)).not.toBe(defaultColor);
    }
  });

  test("still resolves the run-verdict vocabulary (pass/fail/investigate/errored/cancelled)", () => {
    expect(statusColorClass("pass")).toBe("bg-green-100 text-green-800");
    expect(statusColorClass("fail")).toBe("bg-red-100 text-red-800");
  });

  test("still resolves draft/ready", () => {
    expect(statusColorClass("draft")).toBe("bg-panel text-slate");
    expect(statusColorClass("ready")).toBe("bg-teal-wash text-teal-dark");
  });
});
