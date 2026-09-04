---
name: request-review
description: Use when completing tasks, implementing major features, or before merging to verify work meets requirements
---

# Requesting Code Review

Dispatch a code reviewer subagent to catch issues before they cascade. The reviewer gets precisely crafted context for evaluation — never your session's history.

**Core principle:** Review early, review often.

## When to Request Review

**Mandatory:**
- After each task in subagent-driven development
- After completing major feature
- Before merge to main

**Optional but valuable:**
- When stuck (fresh perspective)
- Before refactoring (baseline check)
- After fixing complex bug

## How to Request

**1. Get git SHAs:**
```bash
BASE_SHA=$(git rev-parse HEAD~1)  # or origin/main
HEAD_SHA=$(git rev-parse HEAD)
```

**2. Dispatch code reviewer subagent:**

Requires `[features] multi_agent = true` in `~/.codex/config.toml`.
Spawn children with `spawn_agent {fork_turns: "none"}` for a clean
context — the default `"all"` copies your entire transcript in.
Codex 0.145+ role files under `~/.codex/agents/` attach via
`agent_type` on full-history forks; isolated forks are the default for
context hygiene. Resume an implementer with `followup_task` rather
than spawning a fresh one — it delivers your message and transparently
reloads an evicted child. V2 has no `close_agent`; finished children
are evicted automatically. Set `model` AND `reasoning_effort`
explicitly on every spawn — `model` alone silently resets effort to
that model's default. Never copy a model name into `spawn_agent`
without checking it against your current spawn allowlist.


Fill the template at [code-reviewer.md](code-reviewer.md) and dispatch it as the reviewer.

**Placeholders:**
- `{DESCRIPTION}` - Brief summary of what you built
- `{PLAN_OR_REQUIREMENTS}` - What it should do
- `{BASE_SHA}` - Starting commit
- `{HEAD_SHA}` - Ending commit

**3. Act on feedback:**
- Fix Critical issues immediately
- Fix Important issues before proceeding
- Note Minor issues for later
- Push back if reviewer is wrong (with reasoning)

## Example

```
[Just completed Task 2: Add verification function]

You: Let me request code review before proceeding.

BASE_SHA=$(git log --oneline | grep "Task 1" | head -1 | awk '{print $1}')
HEAD_SHA=$(git rev-parse HEAD)

[Dispatch code reviewer subagent]
  DESCRIPTION: Added verifyIndex() and repairIndex() with 4 issue types
  PLAN_OR_REQUIREMENTS: Task 2 from docs/moe/plans/deployment-plan.md
  BASE_SHA: a7981ec
  HEAD_SHA: 3df7661

[Subagent returns]:
  Strengths: Clean architecture, real tests
  Issues:
    Important: Missing progress indicators
    Minor: Magic number (100) for reporting interval
  Assessment: Ready to proceed

You: [Fix progress indicators]
[Continue to Task 3]
```

## Common Rationalizations

| Excuse | Reality |
|--------|---------|
| "I'll just review the diff myself instead of dispatching a reviewer" | You're the coordinator — reviewing the diff inline burns the context window you need to keep driving the work. Dispatch a reviewer subagent: the diff and the evaluation live in its context, and only the findings come back to you. |
| "The reviewer needs my whole session history to understand the change" | Hand it precisely crafted context, never your session's history. That keeps the reviewer on the work product, not your thought process. |

## Red Flags

**Never:**
- Skip review because "it's simple"
- Ignore Critical issues
- Proceed with unfixed Important issues
- Argue with valid technical feedback

**If reviewer wrong:**
- Push back with technical reasoning
- Show code/tests that prove it works
- Request clarification

See template at: [code-reviewer.md](code-reviewer.md)

## References

Neither is required reading. Reach for one when the review needs a vocabulary or a
depth setting rather than a fresh judgement call.

- [references/fowler-smells.md](references/fowler-smells.md) — named code smells, so
  a reviewer can say which one rather than "this feels wrong"
- [references/security-asvs-levels.md](references/security-asvs-levels.md) — maps
  OWASP ASVS L1/L2/L3 to how hard to look: what a reviewer must mitigate versus may
  accept with rationale, and how deeply to verify a claimed mitigation. Imported
  from `open-gsd/gsd-core` (MIT)
