---
slug: verification-split-and-firing-rate
title: Verification Split In Two, Plus A Firing-Rate Counter
idea: |
  - Verification, split in two: let the harness capture the evidence and keep the
    judgment in prose. Count which skills actually fire while we are in there.
status: done
size: L
estimate: 7-10 h
depends_on: [DO-NOW-1, DO-NOW-3]
blocks: []
conflicts_with: [tiered-workflow-naming, native-renderers, skill-set-fidelity-refactor, deterministic-task-dag]
touches:
  - packages/core/hooks/hooks.json
  - packages/core/hooks/moe-completion-evidence
  - packages/core/skills/verification-before-completion/SKILL.md
  - packages/core/test/metadata.test.ts
  - packages/core/README.md
  - .gitattributes
  - .gitignore
decision_needed: no
---

# Verification Split In Two, Plus A Firing-Rate Counter

*(All citations are to `~/Code/moe`, the Superpowers fork, except where
`~/.claude/moe-core` is named explicitly — that is the installed artifact of an
older, deleted Moe repo and a different project. `~/Code/tools/moe` was not read
for this doc.)*

## Completion repair (2026-09-01)

The hook now defaults to a gitignored repository-local `.audit/`, with a key that
distinguishes linked worktrees. `MOE_EVIDENCE_HOME` is the explicit escape for a
sensitive repository. The "completion evidence behavior" suite uses temporary
Git repositories and transcripts to prove the human/tool-result boundary,
command/exit/output capture, evidence-free warning, session counter, skill-ID
deduplication and path behavior. The historical home-directory default and
static-only test gap are closed.

## The idea

> Verification, split in two: let the harness capture the evidence and keep the
> judgment in prose. Count which skills actually fire while we are in there.

`verification-before-completion` mixes two functions. One is mechanical — did the
command actually run, and what was its exit code. One is judgment — does the
result achieve what the spec said. Today the model performs both, which means the
mechanical half is model-attested for no reason, and the judgment half is one
line deep.

## Settled decisions

Recorded in ARCHITECTURE.md §2 and PARITY.md on 2026-08-31, from the panel-debate
review. This item is the work those decisions create.

1. **Silent failure is the test for a deterministic trigger.** A miss on
   `verification-before-completion` yields a false completion claim and no other
   signal. It is the only skill in the tree that qualifies today.
2. **The audit half captures; it does not re-run.** The report this review
   started from proposed a hook that runs the tests. Rejected: this repo's suite
   is 1,420 tests, and the harness *already ran* whatever was run. The defect is
   that only the model's prose about the run reaches the claim.
3. **The behavior half is enriched, not shrunk** — with goal-backward
   verification, because a hook can enumerate what changed and can never
   enumerate what should have changed.
4. **Firing rate is the tiebreaker for tier, trigger and removal**, and it rides
   the same transcript parse.

## Why it matters

Two things follow from having no mechanical evidence floor.

**A false completion claim is unfalsifiable after the fact.** Every other skill's
miss leaves a trace — a skipped `brainstorming` shows up as unapproved work in
the next message, a skipped `dispatching-parallel-agents` shows up as slower
serial execution. A skipped verification shows up as nothing, and the transcript
that could prove otherwise is discarded at session end.

**And the one hook in the tree spends the right plumbing in the wrong
direction.** `hooks/claude-judge-continuation` fires on `Stop`, receives the
event JSON and `transcript_path`, can block with
`{"decision": …, "reason": …}`, keeps state under `$HOME/.claude/moe/latte`, and
is gated by `MOE_LATTE_ENABLED` with a default of off. What it does with all of
that is ask a cheap model to read the transcript and guess whether work is done —
a model judging a model's prose about its own work. Roughly 80% of the mechanism
this item needs already exists, pointed at the one design the review names as a
governance defect.

## Current state

- **`verification-before-completion`** (120 lines, `tier: core`) is entirely
  prose. Its Iron Law is "NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION
  EVIDENCE", enforced by four rationalization tables and nothing else.
- **It already claims the goal-backward territory, twice, one line each.** The
  Common Failures table has `Requirements met | Line-by-line checklist |` *not
  sufficient:* `Tests passing`; Key Patterns has ❌ `"Tests pass, phase
  complete"`. The assertion is there. The method is not.
- **`auditing-progress`** is the nearest existing thing and is not it: it audits
  evidence quality at the seam for the `iterative-development` cluster
  (`from: iterative-development`, `tier: everything`), so it is neither
  goal-backward nor reachable from the everyday spine.
- **No `.audit/`, no pre-commit config, no CI job wired to completion.**
  `.gitlab-ci.yml` has `lint` / `typecheck` / `test` / `build` / `plugins` /
  `tab` / `proof`; none of them is per-claim evidence.
- **Skill invocation is already a tool call.** `using-moe:16` — "Every OTHER
  skill you reach through the Skill tool" — so the transcript records firing
  deterministically. `using-moe` itself is exempt by construction: it is mint's
  bootstrap target and forbids self-invocation.

## Prerequisites

**DO-NOW-1** merges the `import/packages-core` worktree these files land in.
**DO-NOW-3** generates `/plugins/`, which is how a hook in
`packages/core/hooks/` reaches anyone at all. **Not DO-NOW-2:** no new skill and
no new tier entry — Part B edits a skill that is already `tier: core`.

## Proposed approach

### Part A — the audit half: a second Stop hook

`packages/core/hooks/moe-completion-evidence`, registered as a second `Stop`
entry in `hooks/hooks.json` beside the existing one.

1. **Parse, do not run.** Read `transcript_path`, walk the turn's tool calls, and
   match Bash invocations against the project's test/build/lint commands
   (`package.json` scripts, plus `pnpm check` per `contributing-flow-docs`).
2. **Record command, exit code, and output tail** to `.audit/`, keyed by session
   and turn. This is the deterministic artifact: its source is the harness's own
   record, not a summary of it.
3. **Warn, do not block, when a completion claim has no matching evidence this
   turn.** Mirror the existing hook's discipline exactly — every fall-through
   there allows the stop, and each says *which* fall-through it was, which is the
   fork's own improvement over upstream's silence.
4. **Node, not bash.** This is a new executable, so `installer-hq-dx`'s decision
   1 applies: crew's `docs/history/windows-hooks.md` records that bash+`.cmd`
   polyglot hooks failed on Windows and that the fix was to rewrite them as node
   programs. Extensionless filename per `run-hook.cmd:7-9`; `eol=lf` in
   `.gitattributes` per `installer-hq-dx` step 5.
5. **Env var, default, and a test.** Follow the `MOE_LATTE_ENABLED` pattern —
   `${VAR:-}`, read once, asserted in `metadata.test.ts` — but see open question
   3 on which way the default should point. This hook makes no model call and
   costs a file read, so the argument that made latte opt-in does not transfer.

### Part B — the behavior half: goal-backward verification

A new section in `verification-before-completion/SKILL.md`, enriching the two
lines that already assert it. Sourced from
`~/.claude/moe-core/references/verify-mvp-mode.md:52-62`, rewritten to drop the
phase/UAT framing that has no counterpart here. Four elements:

1. **Source the must-haves from the goal, not the task list.** The artifact
   already exists: `writing-plans:63` **Goal:** and `:68-69` **Spec:** — "the
   plan argues from the spec, so the spec travels with it; executors read both".
2. **One observable evidence pointer per must-have**, as `file:line`. Borrow the
   upstream table shape: Step | Expected | Evidence | Status.
3. **The three rejections, kept as rejections:** lead-with-technical-checks,
   schema-as-feature, and — the one the hook can never catch — "skip the user
   flow because the test passed. The unit test passing in CI is not evidence that
   the user flow works."
4. **State the direction explicitly.** Enumerate from the goal down, never from
   the diff up. Verifying the diff tells you what you did; only verifying the
   goal finds what is missing.

**This owes an Iron Law test.** `writing-skills:374-387` binds edits — "Not for
'just adding a section'" — so `testing-skills-with-subagents.md` is the
procedure, and the observable is whether a subagent enumerates from the goal or
from its own diff.

**Provenance, unresolved and not to be guessed.** The chain is GSD-core
(`open-gsd/gsd-core@996196f`, MIT) → an older, deleted Moe repo →
`~/.claude/moe-core`. Within that artifact the method is credited to "the
existing `moe-verifier` agent's goal-backward methodology"
(`verify-mvp-mode.md:56`), which points at Moe lineage rather than GSD lineage.
`gsd-core-skill-import` owns the census question; PARITY.md's freeze carve-out
means attribution may be recorded either way.

### Part C — the firing-rate counter

Same event, same file, same parse. Count `Skill` tool invocations per session and
append to `.audit/`.

- **Zero firing is decisive** — dead weight, or a trigger that never fires.
- **High firing proves nothing**, because invocation is not compliance. This is a
  removal signal, not a keep signal.
- **Run it per harness.** `runtime-pruning` decides which of mint's targets
  survive and never asks whether the skill set works on the weaker ones; Codex,
  Kimi, OpenCode, Pi and Hermes run whatever model the user configures. This is
  the instrument for that question.
- **It answers a question already on the record.** `moe-tone-and-branding` states
  one falsifiable flip condition — if `writing-clearly-and-concisely` measurably
  under-fires on README and MR work, a second trigger earns its keep. The counter
  settles it.

## Scope boundary

**In:** the Stop hook, the `.audit/` writer, the goal-backward section and its
subagent test, the counter, their tests, and the `.gitattributes` / `.gitignore`
lines.

**Out:** retiring `claude-judge-continuation` (open question 4). A pre-commit
config — nothing in this repo has one and adding the framework is its own item.
Any CI job that gates on `.audit/` contents; capture first, gate later, if ever.
The per-tier skill compilation the review's cost-tier panel recommended —
rejected in ARCHITECTURE.md §2, and both polarities already ship to everyone.

## Decisions (2026-08-31)

**Q4 — Zak: KEEP BOTH.** `claude-judge-continuation` is not retired. The
deterministic `.audit/` record answers *whether evidence exists*; the judge assesses
*whether the work is actually complete*. Those are different questions, and this
doc's own three-rules framing is the argument: every catch splits into a
mechanizable half and a judgment half, and the judgment half cannot be mechanized.
Retiring the judge because the mechanical half now exists would be exactly the
error that framing warns against. It ships off by default and stays that way.

**Q1, Q2, Q3, Q5 — taken on the doc's own recommendations, by the orchestrator,
and all cheap to reverse:**

- **Q1 `.audit/` is repo-local and gitignored by default.** The evidence should
  travel with the work; a completion claim is about *this* branch. `$HOME` would
  make the default record ambiguous across worktrees, and this repo runs every
  wave in a worktree — the same property that broke `dogfood.test.ts`. A named,
  explicit escape may route sensitive-repository evidence to the home store.
- **Q2 warn, do not block.** A false block on legitimate work is the failure mode
  that gets a hook disabled permanently, and a disabled hook catches nothing.
- **Q3 default on.** The latte hook is off because it spends a model call and
  overrides the agent's judgment; this one does neither.
- **Q5 per-session files, with the aggregate derived from them.** Auditability is
  the property that cannot be reconstructed later; a counter can always be
  recomputed from the files, but the files cannot be recovered from a counter.

*The original questions, kept as written:*

1. **Where does `.audit/` live** — repo-local and gitignored, or
   `$HOME/.claude/moe/audit/` following the latte hook's precedent? Repo-local
   makes the evidence travel with the work; `$HOME` keeps a working tree clean.
2. **Warn or block** on a completion claim with no evidence? Recommendation:
   warn. A false block on legitimate work is the failure mode that gets a hook
   disabled permanently.
3. **Default on or off?** The latte hook is off because it spends a model call and
   overrides the agent's own judgment. This one does neither. Recommendation: on.
4. **Does `claude-judge-continuation` get retired** once evidence is captured
   deterministically? Asking a model whether work is done is answering a question
   the `.audit/` record now has data for.
5. **Per-session files or one aggregate counter?** Aggregate is what makes firing
   rate readable; per-session is what makes it auditable.

## Effort

| Part | Work | Estimate |
|---|---|---|
| A | Hook, transcript parse, `.audit/` writer, Windows path, env var + test | 4-5 h |
| B | Goal-backward section, three rejections, table shape, Iron Law subagent test | 2-3 h |
| C | Counter (rides A's parse), aggregate format | 1-2 h |

Total **7-10 h**. Part B is independently shippable and does not need A.

## Verification required before this ask is complete

- The hook fires on `Stop`, and a session that ran `pnpm test` leaves a
  `.audit/` record naming the command, the real exit code, and an output tail.
- A session that claims completion with no test run leaves a warning, and the
  stop still completes.
- On win32 the hook runs with no `bash` on `PATH` (the failure mode
  `run-hook.cmd:37-39` documents for the polyglot path).
- `metadata.test.ts` asserts the new setting's default, matching the assertion
  that already covers `MOE_LATTE_ENABLED`.
- The subagent test for Part B shows a measurable shift toward goal-sourced
  enumeration, per `testing-skills-with-subagents.md`.
- The counter's output for one real working session is inspected by hand once
  before anything is concluded from it.
