pub mod atif;
pub mod provider;
pub mod tab;

use crate::error::TabError;
use crate::model::MessageUsage;
use serde_json::Value;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Dialect {
    Atif,
    Tab,
}

/// Detect dialect from content: sidecar lines carry `{"type":"moe.tab.usage",...}`;
/// ATIF trajectories are a single-document JSON with a `schema_version`
/// starting with "ATIF-".
pub fn detect(bytes: &[u8]) -> Result<Dialect, TabError> {
    let text = std::str::from_utf8(bytes).map_err(|_| TabError::UnknownDialect)?;
    // Budget the 20-line scan on non-blank lines only: a blank line is
    // skipped below and can never claim a row, so it must not consume a
    // slot that a real claiming row further down could have used (CR-106).
    for line in text
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .take(20)
    {
        let v: Value = match serde_json::from_str(line) {
            Ok(v) => v,
            Err(_) => continue,
        };
        if tab::claims_row(&v) {
            return Ok(Dialect::Tab);
        }
    }
    // Single-document JSON formats (the line loop above can't see these).
    if let Ok(doc) = serde_json::from_slice::<Value>(bytes) {
        // ATIF trajectory.json: a versioned single document with an agent + steps.
        if doc
            .get("schema_version")
            .and_then(Value::as_str)
            .is_some_and(|v| v.starts_with("ATIF-"))
        {
            return Ok(Dialect::Atif);
        }
    }
    Err(TabError::UnknownDialect)
}

pub fn parse(bytes: &[u8], dialect: Dialect) -> Result<Vec<MessageUsage>, TabError> {
    match dialect {
        Dialect::Atif => atif::parse(bytes),
        Dialect::Tab => tab::parse(bytes),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_tab() {
        let tab = include_bytes!("../../tests/fixtures/tab-usage-mini.jsonl");
        assert_eq!(detect(tab).unwrap(), Dialect::Tab);
    }

    #[test]
    fn detects_atif() {
        let atif = include_bytes!("../../tests/fixtures/atif-mini.json");
        assert_eq!(detect(atif).unwrap(), Dialect::Atif);
    }

    #[test]
    fn unknown_dialect_errors() {
        assert!(matches!(detect(b"{}\n{}"), Err(TabError::UnknownDialect)));
    }

    // CR-106: detect() looked for a claiming row only within the file's
    // first 20 *lines*, and blank lines consumed a slot in that budget even
    // though the loop skips them — so a tab-dialect file with more than 20
    // leading blank lines (plausible from a buffered writer that
    // pre-allocates newline padding) was never recognized, even though
    // tab::parse would parse it correctly once the dialect were known.
    #[test]
    fn detects_tab_dialect_past_20_leading_blank_lines() {
        let mut bytes = "\n".repeat(25).into_bytes();
        bytes.extend_from_slice(br#"{"type":"moe.tab.usage","v":"2026-06-08"}"#);
        assert_eq!(detect(&bytes).unwrap(), Dialect::Tab);
    }
}
