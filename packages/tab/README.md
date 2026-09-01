# Moe Tab

Tab estimates the token cost of agent transcripts. The Rust core supports ATIF
and TAB transcript dialects, bundled or refreshed model pricing, and bindings
for TypeScript, Python, and Go.

## CLI

```sh
moe-tab estimate transcript.jsonl
moe-tab estimate transcript.jsonl --dialect atif --json
moe-tab refresh
```

## Layout

- `crates/moe-tab-core/` — parsing, pricing, and estimation.
- `crates/moe-tab-cli/` — command-line interface.
- `crates/moe-tab-ffi/` — C ABI.
- `bindings/` — TypeScript, Python, and Go consumers of the C ABI.
- `docs/` — current transcript-dialect notes.

## Development

```sh
pnpm tab:build
pnpm tab:test
pnpm tab:test:bindings
```

Run the binding suite after any FFI, header, or binding change.
