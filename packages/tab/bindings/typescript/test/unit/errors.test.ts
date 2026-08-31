// TabError is the binding's only public class and the thing every consumer
// branches on. Upstream tested it only through the FFI suite, which needs the
// cdylib; these checks need nothing.
import { expect, test } from "vitest";
import { TabError } from "../../src/types.js";

test("TabError carries the FFI envelope's code and kind", () => {
  const e = new TabError(1, "PricingTablesMissing", "no snapshot at /x");
  expect(e.code).toBe(1);
  expect(e.kind).toBe("PricingTablesMissing");
  expect(e.name).toBe("TabError");
  expect(e).toBeInstanceOf(Error);
});

test("TabError's message names the fork, not the upstream project", () => {
  const e = new TabError(7, "InvalidArgument", "as_of is not a date");
  expect(e.message).toBe("moe-tab: InvalidArgument (code 7): as_of is not a date");
  expect(e.message).not.toContain("obol");
});
