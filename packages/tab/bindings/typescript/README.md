# @bubstack/moe-tab — TypeScript binding (Bun + Node)

A thin TypeScript binding over moe-tab's C ABI (`moe-tab-ffi`). It runs under **both Bun and
Node**: Bun uses the built-in `bun:ffi` (zero runtime deps), Node uses
[`koffi`](https://koffi.dev). The Rust core does all the accounting; this binding only
`dlopen`s the cdylib and re-types the JSON.

Inside this workspace it resolves as `workspace:*`, so changing a cost model does not require
publishing to a registry before it can be tested.

## Building it

This is a pnpm workspace member, but it cannot run without the Rust cdylib:

```sh
pnpm tab:build                 # cargo build --release, from the repo root
# or, for a debug build:
cargo build -p moe-tab-ffi     # -> target/{debug,release}/libmoe_tab_ffi.{dylib,so}

pnpm --filter @bubstack/moe-tab build       # tsc -b  -> dist/
pnpm --filter @bubstack/moe-tab test        # unit project: no cdylib needed
pnpm --filter @bubstack/moe-tab test:ffi    # ffi project: needs the cdylib
```

The library is resolved in order: `$MOE_TAB_LIB` (explicit path) → the package's bundled
`native/<platform>-<arch>/` (only present in a published tarball) → `target/{release,debug}`
(in-repo dev).

## Usage

```ts
import { estimatePath, refresh, version, TabError } from "@bubstack/moe-tab";

const est = await estimatePath("trajectory.json", "atif");
console.log(est.total_usd, est.pricing_as_of, est.pricing_source);

try {
  await estimatePath("usage.jsonl", "banana" as never);
} catch (e) {
  if (e instanceof TabError) console.error(e.code, e.kind, e.message);
}
```

`Dialect` is `"atif" | "tab"` and is **required** — auto-detection is a CLI convenience, not an
API one. The functions are async because the FFI backend is loaded lazily (and cached) on first
use.

A pricing snapshot is compiled into the native library, so `estimatePath` works with no setup.
To use a fresher one, run `moe-tab refresh` (the CLI) or point `MOE_TAB_PRICING_DIR` at a
directory containing a `current.json` snapshot.

### Pinning the pricing dir at runtime

To set `MOE_TAB_PRICING_DIR` *after* the process has started, use the exported helpers rather
than writing `process.env` directly — under **Bun**, a runtime `process.env` write does not reach
the native environment the FFI (and Rust's `getenv`) observes, so the value is silently ignored.
The helpers call libc `setenv`/`unsetenv` under Bun (and set `process.env` for Node), so they
work on both runtimes:

```ts
import { setPricingDir, clearPricingDir } from "@bubstack/moe-tab";

await setPricingDir("/path/to/pricing-dir"); // a dir containing current.json
// … estimatePath(...) …
await clearPricingDir();
```

## Ownership

You never touch raw pointers. Each call copies moe-tab's returned string into a JS string and
then frees the moe-tab-owned pointer (via `moe_tab_string_free`) inside the adapter — the single
place that can get it right.

## Bun environment caveat

moe-tab's Rust core reads `MOE_TAB_PRICING_DIR` / `MOE_TAB_LIB` from the OS environment via
`getenv`, resolved per call. **Under Bun, mutating `process.env` at runtime does not reach the
native library** — set these variables in the environment *before launching* the process (the
normal way). Node propagates `process.env` to `getenv`, so runtime mutation works there; Bun
does not. `src/pricing-env.ts` is the workaround, and it is exported so tests and callers share
one implementation.

## Bun is supported but not verified here

`src/ffi-bun.ts` and the Bun branch of `src/pricing-env.ts` are not exercised by the workspace's
Node-based vitest run. `bun:ffi` is described to the compiler by a local ambient declaration
(`src/bun-ffi.d.ts`) rather than by `bun-types`. `scripts/validate-bindings.sh` contains the
cross-runtime equivalence gate to run when Bun is added to the toolchain.
