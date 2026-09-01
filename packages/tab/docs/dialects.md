# The two transcript dialects

Live reference, derived from the code in `crates/moe-tab-core/src/transcript/`. The dated design
specs in [`history/specs/`](./history/specs/) explain *why* these shapes were chosen; this file
says what the code accepts today. Where the two disagree, this one is right.

`--dialect` takes `atif` or `tab`. Auto-detection (`transcript::detect`) is a CLI convenience
only; every library and binding requires the dialect explicitly.

## `atif` — an ATIF trajectory

A single JSON document with a `schema_version` beginning `"ATIF-"`. This is the canonical shape a
harness normalizes an agent's session log into, so moe-tab prices one stable input instead of
learning every agent's transcript format. `@bubstack/moe-flight` is the producer in this
workspace.

Per-step `usage` is read verbatim into disjoint token buckets. Two things override list-price
math, in this order:

1. a step's own reported cost, if present — provider-reported cost is ground truth;
2. otherwise `final_metrics.total_cost_usd`, if the steps carry no costs.

A step's usage always wins over `final_metrics`, so a trajectory that carries both is never
double-counted. `crates/moe-tab-core/src/transcript/atif.rs` holds the tests for each of these
cases.

## `tab` — the house usage sidecar

A JSONL file (`usage.jsonl`), one row per billable LLM call, that a harness can emit to get
priced without moe-tab learning its transcript format at all. The producer tags the call and
copies the SDK's `usage` object through verbatim — **no arithmetic in the producer**. The
interpretation that naive summers get wrong (cache buckets, dedup, tiers) lives in moe-tab, once.

```json
{"type":"moe.tab.usage","v":"2026-06-08","provider":"anthropic","model":"claude-opus-4-8",
 "service_tier":"standard","usage":{ …the SDK's usage object, verbatim… }}
```

| Field | Required | Notes |
|---|---|---|
| `type` | yes | Must be `moe.tab.usage`. Other event types are ignored. |
| `v` | yes | Schema version, an ISO date matched as an opaque string. Only `2026-06-08` is understood; anything else is a loud error, never a silent mis-parse. |
| `provider` | yes | `anthropic` or `openai`. Selects the usage normalizer. Any other value is an error. |
| `model` | no | Verbatim model id. Absent or empty means "unknown model", which surfaces as an unpriced model rather than a $0. |
| `service_tier` | no | Absent means the standard tier is assumed, and that assumption is reported in `approximations`. |
| `usage` | yes | The provider's own usage object, unmodified. Must be an object. |

Blank lines and lines that are not valid JSON are skipped (a truncated trailing write is normal
for an append-only sidecar). Lines whose `type` is something else are skipped too, so a sidecar
may be interleaved with other event types.

## Pricing

Both dialects price against the same snapshot. Resolution order:

1. `$MOE_TAB_PRICING_DIR`, if set, **wins absolutely** — a missing `current.json` there is an
   error, not a fallback, because an explicit override that silently fell back would price
   against the wrong sheet.
2. otherwise, whichever of the on-disk snapshot (`$XDG_DATA_HOME/moe/tab`, default
   `~/.local/share/moe/tab`) and the snapshot compiled into the library carries the newer
   `as_of`, on-disk winning ties.

Precedence is decided on *parsed* stamps, never raw strings: a local snapshot with an
unparseable `as_of` loses to the embedded floor. `pricing_source` in the output says which one
was used.
