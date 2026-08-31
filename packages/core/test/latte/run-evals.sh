#!/bin/bash

# Stop-hook evaluation suite: 65 contrived conversations through the hook,
# 5 runs each, checking that the judge's block/allow decision matches the
# scenario's expected_decision.
#
# OPT-IN AND EXPENSIVE. 65 x 5 = 325 authenticated model calls, serially. Never
# in `pnpm test` and never in CI: `pnpm --filter @bubstack/moe-core latte:evals`.
#
# BROKEN UPSTREAM. At double-shot-latte dfe7567 this pointed at
# ../../scripts/claude-judge-continuation.sh — a directory that does not exist in
# that repo and a filename with an extension the v1.2.0 rename had removed. It
# cannot have run since v1.1.5, so there is no upstream pass rate to regress
# against. Establish the baseline before reading anything into a number here.
#
# MOE_LATTE_ENABLED is forced on: the hook is opt-in and exits 0 when disarmed,
# which would otherwise make every scenario report `decision: error`.
#
# Set MOE_LATTE_FAKE_CLAUDE=1 to run the harness against a stub `claude` that
# always answers should_continue:false. That verifies the plumbing (transcripts,
# event shape, decision parsing) with zero token spend; it does NOT evaluate the
# judge prompt, so expect every CONTINUE scenario to fail.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCENARIOS_DIR="$SCRIPT_DIR/scenarios"
HOOK_SCRIPT="$SCRIPT_DIR/../../hooks/claude-judge-continuation"
TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/moe-latte-evals.XXXXXX")"

export MOE_LATTE_ENABLED=1

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

# Cleanup on exit
cleanup() {
    rm -rf "$TEMP_DIR"
}
trap cleanup EXIT

if [ ! -f "$HOOK_SCRIPT" ]; then
    echo "hook script not found: $HOOK_SCRIPT" >&2
    exit 1
fi

# Optional zero-cost stub, for verifying the harness rather than the prompt.
if [ -n "${MOE_LATTE_FAKE_CLAUDE:-}" ]; then
    FAKE_BIN="$TEMP_DIR/bin"
    mkdir -p "$FAKE_BIN"
    cat > "$FAKE_BIN/claude" <<'STUB'
#!/bin/bash
cat >/dev/null
echo '{"type":"result","structured_output":{"should_continue":false,"reasoning":"stub"}}'
STUB
    chmod +x "$FAKE_BIN/claude"
    export PATH="$FAKE_BIN:$PATH"
    echo "MOE_LATTE_FAKE_CLAUDE is set: using a stub judge, no model calls."
    echo ""
fi

echo "Running stop-hook evaluation suite"
echo "================================="
echo ""

total_scenarios=0
total_passed=0
total_failed=0

for scenario_file in "$SCENARIOS_DIR"/*.json; do
    if [ ! -f "$scenario_file" ]; then
        continue
    fi

    total_scenarios=$((total_scenarios + 1))
    scenario_name=$(jq -r '.name' "$scenario_file")
    description=$(jq -r '.description' "$scenario_file")
    expected_decision=$(jq -r '.expected_decision' "$scenario_file")

    echo "Scenario: $scenario_name"
    echo "   Description: $description"
    echo "   Expected: should_continue = $expected_decision"
    echo ""

    passes=0
    fails=0

    for run in {1..5}; do
        # Create transcript file from scenario (NDJSON - one message per line)
        transcript_file="$TEMP_DIR/transcript-$total_scenarios-$run.json"
        jq -c '.transcript[]' "$scenario_file" > "$transcript_file"

        # A per-run session id, so concurrent runs and the 3-per-300s throttle
        # cannot bleed across scenarios. Upstream hardcoded "eval-test-session"
        # for all 325 runs, which shared one throttle file.
        hook_event=$(jq -n \
            --arg transcript_path "$transcript_file" \
            --arg session_id "moe-latte-eval-$total_scenarios-$run" \
            '{
                "stop_hook_active": false,
                "transcript_path": $transcript_path,
                "session_id": $session_id
            }')

        hook_output=$(echo "$hook_event" | bash "$HOOK_SCRIPT" 2>/dev/null || echo '{"decision": "error"}')

        decision=$(echo "$hook_output" | jq -r '.decision')
        reason=$(echo "$hook_output" | jq -r '.reason // "No reason provided"')

        # block = continue, anything else = allow the stop
        hook_should_continue=false
        if [ "$decision" = "block" ]; then
            hook_should_continue=true
        fi

        if [ "$hook_should_continue" = "$expected_decision" ]; then
            passes=$((passes + 1))
            echo -e "   ${GREEN}PASS${NC} run $run (decision: $decision)"
        else
            fails=$((fails + 1))
            echo -e "   ${RED}FAIL${NC} run $run (decision: $decision, expected should_continue: $expected_decision)"
            echo "      Reason: $reason"
        fi
    done

    echo ""

    if [ $fails -eq 0 ]; then
        echo -e "   ${GREEN}Scenario PASSED${NC} (5/5 runs correct)"
        total_passed=$((total_passed + 1))
    else
        echo -e "   ${RED}Scenario FAILED${NC} ($passes/5 runs correct)"
        total_failed=$((total_failed + 1))
    fi

    echo ""
    echo "---"
    echo ""
done

echo "================================="
echo "Final Results"
echo "================================="
echo "Total scenarios: $total_scenarios"
echo -e "Passed: ${GREEN}$total_passed${NC}"
echo -e "Failed: ${RED}$total_failed${NC}"

if [ $total_failed -eq 0 ]; then
    echo ""
    echo -e "${GREEN}All scenarios passed.${NC}"
    exit 0
else
    echo ""
    echo -e "${RED}Some scenarios failed.${NC}"
    exit 1
fi
