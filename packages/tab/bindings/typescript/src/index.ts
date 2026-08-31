import { backend, type RawResult } from "./ffi.js";
import type { CostEstimate, Dialect, RefreshReport } from "./types.js";
import { TabError } from "./types.js";

function unwrap<T>(r: RawResult): T {
  if (r.code !== 0) {
    let kind = "Unknown";
    let message = "no detail";
    let code = r.code;
    if (r.json) {
      try {
        const e = (
          JSON.parse(r.json) as { error?: { code?: number; kind?: string; message?: string } }
        ).error;
        if (e) {
          kind = e.kind ?? kind;
          message = e.message ?? message;
          code = e.code ?? code;
        }
      } catch {
        /* keep defaults */
      }
    }
    throw new TabError(code, kind, message);
  }
  return JSON.parse(r.json as string) as T;
}

export async function version(): Promise<string> {
  return (await backend()).version();
}
export async function estimatePath(path: string, dialect: Dialect): Promise<CostEstimate> {
  return unwrap<CostEstimate>((await backend()).estimatePath(path, dialect));
}
export async function refresh(asOf: string): Promise<RefreshReport> {
  return unwrap<RefreshReport>((await backend()).refresh(asOf));
}

// Pin MOE_TAB_PRICING_DIR at runtime. Under Bun a plain `process.env` write does not reach the
// native env the FFI reads, so these call libc setenv/unsetenv (and set process.env for Node).
export { clearPricingDir, setPricingDir } from "./pricing-env.js";
export type {
  Approximation,
  CostEstimate,
  Dialect,
  ModelCost,
  RefreshReport,
  TokenBuckets,
} from "./types.js";
export { TabError } from "./types.js";
