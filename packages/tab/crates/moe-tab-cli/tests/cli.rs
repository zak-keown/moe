use assert_cmd::Command;
use std::fs;

#[test]
fn estimate_json_on_tab_fixture() {
    let tmp = tempfile::tempdir().unwrap();
    let sample = include_str!("../../moe-tab-core/tests/fixtures/litellm-sample.json");
    let tab_usage = include_str!("../../moe-tab-core/tests/fixtures/tab-usage-mini.jsonl");
    // Seed a price snapshot without network: normalize the sample sheet via moe-tab-core.
    let store_json =
        moe_tab_core::pricing::refresh::normalize_litellm(sample.as_bytes(), "2026-06-04").unwrap();
    let dir = tmp.path().join("tab");
    fs::create_dir_all(&dir).unwrap();
    store_json.save(&dir.join("current.json")).unwrap();

    let transcript = tmp.path().join("usage.jsonl");
    fs::write(&transcript, tab_usage).unwrap();

    Command::cargo_bin("moe-tab")
        .unwrap()
        .env("MOE_TAB_PRICING_DIR", &dir)
        .args([
            "estimate",
            transcript.to_str().unwrap(),
            "--dialect",
            "tab",
            "--json",
        ])
        .assert()
        .success()
        .stdout(predicates::str::contains("\"total_usd\""));
}

#[test]
fn estimate_reports_bundled_pricing_source() {
    let tmp = tempfile::tempdir().unwrap();
    let tab_usage = include_str!("../../moe-tab-core/tests/fixtures/tab-usage-mini.jsonl");
    let transcript = tmp.path().join("usage.jsonl");
    fs::write(&transcript, tab_usage).unwrap();

    // No override + an empty XDG home -> no on-disk snapshot, so the embedded one
    // prices it and the source must be "bundled". Pointing XDG at the (snapshot-free)
    // temp dir keeps this hermetic regardless of the dev's real ~/.local/share/moe/tab.
    Command::cargo_bin("moe-tab")
        .unwrap()
        .env_remove("MOE_TAB_PRICING_DIR")
        .env("XDG_DATA_HOME", tmp.path())
        .args([
            "estimate",
            transcript.to_str().unwrap(),
            "--dialect",
            "tab",
            "--json",
        ])
        .assert()
        .success()
        .stdout(predicates::str::contains("pricing_source"))
        .stdout(predicates::str::contains("bundled"));
}

#[test]
fn estimate_tab_dialect_string() {
    let tmp = tempfile::tempdir().unwrap();
    let tab = include_str!("../../moe-tab-core/tests/fixtures/tab-usage-mini.jsonl");
    let transcript = tmp.path().join("usage.jsonl");
    fs::write(&transcript, tab).unwrap();

    Command::cargo_bin("moe-tab")
        .unwrap()
        .env_remove("MOE_TAB_PRICING_DIR")
        .args([
            "estimate",
            transcript.to_str().unwrap(),
            "--dialect",
            "tab",
            "--json",
        ])
        .assert()
        .success()
        .stdout(predicates::str::contains("claude-opus-4-8"));
}
