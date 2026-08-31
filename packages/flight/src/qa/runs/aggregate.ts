import type { SetBucket } from "./run-set-types.js";

export interface ByStatus {
  pass: number;
  fail: number;
  investigate: number;
  errored: number;
  cancelled: number;
}

export function deriveBucket(by: ByStatus): SetBucket {
  const errAndCancel = by.errored + by.cancelled;
  const total = by.pass + by.fail + by.investigate + errAndCancel;
  if (total === 0) return "errored"; // degenerate
  if (by.pass === total) return "consistent_pass";
  if (by.investigate === total) return "consistent_investigate";
  if (by.fail === total) return "consistent_fail";
  if (errAndCancel === total) return "errored";
  if (errAndCancel > 0) return "mixed_with_errors";
  return "mixed";
}

export function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  // xs is non-empty (guarded above), so mid and mid-1 are both in range for
  // their respective branches. `?? 0` states that without changing behaviour.
  if (sorted.length % 2 === 1) return sorted[mid] ?? 0;
  return Math.round(((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2);
}
