/**
 * The `@bubstack/moe-flight` -> `@bubstack/moe-tab` boundary: turn a priced
 * transcript into the run's `TokenUsage` block.
 *
 * This is ARCHITECTURE.md §5's one confirmed edge, and the reason the monorepo
 * exists — upstream it was `@primeradianthq/obol@^0.9.0` off npm, so changing a
 * cost model meant publish-then-test. It is now `workspace:*`.
 *
 * Three things changed at the boundary, and only the first is cosmetic:
 *   - `ObolError`            -> `TabError`
 *   - `estimatePath(p,'obol')` -> `estimatePath(p,'tab')`  (see below)
 *   - `CostEstimate` gained a REQUIRED `pricing_source: "bundled" | "local"`.
 *     moe-tab added it deliberately: the Rust core always serialized it and
 *     upstream's interface just never declared it, so a TS consumer could not
 *     tell a bundled (possibly stale) price sheet from a refreshed one. It is
 *     the one wire-shape change across this boundary, and it is what
 *     test/lab/tab.test.ts's fully-typed fixtures exist to catch.
 */
import { existsSync, readFileSync } from "node:fs";
import { type CostEstimate, estimatePath, TabError } from "@bubstack/moe-tab";
import type { TokenUsage } from "../contracts/economics.js";

const BUCKET_KEYS = [
  "total_input",
  "total_cache_create",
  "total_cache_read",
  "total_output",
] as const;

const round10 = (n: number): number => Math.round(n * 1e10) / 1e10;

interface Bucket {
  total_input: number;
  total_cache_create: number;
  total_cache_read: number;
  total_output: number;
  provider: string;
  subtotal_usd: number;
}

/** Sum per-model token buckets and subtotals across moe-tab estimates into one
 *  TokenUsage. moe-tab's `tokens.cache_write` maps to our `total_cache_create`.
 *  Approximations dedupe by a (kind, detail) tuple key (null != ""). Keeps the
 *  first non-null `pricing_as_of`. Returns null when no tokens were counted.
 *  Costs round to 10 decimals; `est_cost_usd` is null when every priced model
 *  is unpriced. */
export function mergeEstimates(estimates: readonly CostEstimate[]): TokenUsage | null {
  const perModel = new Map<string, Bucket>();
  const unpriced = new Set<string>();
  const approximations: { kind: string; detail: string | null }[] = [];
  const seenApprox = new Set<string>();
  let pricingAsOf: string | null = null;

  for (const est of estimates) {
    // Keep the first TRUTHY pricing_as_of: an empty-string from an earlier
    // estimate is skipped for a later real date.
    pricingAsOf = pricingAsOf || est.pricing_as_of;
    for (const m of est.unpriced_models) {
      unpriced.add(m);
    }
    for (const a of est.approximations) {
      const detail = a.detail ?? null; // boundary: obol's optional -> our null
      const key = JSON.stringify([a.kind, detail]); // tuple key: null != ""
      if (!seenApprox.has(key)) {
        seenApprox.add(key);
        approximations.push({ kind: a.kind, detail });
      }
    }
    for (const mc of est.per_model) {
      const b = perModel.get(mc.model) ?? {
        total_input: 0,
        total_cache_create: 0,
        total_cache_read: 0,
        total_output: 0,
        provider: mc.provider,
        subtotal_usd: 0,
      };
      b.total_input += mc.tokens.input;
      b.total_cache_create += mc.tokens.cache_write;
      b.total_cache_read += mc.tokens.cache_read;
      b.total_output += mc.tokens.output;
      b.subtotal_usd += mc.subtotal_usd;
      perModel.set(mc.model, b);
    }
  }

  const totals = {
    total_input: 0,
    total_cache_create: 0,
    total_cache_read: 0,
    total_output: 0,
  };
  for (const b of perModel.values()) {
    for (const k of BUCKET_KEYS) {
      totals[k] += b[k];
    }
  }
  const totalTokens = BUCKET_KEYS.reduce((s, k) => s + totals[k], 0);
  if (totalTokens === 0) {
    return null;
  }

  const allUnpriced = perModel.size > 0 && [...perModel.keys()].every((m) => unpriced.has(m));
  const models: TokenUsage["models"] = {};
  let topModel: string | null = null;
  let topCost = -1;
  let totalUsd = 0;
  for (const [name, b] of perModel) {
    const tokens = b.total_input + b.total_cache_create + b.total_cache_read + b.total_output;
    models[name] = {
      total_input: b.total_input,
      total_cache_create: b.total_cache_create,
      total_cache_read: b.total_cache_read,
      total_output: b.total_output,
      total_tokens: tokens,
      provider: b.provider,
      est_cost_usd: unpriced.has(name) ? null : round10(b.subtotal_usd),
    };
    totalUsd += b.subtotal_usd;
    if (b.subtotal_usd > topCost) {
      topCost = b.subtotal_usd;
      topModel = name;
    }
  }

  return {
    ...totals,
    total_tokens: totalTokens,
    model: topModel,
    models,
    est_cost_usd: allUnpriced ? null : round10(totalUsd),
    unpriced_models: [...unpriced].sort(),
    approximations,
    pricing_as_of: pricingAsOf,
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Sum the UTF-8 byte length of every tool.result output string in a kimi wire
 *  log: context.append_loop_event rows whose event.type is "tool.result" and
 *  whose result.output is a string. Unreadable files, blank/non-JSON lines, and
 *  rows of any other shape contribute zero. */
export function kimiToolResultTotalBytes(file: string): number {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return 0;
  }
  let total = 0;
  for (const line of text.split("\n")) {
    if (line.trim() === "") {
      continue;
    }
    let row: unknown;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    if (!isObject(row) || row["type"] !== "context.append_loop_event") {
      continue;
    }
    const event = row["event"];
    if (!isObject(event) || event["type"] !== "tool.result") {
      continue;
    }
    const result = event["result"];
    if (!isObject(result)) {
      continue;
    }
    const output = result["output"];
    if (typeof output === "string") {
      total += Buffer.byteLength(output, "utf8");
    }
  }
  return total;
}

/** Price the run's ATIF trajectory.json via moe-tab's `"atif"` dialect. moe-tab reads
 *  the trajectory directly: it honors an embedded per-step `cost_usd` (opencode,
 *  pi) and otherwise prices the token buckets with its rate tables; a model with
 *  no rate surfaces as unpriced (est_cost_usd null, tokens kept). Returns null
 *  when the file is absent, moe-tab rejects it (TabError), or the trajectory
 *  carries no usage (antigravity). This is the ONLY coding-agent token source:
 *  the normalizers fill the trajectory's metrics, no raw log is re-parsed. */
export async function estimateTrajectory(path: string): Promise<TokenUsage | null> {
  if (!existsSync(path)) {
    return null;
  }
  try {
    return mergeEstimates([await estimatePath(path, "atif")]);
  } catch (e) {
    if (e instanceof TabError) {
      return null;
    }
    throw e;
  }
}

/** Price the moe-flight usage sidecar (moe-tab's own `tab` dialect). Returns
 *  null if the file is absent or moe-tab rejects it (TabError). This is the
 *  QA-driver (Flight-Agent) measurement-overhead side, not a coding-agent log.
 *
 *  The dialect literal was `'obol'` upstream. moe-tab renamed it to `'tab'`, and
 *  `crates/moe-tab-ffi/src/lib.rs`'s `parse_dialect` accepts only `"atif"` and
 *  `"tab"` — so the old literal is not a cosmetic leftover, it is a
 *  `TabError::UnknownDialect` that the catch below would then swallow as
 *  "no usage". Pinned by test/lab/usage-row-contract.test.ts. */
export async function estimateUsageSidecar(path: string): Promise<TokenUsage | null> {
  if (!existsSync(path)) {
    return null;
  }
  try {
    return mergeEstimates([await estimatePath(path, "tab")]);
  } catch (e) {
    if (e instanceof TabError) {
      return null;
    }
    throw e;
  }
}
