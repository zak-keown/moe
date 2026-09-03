# Parallel Adversarial Review (PAR)

A shared reference for all skills that dispatch reviewers. Every evaluative gate in the iterative-development plugin uses PAR. There is no opt-out.

## The Pattern

When dispatching ANY reviewer (scope reviewer, spec-compliance reviewer, code-quality reviewer, auditor):

1. **Dispatch TWO reviewer subagents simultaneously** with identical inputs. Neither reviewer sees the other's work.

   Use `invoke_subagent` with a built-in `TypeName`: `self` for work that
   needs the full tool surface or `research` for read-only investigation.
   Pass a complete brief that stands on its own. Dispatch independent calls
   together when the client supports concurrent tool calls; otherwise use
   the skill's sequential fallback. Keep dependent steps sequential.


2. **Wrap each reviewer's prompt** with the competitive framing from `par-reviewer-wrapper.md` (in this directory). The wrapper adds the scoring incentive on top of the reviewer's domain-specific prompt.

3. **Wait for both reviewers to return.**

   A normal `invoke_subagent` call returns the subagent's report directly;
   there is no separate polling step. Read that report rather than
   re-deriving its findings, then verify load-bearing claims before treating
   them as final. If a particular client adds background execution, use its
   documented status mechanism rather than inventing a poll loop.


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
| Pre-iteration scope review | Scope reviewer | `running-an-iteration` (Plan 4) |
| Per-task spec compliance | Spec-compliance reviewer | `implementing-tasks` (Plan 5) |
| Per-task code quality | Code-quality reviewer | `implementing-tasks` (Plan 5) |
| Per-sprint audit | Auditor | `auditing-progress` (this plan) |

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
