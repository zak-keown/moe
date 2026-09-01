# @bubstack/moe-tab

Price an agent transcript. What the run cost you.

A Rust core plus CLI that reads per-message token usage out of a transcript and prices it against
LiteLLM and OpenRouter snapshots — handling the dedup, cache-bucket and price-tier accounting
naive summers get wrong. A small C ABI lets Python, Go and TypeScript bindings re-type the core's
JSON without re-implementing the arithmetic, so every consumer produces a byte-identical
`total_usd` for the same transcript.

Not a plugin. A library and CLI consumed by other packages — `@bubstack/moe-flight` is the
confirmed consumer, and the whole point of the monorepo edge is that changing a cost model no
longer means publishing to npm before you can test it.

**Status:** imported. 87 Rust tests, 10 TypeScript tests, 7 Go tests, 5 Python tests, and the
five-language equivalence gate green on both dialects.

## Forked from

| Upstream repo | Pinned | License |
|---|---|---|
| `obol` | `28e3dba` | Apache-2.0 |

Apache-2.0 requires stating that files were changed; they were — see below. `LICENSE` and the
upstream `NOTICE` (Copyright 2026 Prime Radiant, Inc., plus its own acknowledgement of
[AgentsView](https://github.com/kenn-io/agentsview), MIT, © 2026 Kenn Software LLC) travel with
the code verbatim.

## Layout

```
Cargo.toml                     cargo workspace; NOT a pnpm member. Driven by root `pnpm tab:build`.
crates/moe-tab-core/           the library: dialects, price store, cost kernel. 68 tests.
  prices/bundled.json          890 KB price snapshot compiled into the library. Generated.
  tests/fixtures/              transcript + price-sheet fixtures.
crates/moe-tab-cli/            the `moe-tab` binary. 5 tests.
crates/moe-tab-ffi/            cdylib + staticlib over the core. 13 tests.
  include/moe_tab.h            committed C header; a test asserts it matches cbindgen output.
bindings/typescript/           @bubstack/moe-tab — the one pnpm workspace member here.
  test/unit/                   4 tests, no cdylib needed. `pnpm test`.
  test/ffi/                    6 tests over the real cdylib. `pnpm test:ffi`.
bindings/python/               moe_tab (ctypes). setuptools + pytest, not a pnpm member.
bindings/go/tab/               purego, no cgo. Not a pnpm member.
bindings/testdata/             the shared corpus all three bindings price.
scripts/                       header regen, price refresh, and the equivalence gate.
docs/dialects.md               live reference for the two transcript dialects.
docs/history/                  upstream plans, specs, validation reports, release doc. Verbatim.
```

## What the upstream docs claim, and what the code does

Upstream's README, ABOUT.md and every doc under `docs/history/` advertise per-agent dialects —
`claude`, `codex`, `pi`, `gemini`, `opencode`, `copilot`, `kimi`. **Those parsers were deleted in
upstream's 0.6.0.** The code at `28e3dba` has exactly two dialects, `atif` and `tab`, and the
docs were never updated.

Every rewritten description in this package reflects the code, not the docs. The stale claims are
preserved unaltered in `docs/history/` because they are dated records, and
[`docs/dialects.md`](./docs/dialects.md) exists to be the thing you read instead.

Two other doc/reality gaps worth naming: `bindings/python/README.md` and
`bindings/go/README.md` both told you to `pip install` / `go get` a published artifact — nothing
is published, and nothing will be until the publish-or-not decision in
[PARITY.md](../../PARITY.md) is made. And the Go binding's loader documents an "embedded native
library" path that is dead here: it only ever had bytes in the *generated* `obol-go` repository,
which has no GitLab counterpart.

## What changed on import

**Three crates renamed**, and the pre-existing `packages/tab/Cargo.toml` scaffold reconciled
against them: `obol-core` → `moe-tab-core`, `obol-cli` → `moe-tab-cli`, `obol-ffi` →
`moe-tab-ffi`. The scaffold named those three members correctly but carried no
`[workspace.dependencies]`, so the crates could not resolve `moe-tab-core.workspace = true`; that
table is now present, with `version = "0.0.0"` to match the rest of the workspace (upstream was
at `0.9.0`).

**`node --test` → vitest, and two vitest projects.** The TypeScript binding's one suite needed the
cdylib, which the `node:24` CI image does not have a cargo to build. `pnpm test` runs a new
toolchain-free `unit` project; `pnpm test:ffi` runs the inherited suite against the real library.
See `bindings/typescript/vitest.config.ts` for why, following `packages/glass`.

**tsup → `tsc -b`.** Upstream bundled with tsup, mainly so `.ts` import specifiers would resolve.
`tsc -b` is the workspace's library build (ARCHITECTURE.md §6), so the `./x.ts` import specifiers
became `./x.js` and `total.ts` moved into `src/`. `dist/` now carries real `.d.ts` files from the
compiler and the package joins the root tsconfig solution build. One tsup behaviour was worth
keeping and is: `ffi-bun.ts` and `ffi-node.ts` stay separate modules reached by dynamic `import()`,
so Node never resolves `bun:ffi` and Bun never loads `koffi`.

**Upstream never typechecked this package** — its `package.json` had no `scripts` key at all. So
`tsc` had never seen the code. Under the strict base it produced **zero** errors once two real
gaps were closed: `bun:ffi` had no types (now `src/bun-ffi.d.ts`, a 40-line ambient declaration of
the four symbols we call, chosen over a `bun-types` dependency that would put Bun globals in scope
for a package that also builds for Node), and `types: []` hid `process` and `Buffer` behind two
hand-written `declare const`s in `pricing-env.ts` (now `types: ["node"]`, and the declarations are
gone). A `symbols as unknown as LibcEnv` double cast went with them — the ambient declaration
makes it assignable.

**One real inherited flake fixed.** `cargo test --workspace` failed roughly one run in three, in
`moe-tab-ffi`: `estimate_path_bad_path_is_io_error` returned `ERR_PRICING_MISSING` instead of
`ERR_IO`. The FFI test module mutates the process-global `MOE_TAB_PRICING_DIR` and deletes the
directory it points at, and cargo runs those tests on multiple threads in one process, so a
neighbour's teardown lands mid-body. `moe-tab-core` already solves exactly this with a crate-level
`test_env::env_lock`; the FFI crate is a separate test binary and had none. It has one now, and 12
consecutive parallel runs are clean. Upstream's answer was a README note telling you to pass
`--test-threads=1` — which the root `pnpm tab:test` script does not, so the note would not have
survived contact with this workspace.

**Four unported release workflows.** `.github/workflows/{ci,release,crates-release,pypi-release}.yml`
are not ported; `ci.yml`'s content is now spread across `pnpm check`, `pnpm tab:test` and
`scripts/validate-bindings.sh`. The inert Go-module assembly and manylinux-wheel scripts were
also dropped once the publication decision closed; their upstream copies remain in the pinned
snapshot and their designs remain in `docs/history/`.

**`scripts/validate-bindings.sh` rewritten and actually run.** It de-mise'd (bare `cargo`, per
ARCHITECTURE.md), builds `dist/` with pnpm instead of `bun install || npm install`, runs
`node dist/total.js` instead of `node total.ts`, and treats Bun as optional. It reports
`rust == python == go == ts(node) == ts(bun)` on both dialects: `37.25` for `atif`, `0.00179` for
`tab`.

**`pricing_source` added to the TypeScript `CostEstimate`.** The Rust core has always serialized
it; the interface just never declared it, so a TS consumer could not tell a bundled snapshot from
a refreshed one. The Python and Go structs have the same omission — see follow-ups.

**Dropped, and why:** `mise.toml` (pins rust 1.96.0; this workspace's floor is 1.98 and repo
scripts call bare `cargo`), the nested `.gitignore` and `bindings/typescript/tsconfig.json` (root
configs govern), `bun.lock`, `Cargo.lock` (regenerated), and the two `catalog-info.yaml` +
two `ABOUT.md` files — Backstage catalog entries and generated repo-map output naming an owner and
a catalog Moe does not have, and which would rot with no generator to refresh them.

## Rebrand, and what was deliberately left alone

About 575 substitutions across 60 files. The ones that are interface changes, not text:

| Kind | Upstream | Moe |
|---|---|---|
| bin | `obol` | `moe-tab` |
| cargo crates | `obol-core`, `obol-cli`, `obol-ffi` | `moe-tab-core`, `moe-tab-cli`, `moe-tab-ffi` |
| cdylib | `libobol_ffi.{dylib,so}` | `libmoe_tab_ffi.{dylib,so}` |
| C symbols | `obol_version`, `obol_string_free`, `obol_estimate_path`, `obol_refresh_pricing` | `moe_tab_*` |
| C header | `include/obol.h`, guard `OBOL_H` | `include/moe_tab.h`, guard `MOE_TAB_H` |
| npm package | `@primeradianthq/obol` | `@bubstack/moe-tab` (`workspace:*`) |
| PyPI dist / import | `primeradianthq-obol` / `obol` | `moe-tab` / `moe_tab` |
| Go module / package | `github.com/prime-radiant-inc/obol/bindings/go`, package `obol` | `gitlab.tcdevops.com/Zak/moe/packages/tab/bindings/go`, package `tab` |
| env vars | `OBOL_PRICING_DIR`, `OBOL_LIB`, `OBOL_WHEEL_PLAT` | `MOE_TAB_PRICING_DIR`, `MOE_TAB_LIB`, `MOE_TAB_WHEEL_PLAT` |
| data dir | `$XDG_DATA_HOME/obol` | `$XDG_DATA_HOME/moe/tab` |
| error type | `ObolError` / `TabError` in five languages | `TabError` everywhere |
| dialect | `--dialect obol`, `Dialect::Obol` | `--dialect tab`, `Dialect::Tab` |
| wire format | `{"type":"obol.usage"}` | `{"type":"moe.tab.usage"}` |

The C-symbol rename is the load-bearing one: it has to land identically in the Rust FFI, the
committed header, and all three bindings, or nothing loads. The equivalence gate is what proves it
did.

### Left alone

- **`LICENSE`, `NOTICE`, and everything under `docs/history/`** — byte-for-byte as received.
  They describe a project that *was* called obol. Rewriting them falsifies the record and, for
  `LICENSE` and `NOTICE`, breaks the attribution Apache-2.0 requires. `docs/history/README.md` is
  the one file added there, and it exists to say so.
- **Provenance URLs stay on GitHub.** `github.com/prime-radiant-inc/obol` in a "forked from"
  sentence, `github.com/kenn-io/agentsview` in the acknowledgement, `github.com/ebitengine/purego`
  as a dependency. Only self-reference — `repository`, `homepage`, "part of" links — became
  `gitlab.tcdevops.com/Zak/moe`.
- **`atif` keeps its name.** It is an external interchange format (Agent Trajectory Interchange
  Format), not an upstream brand.
- **`ATIF-` schema prefix, `litellm`/`openrouter` namespace keys, the `v` schema date
  `2026-06-08`, and every model id** — all external vocabulary or wire values.
- **Bun support.** `src/ffi-bun.ts` and the Bun branch of `pricing-env.ts` are imported verbatim
  and are not exercised by the vitest suites, which run under Node. They do pass the equivalence
  gate when `bun` happens to be on PATH, which it was on the import machine.
## Follow-ups

- **The Python and Go result types still omit `pricing_source`**, as the TypeScript one did. Adding
  it means touching a dataclass and a struct plus their `from_json`; worth doing, but it is a
  binding-surface change rather than a rename and did not belong in this import.
- **`go vet` reports two `possible misuse of unsafe.Pointer`** in `tab/loader.go`'s `cstr`.
  Inherent to reading a NUL-terminated C string without cgo; upstream did not run `go vet` either.
  A `//go:linkname`-free rewrite using `unsafe.Slice` on a bounded length would silence it.
- **`docs/history/scripts/` holds two reproducers that cannot run** — they pass `--dialect pi` and
  `--dialect claude|codex`. They are the method behind the numbers in
  `docs/history/validation/`, and they should be deleted, not fixed, if those reports are ever
  superseded.
- **The bundled price sheet is frozen at upstream's last refresh.** `scripts/update-bundled-prices.sh`
  regenerates it, and its own header says prices move faster than code releases. Someone should
  decide where "refresh the sheet" lives in Moe's own UX before `moe-flight` starts quoting numbers.
