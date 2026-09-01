---
slug: tc-domain-skills-port
title: The 17 Deferred tc-* Skills — A Census And Its Three Outcomes
idea: |
  - Port the tc-* skills `tc-standards-conformance` deferred — but only the four
    that are not duplicates of skills this fork already ships
status: resolved
size: S
estimate: 4-6 h
depends_on: []
blocks: []
conflicts_with: []
touches:
  - packages/core/skills/
  - packages/core/skill-tiers.yaml
  - packages/core/test/metadata.test.ts
decision_needed: no
---

# The 17 Deferred `tc-*` Skills — A Census And Its Three Outcomes

## Resolved 2026-09-01

**Nothing from these 17 skills lands in this repo.** Kept because the census is
the durable part: the next person to count 17 skills in
`ai/claude-code-platform-plugin` should read this instead of re-running it.

| Group | Outcome |
|---|---|
| 13 near-duplicates of skills this fork ships | **Declined.** Porting them would undo the premise of `tc-standards-conformance`, which exists because Moe *replaces* that fork. |
| 3 dispatch wrappers over 7 tools that do not exist here | **Declined as ports.** The capability they reached for became `cross-stack-tracing`, built against CodeGraph instead. |
| 1 piece of real content — the C#→Angular concept mapping | **Sent to `ai/kb`**, MR `ai/kb!17`. That corpus is what `rag_search` indexes, so a doc there reaches every TC engineer; a Moe skill reaches only Moe installs. |

The title was wrong for most of this item's life, and so was its framing. It
called all four "TC domain knowledge" and asked where knowledge should live. Three
of the four turned out not to be knowledge at all — they were four-step
instructions to call `traceSelector` and explain the output. **Reading the
artifacts changed the question**, which is the reason to read them before
recommending a placement.

One loose end: `ai/skills/tc-test-environments` was never read. Carried into
`cross-stack-tracing` as a five-minute precondition.

## Why this item existed

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

**Four have no Moe counterpart** — and having now read all four in full, they are
not what this section first claimed.

- `tc-cross-stack-trace` — Angular selector → NgRx → BFF controller → gateway
- `tc-trace-data` — "where does this data come from?"
- `tc-angular-for-be-devs` — C#→Angular concept mapping
- `tc-csharp-for-fe-devs` — the reverse orientation

Plus `ai/skills/tc-test-environments`, which has not been read.

**Three of the four are dispatch wrappers over tools this fork does not have.**
`tc-trace-data` in its entirety is: ask which selector they mean → call
`traceSelector` → explain the chain → call `getFileContext` for trust ratings.
`tc-cross-stack-trace` is the same shape around `traceUIToAPI` / `traceAPIToUI`.
Even `tc-angular-for-be-devs` ends by telling the agent to run `traceSelector`.
Between them they call **seven** tools that belong to the platform plugin:
`traceSelector`, `traceAction`, `traceEffect`, `traceUIToAPI`, `traceAPIToUI`,
`traceApiContract`, `getFileContext`. Ported as-is, they instruct an agent to
call tools that do not resolve.

**Rewriting them against our tools is authoring, not porting.** moedex has
`trace_calls`, `trace_consumers`, `trace_renders`, `trace_queries` and
`impact_analysis` — comparable as general graph tools, but `traceSelector` is not
a generic call-graph walk. It encodes the NgRx pipeline shape (Selector → Reducer
→ Effect → Service → `@ApiContract` → endpoint). Reconstructing that means
teaching the agent the pipeline. And `getFileContext`'s trust ratings come from a
scoring subsystem (`ai/kb/angular-trust-scoring.md`) this repo has no access to.

**A harder blocker for the core placement specifically:** moedex is the *optional
addon*, not the baseline — that is the routing decision `retrieving-context`
shipped (`1a03438`). A skill whose every step calls a tool that exists only behind
the optional backend cannot be a core skill; it would be inert for anyone without
the daemon running.

**The one piece of substantive unique content** is `tc-angular-for-be-devs`'s
concept-mapping table: Controller ≈ Component + Effect, Repository ≈ NgRx Store,
DTO ≈ `@ApiContract`, `Response<T>` ≈ `DataState<T>`, Autofac DI ≈ `@Injectable()`.
That is genuinely additive and genuinely good.

## The reach asymmetry, measured

`ai/kb` **is** the corpus CodeGraph's `rag_search` indexes (Zak, 2026-09-01) — 31
documents including eight Angular and six .NET.

Checked the other direction on 2026-09-01: **this repo is not in the corpus.** A
`rag_search` for Moe's own vocabulary returns `ai/moe`'s README (the superseded
2026-05 attempt, indexed as a `repository_readme`) and nothing from `Zak/moe`.

So the two placements have different audiences, not just different filing:

| | `ai/kb` | a Moe skill |
|---|---|---|
| Reachable by | any TC engineer, any agent with CodeGraph | the ~20 people who installed the Moe plugin |
| Retrievable | yes, `rag_search` | no — not indexed |
| Offline | no (needs VPN + PAT) | yes, on disk |
| Resident cost | zero until searched | description resident every session |
| Maintained by | whoever owns the eight Angular docs | this fork |

The offline column is not hypothetical: CodeGraph was `ENOTFOUND` at the start of
the 2026-09-01 session and `origin` was unreachable for 45 commits.

**That reframes the criterion.** Not "is this knowledge or method" — the original
framing in this doc, which was wrong — but **does it need to work offline, and is
its audience TC engineers or Moe users?** An orientation doc read once when
switching stacks is a no on the first and "TC engineers" on the second.

## The decision this needed — answered

Zak, 2026-09-01. **The mapping table goes to `ai/kb`** (option 1 below, shipped as
MR `ai/kb!17`). **The trace capability gets built** against CodeGraph rather than
ported — his question "is it possible to write it against just the CodeGraph
tools?" is what produced the baseline-first design now recorded in
`cross-stack-tracing`. The answer was mostly yes: `HTTP_CALLS` carries
`source_repo`/`target_repo`, so the endpoint→UI direction is complete on the
baseline; the NgRx chain is not addressable by symbol and falls back to
convention-matching.

The options as they stood are kept below, because the reasoning against 2 and 3
still applies to any future proposal to vendor TC content into `packages/core`.

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
