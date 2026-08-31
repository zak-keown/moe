import { CString, dlopen, FFIType, ptr } from "bun:ffi";
import type { FfiBackend, RawResult } from "./ffi.js";

export function createBackend(libPath: string): FfiBackend {
  const { symbols } = dlopen(libPath, {
    moe_tab_version: { args: [], returns: FFIType.ptr },
    moe_tab_string_free: { args: [FFIType.ptr], returns: FFIType.void },
    moe_tab_estimate_path: {
      args: [FFIType.cstring, FFIType.cstring, FFIType.ptr],
      returns: FFIType.i32,
    },
    moe_tab_refresh_pricing: { args: [FFIType.cstring, FFIType.ptr], returns: FFIType.i32 },
  });

  const cstr = (s: string | null) => (s === null ? null : Buffer.from(s + "\0"));

  // Copy the moe-tab-owned string out, then free it. Always frees when out[0] is non-NULL.
  // out[0] is a bigint; Number() narrows it — exact for all real user-space pointers (< 2^53).
  const drain = (code: number, out: BigUint64Array): RawResult => {
    // `out` is length 1, so out[0] is always present; the `?? 0n` makes the
    // NULL branch below cover the type `noUncheckedIndexedAccess` gives it
    // (`bigint | undefined`). tsc does not require this — `Number()` takes
    // `any` — but without it an undefined would silently become NaN and be
    // handed to CString and to free() as a pointer.
    const p = out[0] ?? 0n;
    if (p === 0n) return { code, json: null };
    const json = new CString(Number(p)).toString();
    symbols.moe_tab_string_free(Number(p));
    return { code, json };
  };

  return {
    version: () => new CString(symbols.moe_tab_version()).toString(), // static; never freed
    estimatePath(path, dialect) {
      const out = new BigUint64Array(1);
      const code = symbols.moe_tab_estimate_path(cstr(path), cstr(dialect), ptr(out));
      return drain(code, out);
    },
    refresh(asOf) {
      const out = new BigUint64Array(1);
      const code = symbols.moe_tab_refresh_pricing(cstr(asOf), ptr(out));
      return drain(code, out);
    },
  };
}
