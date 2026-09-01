---
slug: cross-stack-tracing
title: Cross-Stack Tracing, Baseline-First
idea: |
  - A skill that answers "what breaks if I change this endpoint?" and "where does
    this component's data come from?" across TC's Angular→BFF boundary, using the
    graph tools this fork actually has
status: backlog
size: S
estimate: 5-7 h
depends_on: []
blocks: []
conflicts_with: []
touches:
  - packages/core/skills/tracing-across-the-stack/
  - packages/core/skill-tiers.yaml
  - packages/core/test/metadata.test.ts
decision_needed: no
---

# Cross-Stack Tracing, Baseline-First

## Where this came from

Zak's call on 2026-09-01 was to build cross-stack tracing directly, with a
question that changed the design: **can it be written against CodeGraph alone,
without moedex?**

**Mostly yes**, and that is what makes this item small. Everything below was
measured on 2026-09-01, not assumed.

## What CodeGraph actually provides

`graph_describe_schema` and four live traces.

**The frontend→BFF hop is explicitly modelled.** `HTTP_CALLS` carries
`url_pattern`, `http_method`, `source_repo`, `target_repo`. Verified:

```
graph_trace(operation: "impact", name: "DELETE DeleteSearch",
            project: "TC.DropCatchWebApi", depth: 3)

→ deleteSavedSearch (Method) — DropCatch [hop 1, HTTP_CALLS]
  Factors: Cross-repo dependency (harder to detect breakage)
  Cross-Repo Impact: DropCatch → TC.DropCatchWebApi (HTTP_CALLS, 1 nodes)
```

That is the whole reason `traceAPIToUI` existed, working on the baseline, with a
risk band attached. This is also the part a *generic* code-search graph cannot
infer — an HTTP boundary is not a call edge — so CodeGraph is genuinely better
here than moedex, not merely adequate.

Also present and populated:

- `Component` nodes across at least seven Angular repos (SellerXUI, namebright,
  PartnerPortal, NameBright Brochure, XAngUIScaffolding, Interstellar,
  TC.CodeGraphApi)
- `Route` nodes with `http_method`, `route_template`, `handler`
- `Module`, and the `RENDERS`, `INJECTS`, `SUBSCRIBES`, `QUERIES`, `PUBLISHES`,
  `CONSUMES` edge types
- `rag_search` over `ai/kb`'s eight Angular docs for the conventions themselves

## What it does not provide, and the traps

**No NgRx roles.** There is no `Selector`, `Reducer`, `Effect`, `Action` or
`Store` node type, and no `@ApiContract`. Selectors are indexed as **`File`**
nodes — a search for `select%` returns `account.selectors.ts`, not
`selectAccount`. So the NgRx chain is not addressable by symbol.

**Inbound Angular call paths are sparse.** `graph_trace(operation: "call_path",
direction: "inbound")` on `deleteSavedSearch` at depth 4 returned *"No call paths
found."* Climbing component → effect → service is not a graph query today.

**`consumers` returns nothing where `impact` works** on the same Route. That is a
trap, not a preference, and the skill must say which to use — an agent that picks
`consumers` gets a confident empty answer.

## The shape this dictates

The skill splits **by direction**, which the wrapper skills did not:

| Question | Baseline (CodeGraph alone) | With moedex |
|---|---|---|
| "What breaks if I change this endpoint?" | Complete. `codegraph_search(label: "Route")` → `graph_trace(operation: "impact")` | `impact_analysis` as a second opinion |
| "Where does this component's data get its data?" | Partial — service→endpoint yes, component→effect→service no. Fall back to Grep on `*.selectors.ts` / `*.effects.ts` and `angular-ngrx.md`'s Discovery hints | `trace_calls` / `trace_renders` close the gap |

**Baseline-first, moedex as an upgrade** — the same pattern `retrieving-context`
established (`1a03438`), and the reason this can be a real skill rather than one
that is inert without a local daemon.

## Tier: everything, and for once the policy and the merits agree

D2 (2026-08-31) makes fork-authored skills everything-tier only. That is not a
constraint to work around here, because ARCHITECTURE.md's own criterion reaches
the same answer independently: a skill you invoke deliberately, by name, when you
already know you want it belongs in `moe-everything`. "Trace this endpoint for me"
is exactly that — unlike `retrieving-context`, whose value is firing unprompted.

So no D2 reversal is needed and none should be requested. Note the distinction
that matters, because the earlier framing of this item got it wrong: **baseline
sufficiency is not an argument for core tier.** It is an argument that the skill
*works* for everyone who has it. Those are separate axes.

## Scope boundary

**In:** one skill, `tracing-across-the-stack`, everything-tier; the two directions
above with the baseline path stated first and the moedex path marked as an
upgrade; the `impact`-not-`consumers` finding; explicit statement that the NgRx
chain is convention-matched rather than graph-queried, with the conventions cited
from `ai/kb` rather than restated; a `skill-tiers.yaml` row under `authored:`.

**Out:** porting any of the four `tc-*` skills — they call seven tools that do not
exist here (`traceSelector`, `traceAction`, `traceEffect`, `traceUIToAPI`,
`traceAPIToUI`, `traceApiContract`, `getFileContext`). Reimplementing
`getFileContext`'s trust ratings, which come from a scoring subsystem
(`ai/kb/angular-trust-scoring.md`) this repo has no access to. Any new MCP server
or tool. Restating NgRx conventions that `ai/kb/angular-ngrx.md` already covers
better — cite it. Teaching Angular, which `ai/kb!17` now does. Changing
`retrieving-context`'s routing table, though this skill should be reachable from
it once it exists.

## Verification

1. `packages/core/skills/tracing-across-the-stack/SKILL.md` exists, valid
   frontmatter, one `authored:` row with `tier: everything`, and `pnpm mint`
   regenerated before `pnpm test` — that gate order is what blocked
   `codegraph-context-layer` the first time.
2. The endpoint→UI direction is verified by running it: pick a `Route` in a BFF,
   and the skill's steps must reach the Angular-side caller with the cross-repo
   note. `DELETE DeleteSearch` in `TC.DropCatchWebApi` is a known-good subject.
3. The skill must name `impact` and warn off `consumers`. Test by following the
   skill's own instructions literally and confirming a non-empty result.
4. **A negative case, which is the one that matters:** with the `codegraph` server
   absent, the skill must degrade to Grep-on-conventions and say what it cannot
   determine, rather than stalling or reporting an empty graph answer as "no
   callers". Same house rule as `retrieving-context`.
5. No `**REQUIRED SUB-SKILL:**` marker naming anything outside
   `packages/core/skills/` — `metadata.test.ts`'s strict marker rule resolves
   every backticked token against core only.

## One thing to check first

`ai/skills/tc-test-environments` has never been read. `ai/kb` has
`dotnet-testing.md`, `angular-jest-tests.md`, `angular-cypress-e2e.md` and
`playwright.md`, so it is probably the same story as the other thirteen — but that
is a guess, and it is the last unexamined artifact from the original census. Five
minutes, before this item starts.
