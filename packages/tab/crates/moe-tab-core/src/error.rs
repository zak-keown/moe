use std::path::PathBuf;

#[derive(Debug, thiserror::Error)]
pub enum TabError {
    #[error("pricing tables not found at {0} — run `moe-tab refresh`")]
    PricingTablesMissing(PathBuf),
    #[error("could not determine transcript dialect")]
    UnknownDialect,
    #[error("invalid as_of {0:?} — expected YYYY-MM-DD or YYYY-MM-DDTHH:MM:SSZ (UTC)")]
    InvalidAsOf(String),
    #[error("malformed transcript at line {line}: {msg}")]
    MalformedTranscript { line: usize, msg: String },
    #[error("network error during refresh: {0}")]
    Network(String),
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error("json error: {0}")]
    Json(#[from] serde_json::Error),
}
