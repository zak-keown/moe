export interface TokenBuckets {
  input: number;
  output: number;
  cache_read: number;
  cache_write: number;
}
export interface ModelCost {
  model: string;
  provider: string;
  tokens: TokenBuckets;
  subtotal_usd: number;
}
export interface Approximation {
  kind: string;
  detail?: string;
}
export interface CostEstimate {
  total_usd: number;
  per_model: ModelCost[];
  tokens: TokenBuckets;
  unpriced_models: string[];
  approximations: Approximation[];
  pricing_as_of: string;
  /**
   * Which snapshot priced this estimate. The Rust core has always serialized
   * this field; upstream's interface just never declared it, so TS consumers
   * could not tell a bundled (possibly stale) price sheet from a refreshed one.
   */
  pricing_source: "bundled" | "local";
}
export interface RefreshReport {
  models: number;
  as_of: string;
  written_to: string;
}
export type Dialect = "atif" | "tab";

export class TabError extends Error {
  code: number;
  kind: string;
  constructor(code: number, kind: string, message: string) {
    super(`moe-tab: ${kind} (code ${code}): ${message}`);
    this.name = "TabError";
    this.code = code;
    this.kind = kind;
  }
}
