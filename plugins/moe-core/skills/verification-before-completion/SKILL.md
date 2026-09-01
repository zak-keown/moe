---
name: verification-before-completion
description: Use when about to claim work is complete, fixed, or passing, before committing or creating MRs - requires running verification commands and confirming output before making any success claims; evidence before assertions always
---

# Verification Before Completion

## Overview

**Core principle:** Evidence before claims, always.

**Violating the letter of this rule is violating the spirit of this rule.**

## The Iron Law

```
NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE
```

If you haven't run the verification command in this message, you cannot claim it passes.

## The Gate Function

```
BEFORE claiming any status or expressing satisfaction:

1. IDENTIFY: What command proves this claim?
2. RUN: Execute the FULL command (fresh, complete)
3. READ: Full output, check exit code, count failures
4. VERIFY: Does output confirm the claim?
   - If NO: State actual status with evidence
   - If YES: State claim WITH evidence
5. ONLY THEN: Make the claim

Skip any step = lying, not verifying
```

## Common Failures

| Claim | Requires | Not Sufficient |
|-------|----------|----------------|
| Tests pass | Test command output: 0 failures | Previous run, "should pass" |
| Linter clean | Linter output: 0 errors | Partial check, extrapolation |
| Build succeeds | Build command: exit 0 | Linter passing, logs look good |
| Bug fixed | Test original symptom: passes | Code changed, assumed fixed |
| Regression test works | Red-green cycle verified | Test passes once |
| Agent completed | VCS diff shows changes | Agent reports "success" |
| Requirements met | Line-by-line checklist | Tests passing |

## Goal-Backward Verification

The gate function above stops the most common failure — claiming without
running the command. It does not stop the next-most-common one: running
the wrong command. A test-suite pass is evidence for "these tests pass",
not for "the user's stated goal is met", and confusing the two is how a
green suite still ships a broken feature.

Work backward from what the user asked for:

1. **Restate the goal in a single testable sentence.** If the user said
   "make the export button work", the sentence is not "the button click
   handler runs" — it is "clicking Export downloads a file with today's
   data".
2. **Name the observation that would prove that sentence true.** Not a
   proxy. Not "the network call fires". The end-to-end artifact the user
   would look at: a downloaded CSV with today's rows, a rendered page, a
   deployed URL returning 200.
3. **Choose a verification command that produces THAT observation.** A
   unit test is evidence for a unit; the goal-observation is what needs a
   command of its own — a manual click, a curl, an end-to-end run, a
   screenshot.
4. **Only then run the local sanity checks.** Tests, lint, build. They
   are necessary and insufficient: they catch regressions in the pieces,
   but a green suite over the wrong pieces is silent.

The failure to catch: every step of the plan passed its own tests, no
step's evidence was the goal, and the finished stack does not do the
thing. Fixture: [tests/goal-backward-scenario.md](tests/goal-backward-scenario.md).

| Local-check evidence | Goal-backward evidence |
|---|---|
| "The 34 unit tests pass" | "I clicked Export and a CSV with today's 12 rows downloaded" |
| "The build exits 0" | "The deployed URL returns 200 and renders the new field" |
| "The migration ran" | "SELECT on the new column returns the expected shape" |
| "The API test passes" | "The UI that calls that API shows the new value" |

Both belong in the evidence you cite. The local checks catch regressions;
the goal-backward observation catches the wrong-thing-passing-its-tests
failure mode a green suite cannot see.

## Red Flags - STOP

- Using "should", "probably", "seems to"
- Expressing satisfaction before verification ("Great!", "Perfect!", "Done!", etc.)
- About to commit/push/MR without verification
- Trusting agent success reports
- Relying on partial verification
- Thinking "just this once"
- Tired and wanting work over
- **ANY wording implying success without having run verification**

## Rationalization Prevention

| Excuse | Reality |
|--------|---------|
| "Should work now" | RUN the verification |
| "I'm confident" | Confidence ≠ evidence |
| "Just this once" | No exceptions |
| "Linter passed" | Linter ≠ compiler |
| "Agent said success" | Verify independently |
| "I'm tired" | Exhaustion ≠ excuse |
| "Partial check is enough" | Partial proves nothing |
| "Different words so rule doesn't apply" | Spirit over letter |

## Key Patterns

**Tests:**
```
✅ [Run test command] [See: 34/34 pass] "All tests pass"
❌ "Should pass now" / "Looks correct"
```

**Regression tests (TDD Red-Green):**
```
✅ Write → Run (pass) → Revert fix → Run (MUST FAIL) → Restore → Run (pass)
❌ "I've written a regression test" (without red-green verification)
```

**Build:**
```
✅ [Run build] [See: exit 0] "Build passes"
❌ "Linter passed" (linter doesn't check compilation)
```

**Requirements:**
```
✅ Re-read plan → Create checklist → Verify each → Report gaps or completion
❌ "Tests pass, phase complete"
```

**Agent delegation:**
```
✅ Agent reports success → Check VCS diff → Verify changes → Report actual state
❌ Trust agent report
```

## When To Apply

**ALWAYS before:**
- ANY variation of success/completion claims
- ANY expression of satisfaction
- ANY positive statement about work state
- Committing, MR creation, task completion
- Moving to next task
- Delegating to agents

**Rule applies to:**
- Exact phrases
- Paraphrases and synonyms
- Implications of success
- ANY communication suggesting completion/correctness

## How this is watched

The `moe-completion-evidence` Stop hook (default-on) reads the transcript
window **for this turn only** — bounded by the last human-user entry, not a
`type:"user"` tool-result row — and writes an audit record to the current Git
worktree's `.audit/`. If it sees a completion-claim phrase in this turn's
assistant text with no verification command in this turn's tool_uses, the
record carries a warning and stderr says so. The hook never blocks a stop; it
makes the silence falsifiable. Set `MOE_EVIDENCE_DISABLED=1` to opt out, or
`MOE_EVIDENCE_HOME=1` to use `$HOME/.claude/moe/audit/<repo>/` instead.
