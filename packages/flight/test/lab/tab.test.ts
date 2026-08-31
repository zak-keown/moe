/**
 * The pure half of the `@bubstack/moe-flight` -> `@bubstack/moe-tab` boundary:
 * `mergeEstimates`, which is arithmetic over `CostEstimate` values and touches
 * no native code.
 *
 * The fully-typed fixtures are the point. Upstream's comment says it: "any
 * drift from obol's real CostEstimate shape is a typecheck failure". That is
 * exactly what caught moe-tab's added `pricing_source` field on this import.
 *
 * The suites that dlopen the cdylib live in tab-ffi.test.ts.
 */

import type { CostEstimate, ModelCost } from "@bubstack/moe-tab";
import { expect, test } from "vitest";
import { mergeEstimates } from "../../src/lab/tab/index.js";

// Typed CostEstimate fixtures (standard bans `as never`). The factory takes a
// typed partial override and merges it over a fully-typed baseline, so any
// drift from obol's real `CostEstimate` shape is a typecheck failure.
function modelCost(over: Partial<ModelCost> = {}): ModelCost {
  return {
    model: "claude-opus-4-8",
    provider: "anthropic",
    subtotal_usd: 0.5,
    tokens: { input: 100, output: 20, cache_write: 5, cache_read: 3 },
    ...over,
  };
}

function est(over: Partial<CostEstimate> = {}): CostEstimate {
  const perModel = over.per_model ?? [modelCost()];
  return {
    total_usd: 0.5,
    pricing_as_of: "2026-06-09",
    // `pricing_source` is moe-tab's addition: the Rust core always serialized
    // it, upstream's TS interface never declared it, and it is REQUIRED here.
    // It is the one wire-shape change across the obol -> moe-tab boundary, and
    // omitting it is a typecheck failure — which is the whole point of building
    // these fixtures fully typed rather than with `as never`.
    pricing_source: "bundled",
    unpriced_models: [],
    approximations: [],
    tokens: { input: 100, output: 20, cache_write: 5, cache_read: 3 },
    ...over,
    per_model: perModel,
  };
}

test("sums tokens, maps cache_write->total_cache_create, rounds cost", () => {
  const merged = mergeEstimates([est(), est()]);
  expect(merged).not.toBeNull();
  const m = merged as NonNullable<typeof merged>;
  expect(m.total_input).toBe(200);
  expect(m.total_cache_create).toBe(10);
  expect(m.total_output).toBe(40);
  expect(m.total_tokens).toBe(200 + 10 + 6 + 40);
  expect(m.est_cost_usd).toBe(1);
  expect(m.model).toBe("claude-opus-4-8");
  expect(m.pricing_as_of).toBe("2026-06-09");
});

test("returns null when total_tokens is 0", () => {
  const zero = est({ per_model: [] });
  expect(mergeEstimates([zero])).toBeNull();
});

test("est_cost_usd is null when every model is unpriced", () => {
  const merged = mergeEstimates([est({ unpriced_models: ["claude-opus-4-8"] })]);
  const m = merged as NonNullable<typeof merged>;
  expect(m.est_cost_usd).toBeNull();
  expect(m.unpriced_models).toEqual(["claude-opus-4-8"]);
  expect(m.models["claude-opus-4-8"]?.est_cost_usd).toBeNull();
});

test("keeps the first TRUTHY pricing_as_of (empty string from earlier est is skipped)", () => {
  // Parity with Python `pricing_as_of = pricing_as_of or est.pricing_as_of`:
  // an empty-string pricing_as_of from the first estimate must NOT win over a
  // later real date. (`??` would have kept the '' since it is non-null.)
  const merged = mergeEstimates([est({ pricing_as_of: "" }), est({ pricing_as_of: "2026-06-09" })]);
  const m = merged as NonNullable<typeof merged>;
  expect(m.pricing_as_of).toBe("2026-06-09");
});

test("dedupes approximations by (kind, detail) tuple; undefined detail -> null", () => {
  const a = est({ approximations: [{ kind: "rounded", detail: "x" }] });
  const b = est({ approximations: [{ kind: "rounded", detail: "x" }] });
  const c = est({ approximations: [{ kind: "rounded" }] });
  const merged = mergeEstimates([a, b, c]);
  const m = merged as NonNullable<typeof merged>;
  expect(m.approximations).toEqual([
    { kind: "rounded", detail: "x" },
    { kind: "rounded", detail: null },
  ]);
});
