# moe-tab — Go binding (purego)

A thin [purego](https://github.com/ebitengine/purego) binding over moe-tab's C ABI
(`moe-tab-ffi`). It loads the prebuilt shared library at **runtime** (`dlopen`) and re-types the
JSON the Rust core returns into idiomatic Go structs. **No cgo** — `CGO_ENABLED=0` works, so
consumers need no C compiler. The Rust core stays the single source of truth for all accounting;
this package only marshals C strings and unmarshals JSON.

```go
import "gitlab.tcdevops.com/bubstack/moe/packages/tab/bindings/go/tab"
```

## Not a published module

Upstream generated a **separate** repository, `github.com/prime-radiant-inc/obol-go`, from this
directory: the release workflow flattened these files to a module root, embedded the four
per-platform native libraries, and tagged a matching release so a plain `go get` resolved a
self-contained module. That workflow is not ported (see [PARITY.md](../../../../PARITY.md)), and
no equivalent repository exists on GitLab, so **`embed_stub.go` is the only embed file here and
`embeddedLib` is always empty**. The loader therefore always takes its `MOE_TAB_LIB` or dev
`target/` path.

`scripts/assemble-go-module.sh` still contains the assembly logic, inert, for whenever the
publish-or-not decision is made.

## How the library is located

The loader resolves `libmoe_tab_ffi` in this order (first hit wins):

1. **`MOE_TAB_LIB`** — an explicit path to the shared library. Overrides everything.
2. **Embedded** — extracted to a content-hashed dir under `os.UserCacheDir()` (falling back to
   the temp dir), then `dlopen`'d. Only present in a generated, published module; absent here.
3. **Dev `target/`** — `packages/tab/target/release` then `target/debug`, located from the
   package source file. So after `pnpm tab:build` (or `cargo build -p moe-tab-ffi`) the tests
   and `cmd/total` run **env-free**.

On macOS under a hardened runtime with library validation, an unsigned extracted dylib may be
rejected — point `MOE_TAB_LIB` at a signed copy in that case.

## Usage

```go
tab.Version() // "0.0.0" (the Rust core version)

est, err := tab.EstimatePath("trajectory.json", "atif")
// est.TotalUSD, est.PricingAsOf, est.PerModel[i].{Model,Provider,SubtotalUSD}

report, err := tab.Refresh("2026-06-05") // refresh the on-disk pricing snapshot (network)
```

The dialect is **required** — an empty string returns a `*TabError` (`Kind ==
"InvalidArgument"`), and there is no auto-detection. The known identifiers are `atif` and `tab`;
an unknown one yields `Kind == "InvalidArgument"`.

On a nonzero status the call returns a `*tab.TabError` carrying `.Code`, `.Kind`, and `.Message`
from the FFI error envelope.

## Pricing tables

A pricing snapshot is compiled into the native library, so `EstimatePath` works with no setup.
To use a fresher one, run `moe-tab refresh` (the CLI), or point `MOE_TAB_PRICING_DIR` at a
directory containing `current.json`.

> Note: with `CGO_ENABLED=0` on Linux, a *runtime* `os.Setenv("MOE_TAB_PRICING_DIR", …)` does
> **not** reach the dlopen'd library's `getenv` (Go makes raw syscalls and never links libc).
> Set the var **before** the process starts, or set it via libc `setenv` (the test suite does
> this in `pricing_env_test.go`). Inherited environment is fine everywhere.

## Ownership & safety contract

moe-tab owns every string it returns through an out-parameter. This binding honors the contract
in `drain`: it copies the moe-tab-owned C string into a Go `[]byte` (`cstr` reads up to the NUL),
**then** `defer`s `moe_tab_string_free`, so the Rust-owned pointer never outlives the copy and is
never freed twice. A zero out-pointer is handled. `moe_tab_version` returns a static C string and
is never freed. String/byte arguments are kept alive across the synchronous FFI call with
`runtime.KeepAlive`. The public API returns plain Go structs — you manage none of this yourself.

## Tests

```bash
cargo build -p moe-tab-ffi          # build the dylib first (from packages/tab)
cd bindings/go && CGO_ENABLED=0 go test ./...
```

`go vet` reports two `possible misuse of unsafe.Pointer` findings in `cstr` (`tab/loader.go`).
They are inherent to reading a NUL-terminated C string without cgo and are inherited unchanged;
upstream did not run `go vet` in CI either.
