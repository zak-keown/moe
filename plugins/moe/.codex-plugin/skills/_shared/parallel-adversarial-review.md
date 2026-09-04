# Parallel Adversarial Review (PAR)

A shared reference for all skills that dispatch reviewers. Every evaluative gate in the iterate plugin uses PAR. There is no opt-out.

## The Pattern

When dispatching ANY reviewer (scope reviewer, spec-compliance reviewer, code-quality reviewer, auditor):

1. **Dispatch TWO reviewer subagents simultaneously** with identical inputs. Neither reviewer sees the other's work.

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


2. **Wrap each reviewer's prompt** with the competitive framing from `par-reviewer-wrapper.md` (in this directory). The wrapper adds the scoring incentive on top of the reviewer's domain-specific prompt.

3. **Wait for both reviewers to return.**

   `wait_agent` is an event subscription, not a poll: a long wait wakes
   the instant a child produces mailbox activity, at the same latency as
   a short one. Short-timeout polls buy nothing and cost a tool call and
   a context rebill each time — in measured sessions roughly two-thirds
   of them timed out for nothing. While you still have local work, do not
   wait at all; a completed child's final answer is pushed into your
   mailbox and arrives with your next turn. When genuinely idle with
   children outstanding, wait in bounded stretches of 300000-600000ms
   (5-10 minutes); after each stretch, post one status line, run
   `list_agents`, and chase any child that finished without reporting.
   Never stack polls shorter than five minutes — completion mail cannot
   wake an idle controller on its own, so covering that idle window is
   `wait_agent`'s only job.


4. **Aggregate findings:**
   - **Same issue found by both reviewers** → one finding, high confidence
   - **Issue found by only one reviewer** → separate finding, lower confidence but still actionable
   - **Severity disagreement** (Reviewer A says "critical", B says "minor") → always take the more severe assessment, always fix it. No threshold, no escalation, no negotiation.

5. **Pass aggregated findings** to the implementer (or the roadmap author for scope reviews, or the backlog for audits).

6. **On re-review after fixes:** dispatch a fresh parallel adversarial pair. No state carries between review iterations.

## Key Rules

- **PAR is always-on.** No per-gate opt-out. Every evaluative gate uses paired reviewers.
- **The scoring is psychological.** The "5 points" framing is a prompt-level trick to pressure thoroughness. There is no actual point tracking, no scoreboard, no persistent state. Do not build scoring infrastructure.
- **Single model for now.** Both reviewers use the same model. Multi-model PAR is future work.
- **Severity disagreement → take the worst, fix it.** No thresholds. No human escalation for severity disagreements.

## Where PAR Applies

| Gate | Reviewer role | Skill that dispatches |
|---|---|---|
| Pre-iteration scope review | Scope reviewer | `run-iteration` (Plan 4) |
| Per-task spec compliance | Spec-compliance reviewer | `implement-tasks` (Plan 5) |
| Per-task code quality | Code-quality reviewer | `implement-tasks` (Plan 5) |
| Per-sprint audit | Auditor | `audit-progress` (this plan) |

## Single-Agent Fallback

If subagent dispatch is unavailable (session policy, runtime limits, or tool restrictions):

1. Perform the first review pass yourself, using the same domain-specific prompt
2. Commit the findings, then perform a second pass with the explicit instruction: "Find issues the first review missed. Score 5 points for each new finding."
3. Aggregate both passes as if they were parallel reviewers
4. When reviewing code, use `git diff HEAD` AND `git ls-files --others --exclude-standard` to cover both tracked changes and new untracked files — `git diff` alone misses new files

This fallback is weaker than true PAR (same model, sequential, no sampling variance) but maintains the adversarial structure. Use it only when parallel dispatch is genuinely impossible.

## Where PAR Does NOT Apply

- Implementer subagents (doers, not evaluators)
- Implementer self-review (internal discipline)
- Extraction subagents (reading spec, not reviewing)
- Aggregation (mechanical merge, not evaluative)
