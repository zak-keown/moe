import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { estimateUsageSidecar } from "../../src/lab/tab/index.js";
import { EvidenceLogger, USAGE_ROW_TYPE } from "../../src/qa/evidence/logger.js";
import { asCardId, asRunId } from "../../src/qa/util/brands.js";

/**
 * The one test that closes the `moe-flight -> moe-tab` loop: flight WRITES a
 * `usage.jsonl` row, and moe-tab PRICES that exact file through its `tab`
 * dialect over the C ABI.
 *
 * Neither upstream repo had this. gauntlet emitted the row and never read it
 * back; quorum read a sidecar it never produced; and obol was consumed from npm,
 * so a producer/consumer disagreement could only surface in a live eval. It is
 * the most valuable assertion available at this boundary because BOTH sides fail
 * silently:
 *
 *   - moe-tab's `tab::parse` SKIPS rows whose `type` it does not claim
 *     (`ROW_TYPE = "moe.tab.usage"`) rather than erroring, so a
 *     wrong producer string reads as "no usage" — cost zero, no warning.
 *   - `estimateUsageSidecar` catches `TabError` and returns null, so a rejected
 *     dialect ALSO reads as "no usage". The rebrand nearly shipped
 *     `"moe-tab.usage"` (hyphen), which would have hit both at once.
 *
 * FFI-gated: this dlopens the cdylib. `pnpm test:ffi`, after `pnpm tab:build`.
 */
describe("usage.jsonl producer/consumer contract", () => {
  test("the row type flight writes is one moe-tab's tab dialect claims", () => {
    // Not a tautology: this is the literal from
    // packages/tab/crates/moe-tab-core/src/transcript/tab.rs ROW_TYPE.
    expect(USAGE_ROW_TYPE).toBe("moe.tab.usage");
  });

  test("moe-tab prices a sidecar flight actually produced", async () => {
    const outDir = mkdtempSync(join(tmpdir(), "moe-flight-usage-"));
    const logger = new EvidenceLogger(outDir);
    // provider/model are stamped onto every row from run-start, not passed per
    // call — moe-tab needs both to look up a rate.
    logger.logRunStart({
      // src/qa/util/brands.ts brands these; a test fixture is not one of its
      // four sanctioned `as*` boundaries, so it goes through the constructors.
      runId: asRunId("r"),
      cardId: asCardId("card-001"),
      provider: "anthropic",
      model: "claude-opus-4-8",
      target: undefined,
      adapter: "tui",
      budgetMs: 1,
      reflectionInterval: 0,
      toolTimeoutMs: 1,
      contextTreeBytes: 0,
    });
    logger.logUsageRow({
      input_tokens: 12,
      cache_read_input_tokens: 120,
      cache_creation_input_tokens: 60,
      output_tokens: 9,
    });

    const sidecar = join(outDir, "usage.jsonl");
    const written = readFileSync(sidecar, "utf8").trim().split("\n");
    expect(written).toHaveLength(1);
    expect(JSON.parse(written[0] ?? "{}")).toMatchObject({ type: "moe.tab.usage" });

    const priced = await estimateUsageSidecar(sidecar);
    // A null here means one of the two silent paths fired.
    expect(priced).not.toBeNull();
    const p = priced as NonNullable<typeof priced>;
    expect(p.total_input).toBe(12);
    expect(p.total_cache_read).toBe(120);
    expect(p.total_cache_create).toBe(60);
    expect(p.total_output).toBe(9);
    expect(p.est_cost_usd).toBeGreaterThan(0);
    expect(p.unpriced_models).toEqual([]);
  });
});
