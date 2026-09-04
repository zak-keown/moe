use super::ModelPrice;
use crate::error::TabError;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

/// All price tables, keyed by namespace ("litellm") then verbatim model string.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PriceStore {
    pub as_of: String,
    pub namespaces: HashMap<String, HashMap<String, ModelPrice>>,
}

impl PriceStore {
    pub fn lookup(&self, namespace: &str, model: &str) -> Option<&ModelPrice> {
        self.namespaces.get(namespace)?.get(model)
    }

    pub fn from_json(bytes: &[u8]) -> Result<Self, TabError> {
        Ok(serde_json::from_slice(bytes)?)
    }

    pub fn load(path: &Path) -> Result<Self, TabError> {
        if !path.exists() {
            return Err(TabError::PricingTablesMissing(path.to_path_buf()));
        }
        Self::from_json(&std::fs::read(path)?)
    }

    /// Writes the snapshot via a sibling temp file + rename, never in place
    /// (CR-105). A process killed mid-write (OOM, SIGKILL, power loss) would
    /// otherwise leave a truncated, non-JSON file at `path`; renaming a fully
    /// written temp file into place means `path` only ever holds a complete
    /// snapshot, old or new.
    pub fn save(&self, path: &Path) -> Result<(), TabError> {
        if let Some(parent) = path.parent() {
            if !parent.as_os_str().is_empty() {
                std::fs::create_dir_all(parent)?;
            }
        }
        let bytes = serde_json::to_vec_pretty(self)?;
        let tmp_path = tmp_sibling_path(path);
        let result =
            std::fs::write(&tmp_path, &bytes).and_then(|()| std::fs::rename(&tmp_path, path));
        if result.is_err() {
            std::fs::remove_file(&tmp_path).ok();
        }
        result?;
        Ok(())
    }
}

/// A same-directory temp path to write through before renaming over `path`,
/// unique per writer so concurrent `save` calls (e.g. two refreshes racing)
/// don't clobber each other's in-flight temp file.
fn tmp_sibling_path(path: &Path) -> PathBuf {
    let file_name = path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "price-store".to_string());
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or_default();
    let unique = format!(".{file_name}.tmp.{}.{nanos}", std::process::id());
    match path.parent() {
        Some(parent) if !parent.as_os_str().is_empty() => parent.join(unique),
        _ => PathBuf::from(unique),
    }
}

/// Directory holding price snapshots: $MOE_TAB_PRICING_DIR, else $XDG_DATA_HOME/moe/tab,
/// else $HOME/.local/share/moe/tab.
///
/// Reads the override with `var_os`, not `var`, and must keep doing so: callers
/// (`resolve_store` in lib.rs) decide whether the override applies with
/// `var_os(..).is_some()`, which is `true` regardless of encoding. `var`
/// returns `Err(NotUnicode)` for a non-UTF-8 value (legal at the OS level on
/// Unix), so reading it with `var` here would silently fall through to the
/// XDG/HOME default while the caller still believes — and reports — that the
/// override won (CR-064).
pub fn pricing_dir() -> PathBuf {
    if let Some(d) = std::env::var_os("MOE_TAB_PRICING_DIR") {
        return PathBuf::from(d);
    }
    let base = std::env::var("XDG_DATA_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| {
            let home = std::env::var("HOME").unwrap_or_else(|_| ".".into());
            PathBuf::from(home).join(".local").join("share")
        });
    base.join("moe").join("tab")
}

/// The active snapshot the library reads.
pub fn current_path() -> PathBuf {
    pricing_dir().join("current.json")
}

/// The price snapshot compiled into the library — the out-of-the-box fallback used
/// when no on-disk snapshot is newer (see `lib::estimate_cost`).
pub fn embedded() -> Result<PriceStore, TabError> {
    const BYTES: &[u8] = include_bytes!("../../prices/bundled.json");
    PriceStore::from_json(BYTES)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn store() -> PriceStore {
        let mut litellm = HashMap::new();
        litellm.insert(
            "claude-opus-4-8".to_string(),
            ModelPrice {
                input: 5.0,
                output: 25.0,
                cache_read: 0.5,
                cache_write: 6.25,
                cache_write_1h: Some(10.0),
                tier_boundary: None,
                input_above: None,
                output_above: None,
                cache_read_above: None,
                cache_write_above: None,
            },
        );
        let mut namespaces = HashMap::new();
        namespaces.insert("litellm".to_string(), litellm);
        PriceStore {
            as_of: "2026-06-04".into(),
            namespaces,
        }
    }

    #[test]
    fn lookup_finds_model_in_namespace() {
        let s = store();
        assert!(s.lookup("litellm", "claude-opus-4-8").is_some());
        assert!(s.lookup("litellm", "nonsense").is_none());
        assert!(s.lookup("openrouter", "claude-opus-4-8").is_none());
    }

    #[test]
    fn save_then_load_roundtrips() {
        let dir = std::env::temp_dir().join(format!("tab-test-{}", std::process::id()));
        let path = dir.join("current.json");
        store().save(&path).unwrap();
        let loaded = PriceStore::load(&path).unwrap();
        assert_eq!(loaded, store());
        std::fs::remove_dir_all(&dir).ok();
    }

    // CR-105: save() must not write the snapshot in place — a crash mid-write
    // would leave a truncated, non-JSON file on disk. It should write to a
    // sibling temp file and rename into place, so a failed write can never
    // corrupt a previously good snapshot. Proven here by revoking the
    // directory's create/rename permission (write-in-place needs only the
    // target file's own permission bits; creating a sibling temp file needs
    // the directory's write bit) and confirming a failed save leaves the old
    // snapshot untouched rather than overwritten.
    #[cfg(unix)]
    #[test]
    fn save_is_atomic_and_preserves_old_snapshot_on_write_failure() {
        use std::os::unix::fs::PermissionsExt;

        let dir = std::env::temp_dir().join(format!(
            "tab-atomic-save-{}-{}",
            std::process::id(),
            line!()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("current.json");

        let old = store();
        old.save(&path).unwrap();
        let old_bytes = std::fs::read(&path).unwrap();

        // Lock the directory: read+execute only, no create/rename/unlink.
        let mut locked = std::fs::metadata(&dir).unwrap().permissions();
        locked.set_mode(0o555);
        std::fs::set_permissions(&dir, locked).unwrap();

        // Detect a privileged test runner (e.g. root) where permission bits
        // aren't enforced — this test's assumption wouldn't hold there.
        let probe = dir.join("probe-write-access");
        let privileged = std::fs::write(&probe, b"x").is_ok();
        std::fs::remove_file(&probe).ok();

        let mut new = store();
        new.as_of = "2099-12-31".to_string();
        let result = new.save(&path);

        // Restore permissions before asserting so cleanup always runs.
        let mut restored = std::fs::metadata(&dir).unwrap().permissions();
        restored.set_mode(0o755);
        std::fs::set_permissions(&dir, restored).unwrap();

        if privileged {
            std::fs::remove_dir_all(&dir).ok();
            eprintln!(
                "skipping save_is_atomic_and_preserves_old_snapshot_on_write_failure: \
                 running with elevated privileges, directory permissions not enforced"
            );
            return;
        }

        assert!(
            result.is_err(),
            "save() should fail cleanly (it can't create its temp file in a \
             read-only directory) rather than write through to the target"
        );
        let content_after = std::fs::read(&path).unwrap();
        assert_eq!(
            content_after, old_bytes,
            "a failed save must not touch the previous good snapshot — writing \
             directly to the target instead of via a temp file + rename left it \
             overwritten"
        );

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn load_missing_is_pricing_tables_missing() {
        let path = PathBuf::from("/nonexistent/moe-tab/current.json");
        match PriceStore::load(&path) {
            Err(TabError::PricingTablesMissing(_)) => {}
            other => panic!("expected PricingTablesMissing, got {other:?}"),
        }
    }

    #[test]
    fn pricing_dir_honors_env_override() {
        let _env = crate::test_env::env_lock();
        std::env::set_var("MOE_TAB_PRICING_DIR", "/tmp/moe-tab-x");
        assert_eq!(pricing_dir(), PathBuf::from("/tmp/moe-tab-x"));
        std::env::remove_var("MOE_TAB_PRICING_DIR");
    }

    #[test]
    fn embedded_snapshot_loads_and_has_models() {
        let s = embedded().expect("embedded snapshot parses");
        assert!(!s.as_of.is_empty(), "embedded snapshot must carry an as_of");
        assert!(
            s.lookup("litellm", "claude-opus-4-8").is_some(),
            "embedded snapshot should price a known model"
        );
    }

    #[test]
    fn embedded_snapshot_prices_the_gpt_56_family() {
        // Lookup is exact-match with no alias fallback, so every id a
        // transcript can emit must be its own key (moe-flight pins gpt-5.6-sol).
        let s = embedded().expect("embedded snapshot parses");
        for m in ["gpt-5.6", "gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"] {
            assert!(
                s.lookup("litellm", m).is_some(),
                "embedded snapshot should price {m}"
            );
        }
        let sol = s.lookup("litellm", "gpt-5.6-sol").unwrap();
        assert!((sol.input - 5.0).abs() < 1e-9);
        assert!((sol.output - 30.0).abs() < 1e-9);
        assert!((sol.cache_read - 0.5).abs() < 1e-9);
    }

    #[test]
    fn embedded_snapshot_prices_claude_opus_5() {
        // Copilot reports the bare `claude-opus-5` id; lookup is exact-match
        // with no alias fallback, so the bare key must be its own entry for
        // the copilot grid's opus column to price.
        let s = embedded().expect("embedded snapshot parses");
        let opus = s
            .lookup("litellm", "claude-opus-5")
            .expect("embedded snapshot should price claude-opus-5");
        assert!((opus.input - 5.0).abs() < 1e-9);
        assert!((opus.output - 25.0).abs() < 1e-9);
        assert!((opus.cache_read - 0.5).abs() < 1e-9);
        assert!((opus.cache_write - 6.25).abs() < 1e-9);
    }

    #[test]
    fn embedded_snapshot_bundles_litellm_and_openrouter() {
        let s = embedded().expect("embedded snapshot parses");
        assert!(
            s.namespaces.contains_key("litellm"),
            "embedded snapshot must carry the litellm namespace"
        );
        let or = s
            .namespaces
            .get("openrouter")
            .expect("embedded snapshot must carry the openrouter namespace");
        assert!(!or.is_empty(), "openrouter namespace should be non-empty");
        // OpenRouter keys are `<vendor>/<model>` — a run billed through OpenRouter
        // prices from this namespace out of the box.
        assert!(
            or.keys().any(|k| k.contains('/')),
            "openrouter keys are vendor/model form"
        );
    }
}
