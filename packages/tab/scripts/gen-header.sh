#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
cargo run -q -p moe-tab-ffi --example gen_header
