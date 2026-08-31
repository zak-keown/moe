# moe-tab — Python binding (ctypes)

A thin, pure-Python binding over moe-tab's C ABI (`moe-tab-ffi`). No build step: it loads the
prebuilt shared library with `ctypes` and re-types the JSON the Rust core returns. The Rust core
stays the single source of truth for all accounting; this package only marshals C strings and
parses JSON into dataclasses.

Distribution name `moe-tab`, import name `moe_tab`. **Nothing is published yet** — upstream's
`pypi-release.yml` is not ported and the publish-or-not decision is open (see
[PARITY.md](../../../../PARITY.md)), so today this is an in-repo package used from a source
checkout.

## Point it at the library

The binding needs the `moe-tab-ffi` shared library (`libmoe_tab_ffi.dylib` on macOS,
`libmoe_tab_ffi.so` on Linux). It is located, in order:

1. `$MOE_TAB_LIB` — an explicit absolute path to the shared library.
2. Beside the installed `moe_tab` package (for packaged installs).
3. `target/release/` then `target/debug/`, relative to `packages/tab` (for in-tree dev).

For in-tree development, build the dylib and the `target/debug` fallback finds it with no env:

```bash
cargo build -p moe-tab-ffi     # from packages/tab
```

## Usage

```python
import moe_tab

print(moe_tab.version())  # "0.0.0"

est = moe_tab.estimate_path("trajectory.json", dialect="atif")
print(est.total_usd, est.pricing_as_of)
for m in est.per_model:
    print(m.model, m.provider, m.subtotal_usd)

# Refresh the on-disk pricing snapshot (network; caller supplies the date):
report = moe_tab.refresh("2026-06-05")
```

`dialect` is required and is `"atif"` or `"tab"`. On a nonzero status the call raises
`moe_tab.TabError` carrying `.code`, `.kind`, and `.message` from the FFI error envelope.

## Pricing tables

A pricing snapshot is compiled into the native library, so `estimate_path` works with no setup.
To use a fresher one, run `moe-tab refresh` (the CLI), or point `MOE_TAB_PRICING_DIR` at a
directory containing `current.json`. Pointing `MOE_TAB_PRICING_DIR` at a directory with no
`current.json` is an explicit override and raises `TabError` with `kind ==
"PricingTablesMissing"` (code 1) rather than falling back.

## Ownership & safety contract

moe-tab owns every string it returns through an out-parameter. This binding honors the contract
automatically in `_lib._decode_and_free`: it copies the moe-tab-owned C string into Python
`bytes`, **then** calls `moe_tab_string_free`, **then** the caller parses the copy. The
Rust-owned pointer never outlives the copy and is never freed twice. `moe_tab_version()` returns
a static string and is never freed. You do not manage any of this yourself — the public API
returns plain dataclasses.

## Tests

```bash
cargo build -p moe-tab-ffi                        # from packages/tab; build the dylib first
cd bindings/python
PYTHONPATH=. uv run --no-project --with pytest python -m pytest tests -q
```

This binding keeps its own toolchain (setuptools + pytest) rather than joining the pnpm/vitest
workspace; `py/proof` is the workspace's uv-managed Python member, and this is a binding that
travels with the crate.
