---
slug: codegraph-context-layer
title: Context Routing For CodeGraph, Moedex And Memory
idea: |
  - Context engineering layer between CodeGraph+Moedex and the LLM using Moe
status: done
size: M
estimate: 7-9 h
depends_on: [DO-NOW-1, DO-NOW-2, DO-NOW-3, skill-set-fidelity-refactor]
blocks: []
conflicts_with: [tiered-workflow-naming, gsd-core-skill-import]
touches:
  - packages/core/skills/retrieving-context/
  - packages/core/agents/
  - packages/core/skill-tiers.yaml
  - packages/core/mint/moe-core.yaml
decision_needed: yes
---

# Context Routing For CodeGraph, Moedex And Memory

## The idea

> Context engineering layer between CodeGraph+Moedex and the LLM using Moe

Moe ships no knowledge of either system today: the only occurrence of `codegraph`
anywhere in this repo outside `node_modules` is `IDEA-LOG.md:23`, and `moedex`
appears nowhere. So this is not "improve the integration" — it is "decide what
Moe should say about the retrieval systems its users already have connected."
The deliverable is a **routing policy** plus the delegated-search machinery to
execute it. No new service, and no new code.

**Which Moe.** This doc is about `~/Code/moe`, the Superpowers fork.
`~/Code/tools/moedex` is a *fourth* project of that name — a Go code-search
engine whose installed binary is `~/.local/bin/moe`. No PATH collision: every
package here declares a `moe-*` prefixed bin, none claims bare `moe`.

## Settled decisions

All *Decided 2026-08-31, Zak Keown.*

- **CodeGraph is the baseline; moedex is an optional addon.** "Moedex is an addon
  not everyone else will have." Routing must answer every question from CodeGraph
  alone, treating moedex as an enhancement when present.
- **Moedex is access-scoped per user.** "Moedex respects what the user has access
  to in GitLab." Two engineers can get different results for the same query.
- **Local memory is the default; CodeGraph's memory graph is an option.**
  `@bubstack/moe-memory` is kept, not deprecated, dropped or migrated away from.
- **A user with no CodeGraph access must still get fully working memory.**
- **Graceful fallback is the house rule for optional capabilities.** "Just use
  those features if they are installed and configured."
- **CodeGraph's data-handling posture is out of scope** for this program. It is
  not a routing input and not an open question.

## Why it matters

For ~20 internal engineers the failure mode is not missing capability, it is
unexercised capability. In this session's tool surface CodeGraph exposes **99
tools**, of which only **11 are retrieval or knowledge** (`codegraph_search`,
`graph_trace`, `graph_cluster`, `graph_source`, `graph_describe_schema`,
`rag_search`, `rag_context`, `project_report`, `memory_read`, `memory_store`,
`memory_diagnostics`). The other 88 are actuation and live state — 47 Shortcut,
18 Grafana, 13 GitLab, 10 across MySQL, RabbitMQ, Consul, logs, storage and
domain lookup. An agent handed 99 tools and no policy does not reliably find the
11 that would have answered the question before it started guessing.

Four defects a policy fixes. **No read-before-answer discipline** — CodeGraph's
own server instructions ask for `memory_read(operation=search)` *early*, before
answering from code or first principles, and nothing enforces it. **Unbudgeted
retrieval** — `rag_context` returns up to `maxTokens: 50000` against a default of
2000, and `graph_source` and `read_conversation` have no ceiling a caller is
nudged toward. **No search-vs-read rule** — for a file in the current worktree
`Read` beats `graph_source`, for a symbol in one of ~620 repos the reverse.
**No write-back** — nothing learned survives the session unless someone decided
where it goes, which is what the routing rule settles.

## Current state

**CodeGraph** — `https://codegraph.tcdevops.com/mcp`, HTTP, bearer PAT
(`~/.claude.json` `mcpServers.codegraph`). Connected and working this session.
Schemas verified by loading them: `rag_search(query, topK≤50, sourceKinds:
structured_doc | repository_readme)`; `codegraph_search(namePattern, scope:
projects | nodes, label, project, language, limit)`; `rag_context(sourceKey,
chunkIndex, scope: section | neighbors | document, maxTokens≤50000)`;
`memory_read(operation: search | subgraph | expand_frontier | entity_bundle |
claim_bundle | write_status)`.

**Moedex** — `http://127.0.0.1:8081/mcp` (`~/.claude.json` `mcpServers.moedex`),
a single-node Go code-search and agent-context service at `~/Code/tools/moedex`
(origin `gitlab.tcdevops.com:Zak/moedex.git`). Corpus syncs from
`gitlab.tcdevops.com` via `glab` (`deploy/moedex-serve.env.example:33-38`). MCP
surface, from source:

- `search_context` — `internal/mcp/mcp.go:259-287`. Params `query`,
  `token_budget`, `top_k`, `format`, `graph_depth` (0-10, default 1),
  `min_confidence` (`Candidate|Pattern|Verified|Proven`). Returns
  `token_estimate`, `truncated`, `clipped` (`internal/mcp/contracts.go:113-114`).
  `DefaultTokenBudget = 8000` (`internal/contextwin/contextwin.go:38`).
- 13 graph tools — `internal/graph/serve/graphtools.go:412-427`: `trace_calls`,
  `trace_consumers`, `trace_hierarchy`, `trace_queries`, `trace_renders`,
  `impact_analysis`, `list_clusters`, `list_repos`, `graph_schema`, `read_source`,
  `graph_neighbors`, `list_symbols`, `file_tree`.
- An LSP arm behind the `lsp` build tag — `find_definition`, `find_references`,
  `find_implementations`, `find_symbol`, `symbols_overview`
  (`internal/app/servecmd/nav_lsp.go:41-55,256,307`).

**Moedex already does the token-budgeting half of "context engineering,"**
returning ranked, deduplicated, token-budgeted blocks pre-annotated with graph
neighbours so no second graph call is needed. Where it is present, prefer it for
that reason — not because it replaces anything.

**Designed as a replacement, operating as an addon.**
`docs/GRAPH-LAYER-PLAN.md:3` states its goal as "Replace Codegraph MCP's
code-graphing with a Moedex-native graph layer," and marks all seven
CodeGraph-parity phases ✅ (`:253-262`). **That is a design document, not the
operating plan** — Zak's stated intent as of 2026-08-31 is addon (above). The
routing below therefore treats CodeGraph as the floor. The same doc's *Out of
scope* table (`:358-368`) is still descriptive: moedex never intends to cover
observability, infra, Shortcut, SCM or memory.

**Availability, as observed.** Started during this session, not reachable before
I finished: `launchctl list` shows `com.moedex.serve` at PID 32478 and
`~/.moedex-index/moedex-serve.log` ends with repeated `> serve started` /
`token index loaded from cache` and no bind error, but `POST` to `:8081/mcp`
still fails to connect. A warming mmap load is a slow start, not a missing
capability — and it makes "moedex not answering" a routine case, which the
graceful-fallback house rule already covers. Everything above is from source and
artifacts, not a live call.

**Corpus, from artifacts and from Zak.** `~/.moedex-index/shards-managed/` holds
**492 `.idx` shards** plus `corpus-graph.graph` (758 MB) and `corpus-tokens.tki`
(372 MB), built 2026-08-28, dense arm live (`st-codesearch-distilroberta`, ONNX).
Shards are numbered, not repo-named, so I could not derive coverage from them —
and per the settled decision the answer is that there is no fixed coverage: the
corpus is **whatever that user can see in GitLab**.

**Moe's own memory** — `packages/memory` (worktree
`.claude/worktrees/wf_238bb49d-362-14`, branch `import/packages-memory`, not yet
on `main`). Local SQLite + sqlite-vec, `bge-small-en-v1.5` at 384 dims, seven MCP
tools (`src/mcp-server.ts:186,230,251,300,336,358,387`): `search_conversations`,
`read_conversation`, `process_thoughts`, `search_journal`, `read_journal_entry`,
`list_recent_entries`, `read_recent_entries`.

## Memory: two stores, one default

The two stores coexist by decision. The asymmetry is what makes a rule writable:

| | `moe-memory` (default) | CodeGraph memory (option) |
|---|---|---|
| Substrate | Local SQLite + embeddings | Server-side claim graph |
| Scope | This machine | Per-user, company-wide |
| Shape | Two record types: conversation turn, journal entry | Entities, claims, evidence, supersession |
| Writes | Harvested (transcripts) + deliberate (`process_thoughts`) | Deliberate only (`memory_store`) |
| Survives laptop loss | No | Yes |

**What selects between them.** Reads and writes have different discriminators, so
the answer is a split:

- **Writes route by record type, structurally forced rather than preferred.**
  Conversation turns can *only* go local — CodeGraph has no transcript corpus.
  Claims with supersession can *only* go to CodeGraph — local has no claim model.
  Journal entries are the one free choice, and go local by default.
- **Reads route by question type**, per the table below.
- **Nothing needs a config flag.** Whether the `codegraph` or `moedex` MCP server
  is connected *is* the probe: its tools are either in the tool surface or they
  are not. This is the graceful-fallback house rule applied, not a new invention.

### The routing rule

Every row's baseline is answerable without moedex. Moedex only ever *upgrades* a
row.

| Question | Baseline | With moedex |
|---|---|---|
| "Where is this symbol, who calls it?" | `codegraph_search` → `graph_trace` | `search_context` with `graph_depth≥1` — one budgeted, graph-annotated call |
| "What is the blast radius of this change?" | `graph_trace` + `graph_cluster` | `impact_analysis` |
| "What is the TC convention for X?" | `rag_search(sourceKinds:["structured_doc"])` | — (moedex indexes code, not docs) |
| "What did we decide / who owns this?" | `memory_read(search)` → `claim_bundle` | — |
| Same, CodeGraph absent | `search_journal` + `search_conversations` | — |
| "What did we say / have I done this?" | `search_conversations` | — |
| "What did *I* note about this repo?" | `search_journal` | — |
| A file in the current worktree | `Read` | `Read` — never retrieve what is on disk |

**Reproducibility caveat, and it belongs in the skill text.** A moedex answer is
scoped to the asking user's GitLab access, so it is *not* reproducible across
users the way a CodeGraph answer is. Anything destined for a shared artifact — an
MR description, a plan, a written decision — cites the CodeGraph baseline, with
moedex used to find the answer faster but not as the citation.

**Writes.** Conversation turns: harvested locally, no decision. Journal entries:
`process_thoughts`, local. Company-durable facts — decisions, ownership,
conventions, resolved questions — `memory_store` **when CodeGraph is connected**,
because only it survives losing the laptop and only it has supersession; when it
is not, the same fact goes to the journal and is unshared, not lost. **Nothing is
written to both** — dual-write yields two records that can disagree with no
supersession link between them.

### Prior art already in-repo

Moe ships this pattern once already — the strongest argument against building
anything new. `packages/memory/agents/search-conversations.md` is `model: haiku`
with a tool allowlist of **exactly two** MCP tools and a "max 1000 words" output
contract; `skills/remembering-conversations/SKILL.md` dispatches it and claims
"**Saves 50-100x context vs. loading raw conversations**"; and
`prompts/search-agent.md` is a **tested** output template —
`test/search-agent-template.test.ts:19-40` pins its `### Summary` / `###
Sources` / `### For Follow-Up` sections and `200-1000 words` / `max 1000 words`.

A cheap-model subagent with a narrow allowlist and a hard word budget *is* the
context-engineering mechanism — the raw retrieval never enters the main window.
`packages/core/skills/mcp-cli/SKILL.md` is adjacent prior art with a different
mechanism: "discover tools… without polluting context with pre-loaded MCP
integrations."

## Prerequisites

**DO-NOW-1** merges the `import/packages-core` worktree the files land in.
**skill-set-fidelity-refactor** splits `skill-tiers.yaml` into a frozen
`imported:` (the 27 upstream names) and an `authored:` map for what this fork
writes, and re-aims `metadata.test.ts`'s count and equality assertions at
`imported:` alone (`:148`, `:228`); without it a new core skill cannot exist.
**DO-NOW-2** decides the lean/full tiering, which this skill needs an entry in.
**DO-NOW-3** generates `/plugins/`, which is how skills and agents reach users at
all — today root `pnpm mint` is `package.json` → `"mint": "echo … && exit 1"`.

## Proposed approach

**(a) A skill plus two retrieval subagents.** `retrieving-context/SKILL.md`
carries the routing rule and the read-before-answer, budget and write-back
discipline; `search-codegraph.md` and `search-moedex.md` are `model: haiku`
agents with tool allowlists and the tested output-section contract.
*Trade-off:* no code, no new §5 dependency edge, degrades to today's behaviour if
ignored rather than to a broken one — but advisory, so it can be skipped.

**(b) An MCP proxy in front of CodeGraph** doing query planning, budgets and
summarisation. *Trade-off:* the only option that can *enforce* a budget — but a
10th package against a 9-package architecture whose §4 reasoning is explicit, and
a second always-on local daemon at the moment the first one is not answering.

**(c) A SessionStart hook injecting retrieved context.** Mechanically real —
`hookSpecificOutput.additionalContext`, and hooks from different plugins run in
parallel with output merged (https://code.claude.com/docs/en/hooks) — and mint's
`bootstrap` is per-package (`packages/mint/src/config.ts:91-96`) emitted into a
namespaced `hooks/moe-mint/hooks.json`
(`packages/mint/src/adapters/claude-code.ts:10-26`), so SessionStart is not
globally locked. *Trade-off:* it retrieves before the task is known, paying tokens
every session for context most sessions do not need.

**Recommendation: (a), in `packages/core`.** Now that new skills are permitted,
placement is decided on the merits, and `skill-tiers.yaml:10-12` states the
criterion that settles it — quoting ARCHITECTURE.md §2:

> A skill earns a place in `moe-core` if it fires on ordinary work without being
> asked for. A skill you invoke deliberately, by name, when you already know you
> want it, belongs in `moe-everything`.

Retrieval discipline is the former by definition: "search before you answer" that
waits to be asked for has already failed. That also makes it a *methodology*
skill, which is what core holds — `test-driven-development`,
`verification-before-completion`, `systematic-debugging` — rather than a memory
feature. The second argument is reachability, and `skill-set-fidelity-refactor`
has since made it decisive rather than incidental. `metadata.test.ts:290-304`
resolves `**REQUIRED SUB-SKILL:**` and `**REQUIRED BACKGROUND:**` markers against
`packages/core/skills/` only, and the rule is now strict: **every** backticked
token on a marker line must resolve (`:304`, `resolved.length !== named.length`),
where the old rule flagged a line only if *nothing* resolved. So a core skill
pointing at a `packages/memory` skill now fails outright instead of passing on
the strength of a co-named core skill. **Only a core skill can be REQUIREd by
core skills**, stated by a test rather than by convention — `writing-plans` and
`brainstorming` should be able to point at this one, and from `packages/memory`
they provably never could.

My earlier `packages/memory` recommendation was a workaround for the closed-set
assertion, and it does not survive being decided on merit. What genuinely
recommended memory — that it is where the other recall skills live — is the
weaker consideration, since the TC-specificity objection to core also weakens:
this fork publishes nothing and serves ~20 people in one company, so
"core is generic, TC infra is not" is an upstream OSS posture the fork does not
hold.

**Three consequences to accept.** Core has **no `agents/` directory** today
(`ls packages/core/` — and `moe-mint.yaml:46-49` says so in a comment that will
go stale); mint's default components already include `agents/`, so it is picked up
with no config change, but this is core's first. The two agents restate the
`### Summary` / `### Sources` / `### For Follow-Up` format inline rather than
sharing `packages/memory/prompts/search-agent.md` — a deliberate small
duplication, chosen because a cross-package file path is exactly the unclassified
non-import edge ARCHITECTURE.md §5 warns about with `glass`'s `createRequire`.

And the strict marker rule cuts **both** ways: `retrieving-context` must itself
carry **no** `**REQUIRED SUB-SKILL:**` line naming `remembering-conversations`,
which lives in `packages/memory` and would fail `:304`. That costs nothing real —
the routing rule reaches memory through its **MCP tools** (`search_conversations`,
`search_journal`, `process_thoughts`), and tools are not skills, so they are
outside the check. Where the skill wants to mention the memory skill by name it
does so in prose, without the marker.

**No cross-package REQUIRED mechanism is needed, and I recommend not building
one.** The core placement makes every marker same-package, so the strict rule is
satisfied natively; inventing a resolver would loosen a check that just became
usefully sharper, to buy an edge this design does not need. One residual gap worth
naming rather than fixing: the test scans only `packages/core`, so a marker in
*memory's* files naming a core skill is unchecked in either direction. This item
adds no such marker.

**Tier: `core`**, not `everything` — it meets the criterion above, and the reason
is the defect itself: a retrieval-discipline skill's whole value is firing
unprompted, so shipping it only in `moe-everything` withholds it from exactly the
population that has the problem (the ~20 people who run the lean plugin
permanently). The cost is precise and small: `metadata.test.ts:613` still asserts
`core.length === 13`, so `tier: core` means editing that one number to 14, while
`tier: everything` costs no test change at all. `skill-set-fidelity-refactor`
un-froze the *inventory* count (`:148` now counts `imported:`, and `:142-144`
says the directory grand total is deliberately no longer asserted) but left the
*curation* count pinned — so the lean tier stays a conscious decision, which is
DO-NOW-2's to make, not mine. `skill-tiers.yaml:22-24`'s ERR SMALL rule is the
argument against.

**On `blocks`.** Empty. `tc-governance-integration` can ship TC Guide and the AI
Governance doc as skill content with no retrieval mechanism, so blocking would
serialise two independent items for nothing. One handoff for it:
`rag_search(sourceKinds:["structured_doc"])` may already index those documents,
which would change what it needs to author.

## Scope boundary

**In:** the routing rule; write-back discipline; one skill; two haiku agents;
graceful behaviour when moedex is absent or warming and when CodeGraph is absent
entirely; the cross-user reproducibility caveat.

**Out:** TC Guide and AI Governance *content* (`tc-governance-integration`); MR
and branch conventions (`tc-standards-conformance`); renaming or re-tiering
existing core skills (`tiered-workflow-naming`); any change to moedex or
CodeGraph themselves — `GRAPH-LAYER-PLAN.md` is not this backlog's to edit; a
proxy MCP server, a 10th package, or any new always-on process; any change to
`packages/memory`'s store, schema or encoder; deprecating either memory store;
CodeGraph's data-handling posture, now explicitly out of scope; and sending
anything external — both backends are `*.tcdevops.com` or loopback.

## Open questions for Zak

**One.** Should `retrieving-context` be `tier: core` (lean, ships to everyone) or
`tier: everything`? I recommend `core`: the skill's value is firing unprompted, so
`everything` withholds it from the people who run the lean plugin permanently —
the ones with the problem. Concrete cost either way: `core` means changing
`metadata.test.ts:613` from 13 to 14 and nothing else; `everything` needs no test
change. The tiering is DO-NOW-2's decision, so this item is an input to it rather
than a separate fork.

Everything else previously open here is now answered by the settled decisions
above: moedex's role, what it indexes, and the data-handling question.

## Effort

Routing rule design 1-1.5 h (now unblocked — the decisions above were the
blocker) · `retrieving-context/SKILL.md` 2-2.5 h (routing rule, budgets,
read-before-answer, write-back, both absent-backend paths) ·
`search-codegraph.md` 1 h · `search-moedex.md` 0.5 h · `skill-tiers.yaml` entry
and the stale `moe-mint.yaml` comment 0.25 h · manual verification 1.5-2 h ·
fix-ups after the first real `/plugins/` emission 0.5-1 h.

**What makes it slower:** verifying the moedex agent needs the daemon actually
answering on `:8081`, which it was not by the end of this session despite being
started. That verification is optional-path only, so it does not block the
baseline work.

## Verification

1. `packages/core/skills/retrieving-context/SKILL.md` exists with valid
   frontmatter; `packages/core/agents/search-{codegraph,moedex}.md` exist with
   `model: haiku` and explicit `tools:` allowlists, matching the shape at
   `packages/memory/agents/search-conversations.md:1-6`.
2. `packages/core/skill-tiers.yaml` gains a `retrieving-context` entry **under
   `authored:`** (line 316, currently `{}`) — never under `imported:`, which is
   the frozen upstream record that `metadata.test.ts:148,228` assert at 27 names.
   `metadata.test.ts:240`'s registered-vs-directory check and `:617`'s
   tier-closure test both pass: nothing this skill REQUIREs may sit in a higher
   tier than it does.
   **New assertion this item must add:** `retrieving-context/SKILL.md` carries no
   `**REQUIRED SUB-SKILL:**` or `**REQUIRED BACKGROUND:**` line naming a skill
   outside `packages/core/skills/`. `metadata.test.ts:290-304` enforces it as a
   side effect, so the check is that the file passes it rather than that a new
   test exists.
3. `pnpm check` green from the root (`biome check .` + `turbo run typecheck
   test`), including core's `metadata.test.ts` under
   `skill-set-fidelity-refactor`'s two-list model.
4. After DO-NOW-3: `moe-mint generate --dir packages/core` emits the skill and
   both agents into the generated plugin, and `moe-mint validate --dir
   packages/core` prints `validate: clean` (drift exits 3, schema errors 2 —
   `packages/mint/src/cli.ts:114-129`).
5. Manual, recorded in the phase artifact: dispatch `search-codegraph` on a
   question answerable only from `rag_search(sourceKinds:["structured_doc"])`;
   the summary respects `200-1000 words` and cites re-fetchable `sourceKey`s.
6. **Three required negative cases**, all of them routine. With moedex absent or
   still warming, the skill answers the code-structure rows from the CodeGraph
   baseline and does not stall — the addon decision made concrete. With the
   `codegraph` server absent, the skill still describes a complete working memory
   over `search_conversations` / `search_journal` / `process_thoughts` and does
   **not** instruct a `memory_store` write. And a moedex-sourced finding destined
   for a shared artifact carries a CodeGraph citation, per the reproducibility
   caveat.
