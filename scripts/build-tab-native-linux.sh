#!/usr/bin/env bash
set -euo pipefail

: "${TAB_RELEASE_VERSION:?TAB_RELEASE_VERSION is required}"

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
output_root=${TAB_NATIVE_OUTPUT_DIR:-"$repo_root/.tc-tab-native"}
target_root=${CARGO_TARGET_DIR:-"$repo_root/packages/tab/target"}
manifest="$repo_root/packages/tab/Cargo.toml"
smoke_source="$repo_root/scripts/tab-native-smoke.c"
scratch=$(mktemp -d)
trap 'rm -rf "$scratch"' EXIT

rustup target add x86_64-unknown-linux-gnu aarch64-unknown-linux-gnu

cargo build --release --manifest-path "$manifest" -p moe-tab-ffi \
  --locked \
  --target x86_64-unknown-linux-gnu
CARGO_TARGET_AARCH64_UNKNOWN_LINUX_GNU_LINKER=aarch64-linux-gnu-gcc \
  CC_aarch64_unknown_linux_gnu=aarch64-linux-gnu-gcc \
  cargo build --release --manifest-path "$manifest" -p moe-tab-ffi \
    --locked \
    --target aarch64-unknown-linux-gnu

mkdir -p "$output_root/linux-x64" "$output_root/linux-arm64"
install -m 0644 \
  "$target_root/x86_64-unknown-linux-gnu/release/libmoe_tab_ffi.so" \
  "$output_root/linux-x64/libmoe_tab_ffi.so"
install -m 0644 \
  "$target_root/aarch64-unknown-linux-gnu/release/libmoe_tab_ffi.so" \
  "$output_root/linux-arm64/libmoe_tab_ffi.so"
strip --strip-unneeded "$output_root/linux-x64/libmoe_tab_ffi.so"
aarch64-linux-gnu-strip --strip-unneeded "$output_root/linux-arm64/libmoe_tab_ffi.so"

maximum_glibc() {
  "$1" --version-info "$2" | sed -n 's/.*Name: GLIBC_\([0-9][0-9.]*\).*/\1/p' | sort -V | tail -n 1
}

for specification in \
  "readelf:$output_root/linux-x64/libmoe_tab_ffi.so" \
  "aarch64-linux-gnu-readelf:$output_root/linux-arm64/libmoe_tab_ffi.so"; do
  reader=${specification%%:*}
  library=${specification#*:}
  required=$(maximum_glibc "$reader" "$library")
  if [ -z "$required" ] || ! dpkg --compare-versions "$required" le 2.31; then
    echo "$library requires GLIBC_${required:-unknown}; release ceiling is GLIBC_2.31" >&2
    exit 1
  fi
  echo "$(basename "$library") maximum glibc symbol: GLIBC_$required"
done

mkdir -p "$scratch/pricing"
cp "$repo_root/packages/tab/bindings/testdata/prices.json" "$scratch/pricing/current.json"
include="$repo_root/packages/tab/crates/moe-tab-ffi/include"
transcript="$repo_root/packages/tab/bindings/testdata/tab-usage-mini.jsonl"

cc "$smoke_source" -I"$include" -L"$output_root/linux-x64" \
  -lmoe_tab_ffi -o "$scratch/smoke-x64"
MOE_TAB_PRICING_DIR="$scratch/pricing" LD_LIBRARY_PATH="$output_root/linux-x64" \
  "$scratch/smoke-x64" "$TAB_RELEASE_VERSION" "$transcript"

aarch64-linux-gnu-gcc "$smoke_source" -I"$include" -L"$output_root/linux-arm64" \
  -lmoe_tab_ffi -o "$scratch/smoke-arm64"
MOE_TAB_PRICING_DIR="$scratch/pricing" LD_LIBRARY_PATH="$output_root/linux-arm64" \
  qemu-aarch64 -L /usr/aarch64-linux-gnu \
    "$scratch/smoke-arm64" "$TAB_RELEASE_VERSION" "$transcript"
