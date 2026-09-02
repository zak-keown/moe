//! OpenAI Responses-API `usage` object -> `ProviderTokens`. `input_tokens` is a
//! *total* that still includes cached tokens, so the uncached bucket is the
//! difference — the cached-subtraction a producer must never do itself.

use super::ProviderTokens;
use serde_json::Value;

/// Normalize an OpenAI Responses `usage` object. `input_uncached =
/// input_tokens - input_tokens_details.cached_tokens` (clamped ≥ 0);
/// `cache_read = cached_tokens`. `output_tokens_details.reasoning_tokens` is
/// a breakdown WITHIN `output_tokens` (reasoning is billed as output), not a
/// separate bucket on top of it — the API's own invariant
/// `total_tokens == input_tokens + output_tokens` leaves no room for a
/// separate reasoning term — so `output` is `output_tokens` alone.
pub fn normalize(usage: &Value) -> ProviderTokens {
    let g = |k: &str| usage.get(k).and_then(Value::as_u64).unwrap_or(0);
    let nested = |obj: &str, k: &str| {
        usage
            .get(obj)
            .and_then(|d| d.get(k))
            .and_then(Value::as_u64)
            .unwrap_or(0)
    };
    let cached = nested("input_tokens_details", "cached_tokens");
    ProviderTokens {
        input_uncached: g("input_tokens").saturating_sub(cached),
        cache_read: cached,
        cache_write_5m: 0,
        cache_write_1h: 0,
        output: g("output_tokens"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn subtracts_cached_from_input_and_does_not_double_count_reasoning_in_output() {
        // reasoning_tokens is a breakdown WITHIN output_tokens (billed as
        // output), not a separate bucket on top of it — the API's own
        // invariant total_tokens == input_tokens + output_tokens leaves no
        // room for a separate reasoning term. Adding it in bills reasoning
        // twice.
        let usage = json!({
            "input_tokens": 100,
            "input_tokens_details": {"cached_tokens": 40},
            "output_tokens": 20,
            "output_tokens_details": {"reasoning_tokens": 5}
        });
        let t = normalize(&usage);
        assert_eq!(t.input_uncached, 60);
        assert_eq!(t.cache_read, 40);
        assert_eq!(t.cache_write_5m, 0);
        assert_eq!(t.cache_write_1h, 0);
        assert_eq!(t.output, 20);
    }

    #[test]
    fn handles_missing_details() {
        let usage = json!({"input_tokens": 70, "output_tokens": 6});
        let t = normalize(&usage);
        assert_eq!(t.input_uncached, 70);
        assert_eq!(t.cache_read, 0);
        assert_eq!(t.output, 6);
    }
}
