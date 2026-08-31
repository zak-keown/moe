import { resolveLibPath } from "./lib-path.js";

export interface RawResult {
  code: number;
  json: string | null;
}
export interface FfiBackend {
  version(): string;
  estimatePath(path: string, dialect: string): RawResult;
  refresh(asOf: string): RawResult;
}

let cached: Promise<FfiBackend> | undefined;

/** Resolve the backend once; concurrent first calls await the same import. */
export function backend(): Promise<FfiBackend> {
  // Split from the upstream `return (cached ??= load())` so it does not assign
  // inside an expression (biome's noAssignInExpressions). Same semantics: the
  // promise is stored before it is returned, so concurrent callers share it.
  cached ??= load();
  return cached;
}

async function load(): Promise<FfiBackend> {
  const isBun = typeof (globalThis as { Bun?: unknown }).Bun !== "undefined";
  const libPath = resolveLibPath();
  // .ts specifiers (no build step); only the taken branch is ever imported, so Node never
  // resolves bun:ffi and Bun never loads koffi.
  const mod = isBun ? await import("./ffi-bun.js") : await import("./ffi-node.js");
  return (mod as { createBackend(p: string): FfiBackend }).createBackend(libPath);
}
