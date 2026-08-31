/**
 * The half of the moe-tab boundary that exercises the REAL native library:
 * `estimateTrajectory` calls `estimatePath`, which dlopens
 * `packages/tab/target/{release,debug}/libmoe_tab_ffi.*`.
 *
 * Its own vitest project (`pnpm test:ffi`), for the same reason
 * `packages/tab/bindings/typescript` splits: the cdylib only exists after
 * `pnpm tab:build`, and CI's node:24 image has no cargo. Folding these into
 * `pnpm test` would let the default suite claim it verified a seam it never
 * loaded.
 *
 * These also make the suite non-hermetic against the bundled price sheet —
 * they assert `est_cost_usd > 0` for `claude-opus-4-8` — which is what
 * `MOE_TAB_PRICING_DIR` exists to fix. See the flight README's follow-ups.
 */

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CostEstimate, ModelCost } from "@bubstack/moe-tab";
import { expect, test } from "vitest";
import type { AtifTrajectory } from "../../src/lab/atif/types.js";
import { estimateTrajectory } from "../../src/lab/tab/index.js";

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

function _est(over: Partial<CostEstimate> = {}): CostEstimate {
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

// ── estimateTrajectory: price an ATIF trajectory.json via obol's "atif"
//    dialect. These exercise the REAL obol native lib (atif dialect), so the
//    pricing math is obol's, not a quorum re-parser. ──────────────────────────

function writeTrajectory(traj: AtifTrajectory): string {
  const dir = mkdtempSync(join(tmpdir(), "atif-traj-"));
  const f = join(dir, "trajectory.json");
  writeFileSync(f, `${JSON.stringify(traj, null, 2)}\n`);
  return f;
}

test("estimateTrajectory prices a known model from per-step token buckets", async () => {
  const f = writeTrajectory({
    schema_version: "ATIF-v1.7",
    agent: {
      name: "claude",
      version: "unknown",
      model_name: "claude-opus-4-8",
    },
    steps: [
      {
        step_id: 1,
        source: "agent",
        model_name: "claude-opus-4-8",
        metrics: {
          prompt_tokens: 100,
          completion_tokens: 20,
          cached_tokens: 3,
        },
      },
    ],
  });
  const usage = await estimateTrajectory(f);
  expect(usage).not.toBeNull();
  const u = usage as NonNullable<typeof usage>;
  // disjoint buckets: prompt->input, completion->output, cached->cache_read.
  expect(u.total_input).toBe(100);
  expect(u.total_output).toBe(20);
  expect(u.total_cache_read).toBe(3);
  expect(u.total_tokens).toBe(123);
  expect(u.model).toBe("claude-opus-4-8");
  // obol has a rate for this model -> priced (a real positive number).
  expect(u.est_cost_usd).not.toBeNull();
  expect((u.est_cost_usd as number) > 0).toBe(true);
  expect(u.unpriced_models).toEqual([]);
});

test("estimateTrajectory honors an embedded cost_usd instead of re-pricing", async () => {
  // opencode/pi log a per-message cost; the atif dialect must use it verbatim.
  const f = writeTrajectory({
    schema_version: "ATIF-v1.7",
    agent: { name: "opencode", version: "unknown", model_name: "some-model" },
    steps: [
      {
        step_id: 1,
        source: "agent",
        model_name: "some-model",
        metrics: {
          prompt_tokens: 100,
          completion_tokens: 20,
          cached_tokens: 3,
          cost_usd: 0.42,
        },
      },
    ],
  });
  const usage = await estimateTrajectory(f);
  const u = usage as NonNullable<typeof usage>;
  expect(u.est_cost_usd).toBe(0.42);
  expect(u.total_tokens).toBe(123);
});

test("estimateTrajectory marks an unknown model unpriced (null cost, tokens kept)", async () => {
  const f = writeTrajectory({
    schema_version: "ATIF-v1.7",
    agent: {
      name: "gemini",
      version: "unknown",
      model_name: "totally-unknown-model-xyz",
    },
    steps: [
      {
        step_id: 1,
        source: "agent",
        model_name: "totally-unknown-model-xyz",
        metrics: { prompt_tokens: 50, completion_tokens: 10, cached_tokens: 0 },
      },
    ],
  });
  const usage = await estimateTrajectory(f);
  const u = usage as NonNullable<typeof usage>;
  expect(u.total_tokens).toBe(60);
  expect(u.est_cost_usd).toBeNull();
  expect(u.unpriced_models).toEqual(["totally-unknown-model-xyz"]);
  expect(u.models["totally-unknown-model-xyz"]?.est_cost_usd).toBeNull();
});

test("estimateTrajectory returns null for a no-usage (antigravity) trajectory", async () => {
  const f = writeTrajectory({
    schema_version: "ATIF-v1.7",
    agent: { name: "antigravity", version: "unknown" },
    steps: [{ step_id: 1, source: "agent" }],
  });
  expect(await estimateTrajectory(f)).toBeNull();
});

test("estimateTrajectory returns null when the trajectory file is absent", async () => {
  const dir = mkdtempSync(join(tmpdir(), "atif-missing-"));
  expect(await estimateTrajectory(join(dir, "trajectory.json"))).toBeNull();
});

test("bundled obol prices the Bedrock/Mantle model ids we pin (regression guard)", async () => {
  // The Claude coding-agent + the Sonnet 5 grader log these bare native ids on
  // Mantle (docs/experiments/2026-07-08-bedrock-mantle-probe.md). obol must price
  // all three or the cost-motivated Bedrock work goes dark. claude-sonnet-5 was
  // added in the 2026-07-09 bundle refresh (obol 0.7.0); this fails on an obol
  // whose snapshot drops it.
  for (const model of ["claude-opus-4-8", "claude-sonnet-5", "claude-haiku-4-5-20251001"]) {
    const f = writeTrajectory({
      schema_version: "ATIF-v1.7",
      agent: { name: "claude", version: "unknown", model_name: model },
      steps: [
        {
          step_id: 1,
          source: "agent",
          model_name: model,
          metrics: {
            prompt_tokens: 1000,
            completion_tokens: 500,
            cached_tokens: 200,
          },
        },
      ],
    });
    const usage = await estimateTrajectory(f);
    const u = usage as NonNullable<typeof usage>;
    expect(u.unpriced_models).toEqual([]);
    expect(u.est_cost_usd).not.toBeNull();
    expect((u.est_cost_usd as number) > 0).toBe(true);
  }
});
