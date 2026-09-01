---
slug: tc-domain-skills-port
title: The Four TC-Domain Skills Moe Actually Lacks
idea: |
  - Port the tc-* skills `tc-standards-conformance` deferred — but only the four
    that are not duplicates of skills this fork already ships
status: backlog
size: S
estimate: 4-6 h
depends_on: []
blocks: []
conflicts_with: []
touches:
  - packages/core/skills/
  - packages/core/skill-tiers.yaml
  - packages/core/test/metadata.test.ts
decision_needed: yes
---

# The Four TC-Domain Skills Moe Actually Lacks

## Why this item exists

`tc-standards-conformance` shipped narrower than its backlog contract. The plan
called for porting **17 `tc-*` skills** into `packages/core/skills/`, adding 17
rows to `skill-tiers.yaml`, and bumping `LEAN_TIER_COUNT`. The implementer skipped
all of it — defensibly, because plan-verify had flagged four hard problems
including `gitlab.tcdevops.com` access — and its close-plan said to "log a new
backlog item for the port."

**Nobody logged it.** From 2026-08-31 to 2026-09-01 this was the only piece of
identified scope tracked in no ledger. It is written down now so the decision
below is made deliberately rather than by omission.

Cited by slug, not by the `W##P##` filename prefix — the prefix moves whenever
the backlog is re-waved, and `W05P01` was already taken by an unrelated item in
flight.

## The census that changes the item

Read 2026-09-01 with TC GitLab access, which the original plan did not have.
`ai/claude-code-platform-plugin/skills/` holds exactly **17** directories, so the
17 figure was right. What it was wrong about is what they are.

**Thirteen are `tc-`-prefixed near-duplicates of skills `@bubstack/moe-core`
already ships:**

| `ai/claude-code-platform-plugin` | Moe already has |
|---|---|
| `tc-brainstorming` | `brainstorming` |
| `tc-debugging` | `systematic-debugging` |
| `tc-executing-plans` | `executing-plans` |
| `tc-finishing-branch` | `finishing-a-development-branch` |
| `tc-git-worktrees` | `using-git-worktrees` |
| `tc-parallel-agents` | `dispatching-parallel-agents` |
| `tc-receiving-code-review` | `receiving-code-review` |
| `tc-requesting-code-review` | `requesting-code-review` |
| `tc-subagent-driven-development` | `subagent-driven-development` |
| `tc-tdd` | `test-driven-development` |
| `tc-using-platform` | `using-moe` (same bootstrap role) |
| `tc-verification` | `verification-before-completion` |
| `tc-writing-plans` | `writing-plans` |

**Porting those thirteen would undo the fork's own premise.**
`tc-standards-conformance`'s reason for existing is that *Moe replaces the sibling
fork `ai/claude-code-platform-plugin`*. Importing its methodology skills alongside
Moe's own would ship two of each, and the whole point of the collapse was going
from nineteen repositories to nine packages. This is the same call
`gsd-core-skill-import` made against 70 of 71 `gsd-*` skills, for the same reason.

What those thirteen may still hold is **TC-specific content inside a generic
skill** — `tc-git-worktrees`, read in full on 2026-09-01, prescribes the
`sc-{CARD}/{description}` branch format and TC's frontend→BFF repo mappings.
`tc-standards-conformance` already ported the branch format into
`using-git-worktrees` and `_shared/tc-conventions.md`. So the right shape for the
thirteen is **a diff against Moe's counterpart, folding in what is TC-specific
and dropping what is duplicate** — not a port.

**Four have no Moe counterpart at all.** These are the item:

- `tc-angular-for-be-devs` — Angular orientation for backend engineers
- `tc-csharp-for-fe-devs` — C# orientation for frontend engineers
- `tc-cross-stack-trace` — tracing a request across the frontend/BFF boundary
- `tc-trace-data` — tracing data through TC's stack

Plus one from the other upstream: `ai/skills/tc-test-environments`.

All five are **TC domain knowledge**, which is a different kind of content from
anything in `packages/core` today. Core holds methodology —
`test-driven-development`, `systematic-debugging`, `verification-before-completion`.
"How Angular works if you write C#" is orientation, not method.

## The decision this needs

**Where does TC domain knowledge live, if anywhere?** Three options, and the
answer is not obvious:

1. **`ai/kb` already exists for this.** `ai/tc-guide`'s README says it outright:
   "TC-wide conventions belong in `ai/kb`, not here. RAG indexes content there;
   this skill is a bootstrap, not a knowledge base." And `rag_search` reaches it —
   verified 2026-09-01, it returns `kb:git.md` and `kb:dotnet-project-docs.md` with
   re-fetchable citations. If cross-stack tracing belongs in a knowledge base, the
   knowledge base is not this repo, and `retrieving-context` already routes to it.
   **This is the recommendation.** Cost: 0 h, plus an MR against `ai/kb` if the
   content is worth keeping and is not there yet.
2. **Import as core skills.** Costs a `skill-tiers.yaml` row each under
   `authored:`, and hits D2 — fork-authored skills are everything-tier only, so
   they would not reach lean-plugin users. Also they are `from:` neither `moe` nor
   any pinned upstream, so the `from:` value set needs a sixth name, which
   `PARITY.md`'s freeze note explicitly says stays at five.
3. **A tenth package, `moe-tc`.** Rejected for `tc-governance-integration` on the
   same grounds: it buys nothing the upstream's own install does not, and adds a
   package to a nine-package architecture whose §4 reasoning is explicit.

## Scope boundary

**In:** the decision above; if option 2, the five skills plus their
`skill-tiers.yaml` rows and the `from:` value question; if option 1, an `ai/kb` MR
and nothing in this repo.

**Out:** porting the thirteen duplicates (rejected above — reopen only with a
concrete TC-specific gap that Moe's counterpart does not cover). MR and branch
conventions, already shipped by `tc-standards-conformance`. Retrieval routing,
already shipped as `retrieving-context`. Any change to `ai/skills` or
`ai/claude-code-platform-plugin` beyond a content MR.

## Verification

1. If option 1: the content is reachable via `rag_search` and nothing lands in
   this repo. Record the decision in `ARCHITECTURE.md` §2 alongside the
   `gsd-core` note, since it is the same judgement applied to a second upstream.
2. If option 2: five `authored:` rows, `pnpm mint` regenerated, `pnpm test` green
   including `metadata.test.ts`'s two-map accounting, and a `from:` value decided
   against `PARITY.md`'s freeze note rather than around it.
3. Either way: the thirteen duplicates are recorded as declined, with the reason,
   so this census does not get re-run by the next person who counts 17 skills.
