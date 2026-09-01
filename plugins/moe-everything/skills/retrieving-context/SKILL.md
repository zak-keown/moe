---
name: retrieving-context
description: Use before answering any question about code, conventions, ownership or past decisions that is not already on disk in front of you — routes the question to the right retrieval backend, on a token budget, and decides where what you learn gets written back
---

# Retrieving Context

## Overview

**Core principle: search before you answer, read what is on disk instead of
retrieving it, and spend a budget you chose rather than a default you inherited.**

You have up to three retrieval backends and they do not overlap. Which are
present is not configuration — it is whether their tools are in your tool
surface. Route by question, degrade quietly when a backend is missing, and never
stall waiting for an optional one.

| Backend | Tools | Corpus | Optional? |
|---|---|---|---|
| **CodeGraph** | `mcp__codegraph__*` | ~620 TC GitLab repos, structured docs, wikis, plus a per-user claim graph | baseline — assume every answer must be reachable here |
| **moedex** | `mcp__moedex__*` | the TC GitLab code corpus the *asking user* can see | addon — an upgrade, never a prerequisite |
| **moe-memory** | `mcp__plugin_moe-memory_moe-memory__*` | this machine: conversation turns and journal entries | default memory store |

## The rule that fires first

**A file in the working tree is read, never retrieved.** `Read` and `Grep`, every
time. This holds whether or not the repo is in the retrieval corpus, and it is
not a preference about cost: retrieval returns the corpus's *snapshot* of a
file, and your uncommitted edit is not in it. Reading is both cheaper and more
current, which is the whole argument.

**A corollary that expires: a repo absent from the corpus still answers.** Both
backends return their best match for every query, and their best match for a
question about code they have never seen is a plausible answer about different
code, with a real file path attached. Verified 2026-09-01 against the live
daemon: a query naming Moe's own symbols (`moe-mint`, `moe-doctor`, `probes`,
the `hard`/`soft` probe fields) returned a TCP live-fire design document from an
unrelated TC repo at score 0.029. Moe is deliberately not indexed yet — that
will change, and when it does this paragraph is a dated observation rather than
a rule. The rule above it does not change: the corpus will still lag your
working tree by at least a sync.

**Treat score as a warning signal, not a universal cutoff.** Both backends always
return their best match, including for questions they cannot answer, so rank 1
alone proves nothing. But absolute scores are not calibrated across corpora or
queries: a live structured-doc query returned the exact `ai/kb` Git branch
convention at roughly 0.03. Inspect repository, title, section and snippet; use
`rag_context` to verify a low-scoring but clearly relevant candidate. Say you did
not find it only when the content is irrelevant, not merely because a numeric
threshold was crossed.

## Routing

Every row is answerable from the baseline alone. moedex only ever upgrades a row.

| Question | Baseline (CodeGraph) | With moedex |
|---|---|---|
| A file in the working tree | `Read` / `Grep` | `Read` / `Grep` — the corpus lags your edits |
| "Where is this symbol in a repo you are not editing?" | `codegraph_search` → `graph_trace` | `search_context` with `graph_depth: 1` — one budgeted, graph-annotated call |
| "Blast radius of this change across repos?" | `graph_trace` + `graph_cluster` | `impact_analysis` |
| "What is the TC convention for X?" | `rag_search(sourceKinds: ["structured_doc"])` | — moedex indexes code, not docs |
| "What did we decide, who owns this?" | `memory_read(operation: search)` → `claim_bundle` | — |
| Same, CodeGraph absent | `search_journal` + `search_conversations` | — |
| "What did we say, have I done this before?" | `search_conversations` | — |
| "What did *I* note about this repo?" | `search_journal` | — |

`rag_search(sourceKinds: ["structured_doc"])` reaches TC's `ai/kb` documents and
project **wikis** — verified: a convention query returned `kb:git.md`,
`kb:dotnet-project-docs.md` and project-wiki results, each with a re-fetchable
`source_key`, `revision` and `source_url`. Check there before authoring a
convention document; it may already exist.

## Budgets

Defaults are generous and you inherit them by saying nothing.

- **`rag_context`** takes `maxTokens` up to 50000. Ask for what the question
  needs — start at the 2000-token default and widen deliberately.
- **`search_context`** takes `token_budget` and honours it: asking 1200 returned
  `token_estimate: 732` with `truncated: true`. Its own default is 8000. Pass a
  budget; read `truncated` and `clipped` in the reply and say so if you were cut
  off rather than presenting a partial answer as whole.
- **`graph_depth: 0`** when you only want text. Depth 1 populates a `neighbors`
  field per block, but it comes back empty for prose blobs — you pay the
  traversal and get `bucket_totals` of zero. Depth earns its keep on code
  symbols only.
- **`graph_source`** and `read_conversation` have no ceiling. Bound them by
  asking a narrower question, not by truncating the answer afterwards.

**Delegate the retrieval, not the conclusion.** The cheapest budget is a
subagent's context instead of yours: dispatch `search-codegraph` or
`search-moedex`, both `model: haiku` with a two-tool allowlist and a hard word
cap, and the raw blocks never enter this window. `remembering-conversations`
(in the memory plugin, when installed) does the same for transcripts, and its
skill text measures the saving at 50-100x.

## Reproducibility, and what may be cited

**A moedex answer is scoped to the asking user's GitLab access.** Two engineers
running the same query can get different results, so a moedex finding is not
reproducible for a reader who is not you.

Anything destined for a shared artifact — an MR description, a plan, a written
decision, a comment someone else will read — **cites the CodeGraph baseline.**
Use moedex to find the answer faster; cite the thing your reader can re-run.

## Write-back

Nothing you learn survives the session unless you decide where it goes. Route by
record type, because the shape of the record forces it:

| What you learned | Where it goes | Why there is no choice |
|---|---|---|
| A conversation turn | local, harvested automatically | CodeGraph has no transcript corpus |
| A claim that supersedes an earlier one | `memory_store`, CodeGraph | local has no claim or supersession model |
| A durable fact: decision, ownership, convention, resolved question | `memory_store` **when CodeGraph is connected** | only it survives losing the laptop |
| The same fact, CodeGraph absent | `process_thoughts` to the journal | unshared, but not lost |
| A note only useful to you | `process_thoughts`, local | — |

**Never write the same fact to both.** Two records that can drift apart with no
supersession link between them is worse than one record in the wrong store.

Write at the **end** of the work, in one batch, once the fact has stopped
changing — not at the moment you first believe it.

## Read before you answer

CodeGraph's own server instructions ask for `memory_read(operation: search)`
*early* — before answering from code or from first principles — and nothing
enforces it. This is the enforcement.

If the question touches prior work, a past decision, ownership, a convention, or
a person, project or tool discussed before, search memory **first**. Loose
phrasing is fine; the search is embedding-based. Feed the returned ids into
`subgraph` or `claim_bundle` to deepen rather than re-querying.

## When a backend is missing or slow

- **moedex absent, or up but not answering.** Answer the code-structure rows
  from the CodeGraph baseline and move on. It is a single local daemon with a
  large mmap to warm; a slow start is routine, not an incident. Do not retry in
  a loop and do not tell the user the work is blocked.
- **CodeGraph absent.** You still have a complete working memory:
  `search_conversations`, `search_journal`, `process_thoughts`. Route the "what
  did we decide" rows there and **do not** instruct a `memory_store` write — the
  tool is not in your surface, and a fact written nowhere is better than a call
  that errors.
- **Only the working tree.** `Read` and `Grep` answer more than you expect. Say
  what you could not check rather than guessing at it.

## Red flags

- Answering a question about a file that is open in front of you from a
  retrieval call.
- Reporting a top hit without checking both its score and its actual relevance.
- Passing no `token_budget` or `maxTokens`, then pasting the result wholesale.
- Citing a moedex `abs_path` in an MR description.
- `memory_store` for something that will be false next week.
- Writing the same fact to both stores.
- Telling the user retrieval is unavailable when only the optional backend is.
