import json
import os
import re
import shutil
import tempfile
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[3]
TESTDATA = REPO / "bindings" / "testdata"


@pytest.fixture()
def seeded(monkeypatch):
    d = Path(tempfile.mkdtemp(prefix="moe-tab-py-"))
    shutil.copy(TESTDATA / "prices.json", d / "current.json")
    monkeypatch.setenv("MOE_TAB_PRICING_DIR", str(d))
    yield d
    shutil.rmtree(d, ignore_errors=True)


def test_version():
    import moe_tab
    # The binding reports the native lib's crate version; derive the
    # expectation from the workspace manifest so a release bump can't strand
    # a stale literal here (v0.7.0 broke CI exactly that way).
    manifest = (REPO / "Cargo.toml").read_text()
    expected = re.search(r'^version\s*=\s*"([^"]+)"', manifest, re.M).group(1)
    assert moe_tab.version() == expected


def test_estimate_path_matches_expectations(seeded):
    import moe_tab
    est = moe_tab.estimate_path(TESTDATA / "tab-usage-mini.jsonl", dialect="tab")
    assert est.total_usd > 0.0
    assert est.pricing_as_of == "2026-06-05"
    assert isinstance(est.tokens.input, int)


def test_missing_tables_raises(monkeypatch):
    import moe_tab
    monkeypatch.setenv("MOE_TAB_PRICING_DIR", "/nonexistent/moe-tab-py-xyz")
    with pytest.raises(moe_tab.TabError) as ei:
        moe_tab.estimate_path(TESTDATA / "tab-usage-mini.jsonl", dialect="tab")
    assert ei.value.code == 1
    assert ei.value.kind == "PricingTablesMissing"


def test_refresh_rejects_garbage_as_of(seeded):
    import moe_tab
    with pytest.raises(moe_tab.TabError) as ei:
        moe_tab.refresh("Apr-2027")
    assert ei.value.code == 7
    assert ei.value.kind == "InvalidArgument"


def test_unknown_dialect_raises(seeded):
    import moe_tab
    with pytest.raises(moe_tab.TabError) as ei:
        moe_tab.estimate_path(TESTDATA / "tab-usage-mini.jsonl", dialect="banana")
    assert ei.value.code == 7
