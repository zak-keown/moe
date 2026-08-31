import koffi from "koffi";
import type { FfiBackend, RawResult } from "./ffi.js";

export function createBackend(libPath: string): FfiBackend {
  const lib = koffi.load(libPath);
  const moe_tab_version = lib.func("const char* moe_tab_version()");
  const moe_tab_string_free = lib.func("void moe_tab_string_free(void* s)");
  // out-param is void** (NOT char**): char** makes koffi auto-stringify and lose the pointer → leak.
  const moe_tab_estimate_path = lib.func(
    "int moe_tab_estimate_path(const char* path, const char* dialect, _Out_ void** out)",
  );
  const moe_tab_refresh = lib.func(
    "int moe_tab_refresh_pricing(const char* as_of, _Out_ void** out)",
  );

  // Copy the moe-tab-owned string out, then free it. Always frees when the pointer is non-NULL.
  const drain = (code: number, out: [unknown]): RawResult => {
    const p = out[0];
    if (p === null || p === undefined) return { code, json: null };
    const json = koffi.decode(p, "char", -1) as string;
    moe_tab_string_free(p);
    return { code, json };
  };

  return {
    version: () => moe_tab_version() as string, // koffi marshals const char* return to a JS string
    estimatePath(path, dialect) {
      const out: [unknown] = [null];
      const code = moe_tab_estimate_path(path, dialect, out) as number;
      return drain(code, out);
    },
    refresh(asOf) {
      const out: [unknown] = [null];
      const code = moe_tab_refresh(asOf, out) as number;
      return drain(code, out);
    },
  };
}
