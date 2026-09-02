#!/usr/bin/env bash
# CR-011 regression: run-evals.sh must not score a hook fall-through (missing
# claude binary, timeout, crash, ...) as if it were a genuine judge verdict.
#
# Fast and network-free: runs the real harness against the real 65 scenarios,
# but with `claude` absent from PATH, so every hook invocation falls through
# immediately at the `command -v claude` check — no model calls, no per-run
# cost. This is exactly the failure mode CR-011 describes (any cause that
# makes `claude` unusable), reproduced with the cheapest cause available.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUN_EVALS="$SCRIPT_DIR/run-evals.sh"

passed=0
failed=0
pass() { echo "  PASS: $1"; passed=$((passed + 1)); }
fail() { echo "  FAIL: $1"; echo "    $2"; failed=$((failed + 1)); }

# A minimal PATH holding every tool run-evals.sh / the hook actually shells
# out to, deliberately excluding `claude`.
FAKE_BIN="$(mktemp -d)"
trap 'rm -rf "$FAKE_BIN"' EXIT
for tool in bash cat mkdir rm date grep jq timeout env sh dirname mktemp \
            basename sed cut pwd tr sleep kill wc ps; do
  real="$(command -v "$tool" 2>/dev/null || true)"
  [ -n "$real" ] && ln -sf "$real" "$FAKE_BIN/$tool"
done

echo ""
echo "--- run-evals.sh: fall-through handling (claude absent from PATH) ---"

raw_output="$(env -i PATH="$FAKE_BIN" HOME="$HOME" TMPDIR="${TMPDIR:-/tmp}" \
  bash "$RUN_EVALS" 2>&1)"
status=$?
# Strip ANSI color codes so string assertions don't have to account for them.
output="$(printf '%s' "$raw_output" | sed 's/\x1b\[[0-9;]*m//g')"

if [ "$status" -ne 0 ]; then
  pass "exits non-zero rather than reporting a clean run"
else
  fail "exits non-zero rather than reporting a clean run" "got exit 0"
fi

if echo "$output" | grep -q "Aborting:.*fall-through errors exceeds the threshold"; then
  pass "aborts early once fall-through errors exceed the threshold"
else
  fail "aborts early once fall-through errors exceed the threshold" \
       "no abort message found in output"
fi

if echo "$output" | grep -Eq "^Passed: .*[1-9]"; then
  fail "never blesses a fall-through as a passing judge verdict" \
       "found a nonzero Passed count: $(echo "$output" | grep '^Passed:')"
else
  pass "never blesses a fall-through as a passing judge verdict"
fi

if echo "$output" | grep -q "Scenario PASSED"; then
  fail "never prints Scenario PASSED for a scenario that only saw fall-throughs" \
       "found a 'Scenario PASSED' line"
else
  pass "never prints Scenario PASSED for a scenario that only saw fall-throughs"
fi

if echo "$output" | grep -q "ERROR run 1 (fall-through, not a judge verdict: claude CLI not found on PATH)"; then
  pass "reports the fall-through reason explicitly"
else
  fail "reports the fall-through reason explicitly" "reason line not found in output"
fi

echo ""
echo "--- Results: $passed passed, $failed failed ---"
if [ $failed -gt 0 ]; then
  exit 1
fi
