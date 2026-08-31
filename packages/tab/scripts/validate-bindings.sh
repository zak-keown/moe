#!/usr/bin/env bash
# Cross-language equivalence gate: every consumer must produce a byte-identical
# `total_usd` for the same transcript priced against the same snapshot. The
# bindings re-type the core's JSON and never re-implement accounting; this is what
# proves it.
#
# Consumers: Rust CLI, Python (ctypes), Go (purego), TypeScript under Node (koffi),
# and TypeScript under Bun (bun:ffi) when `bun` is on PATH. Bun is optional here
# because the Moe toolchain is pnpm/Node; upstream's CI always had both.
#
# Requires: cargo, python3, go, node, and a built `dist/` for the TS binding.
# Usage: scripts/validate-bindings.sh
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"

echo "building moe-tab-ffi + moe-tab-cli…"
cargo build -p moe-tab-ffi -p moe-tab-cli

echo "building the TypeScript binding…"
( cd bindings/typescript && pnpm exec tsc -b )

LIBDIR="$ROOT/target/debug"
LIBNAME="libmoe_tab_ffi.$([ "$(uname)" = Darwin ] && echo dylib || echo so)"
export MOE_TAB_LIB="$LIBDIR/$LIBNAME"

SEED="$(mktemp -d)"; trap 'rm -rf "$SEED"' EXIT
cp bindings/testdata/prices.json "$SEED/current.json"
export MOE_TAB_PRICING_DIR="$SEED"

# Normalize any numeric string to Python's shortest round-trip repr of its f64 value.
norm() { python3 -c 'import sys; print(repr(float(sys.stdin.read().strip())))'; }

HAVE_BUN=0
command -v bun >/dev/null 2>&1 && HAVE_BUN=1

# check <transcript> <dialect>
check() {
  local transcript="$1"
  local dialect="$2"
  local rust_total py_total go_total ts_node ts_bun

  rust_total=$(cargo run -q -p moe-tab-cli -- estimate "$transcript" --dialect "$dialect" --json \
    | python3 -c 'import sys,json; print(json.load(sys.stdin)["total_usd"])' | norm)
  py_total=$( (cd bindings/python && PYTHONPATH=. python3 -c \
    "import moe_tab; print(moe_tab.estimate_path('$ROOT/$transcript', dialect='$dialect').total_usd)") | norm)
  go_total=$( (cd bindings/go && CGO_ENABLED=0 go run ./cmd/total "$ROOT/$transcript" "$dialect") | norm)
  ts_node=$( (cd bindings/typescript && node dist/total.js "$ROOT/$transcript" "$dialect") | norm)

  echo "rust    : $rust_total"
  echo "py      : $py_total"
  echo "go      : $go_total"
  echo "ts(node): $ts_node"

  if [ "$rust_total" != "$py_total" ] || [ "$py_total" != "$go_total" ] \
     || [ "$go_total" != "$ts_node" ]; then
    echo "MISMATCH: dialect=$dialect rust=$rust_total py=$py_total go=$go_total ts_node=$ts_node" >&2
    exit 1
  fi

  if [ "$HAVE_BUN" = 1 ]; then
    ts_bun=$( (cd bindings/typescript && bun dist/total.js "$ROOT/$transcript" "$dialect") | norm)
    echo "ts(bun) : $ts_bun"
    if [ "$ts_bun" != "$rust_total" ]; then
      echo "MISMATCH: dialect=$dialect bun=$ts_bun expected=$rust_total" >&2
      exit 1
    fi
    echo "OK: $dialect rust==python==go==ts(node)==ts(bun) ($rust_total)"
  else
    echo "OK: $dialect rust==python==go==ts(node) ($rust_total)  [bun not on PATH: skipped]"
  fi
}

check bindings/testdata/atif-mini.json        atif
check bindings/testdata/tab-usage-mini.jsonl  tab
