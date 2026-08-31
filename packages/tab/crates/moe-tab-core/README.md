# moe-tab-core

Read an AI-agent transcript and estimate what it cost. `moe-tab-core` extracts per-message
token usage and computes USD cost, handling the accounting naive summers get wrong: two-layer
dedup, cache buckets, and price tiers.

Two transcript dialects:

- **`atif`** — an ATIF (Agent Trajectory Interchange Format) `trajectory.json`, the canonical
  single document a harness normalizes every agent's session log into.
- **`tab`** — the house usage sidecar, a `{"type":"moe.tab.usage", …}` JSONL a harness can
  emit per LLM call to get priced without `moe-tab` learning its transcript format.

```rust
use moe_tab_core::{estimate_cost, Dialect};
use std::path::Path;

let est = estimate_cost(Path::new("usage.jsonl"), Dialect::Tab)?;
println!("{} USD", est.total_usd);
```

Pricing comes from LiteLLM and OpenRouter snapshots; a snapshot is compiled into the library so
`estimate_cost` works with no setup, and `refresh_pricing_tables(as_of)` writes a fresher one to
disk. The library has no clock — the caller supplies the `as_of` stamp. Output is a typed
`CostEstimate` carrying `unpriced_models`, `approximations` and `pricing_source` — not a JSON
blob, and never a silent $0.

Part of [Moe](https://gitlab.tcdevops.com/bubstack/moe), forked from
[obol](https://github.com/prime-radiant-inc/obol). Apache-2.0.
