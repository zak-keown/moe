# Semantic Knowledge-Base Recall via MemPalace

How to search prior debugging sessions before re-deriving a known cause. In this fork the retrieval routing it assumes lives in the `retrieve-context` skill, and the stores are moe-memory's `search_journal` / `search_conversations`.

*Imported from `open-gsd/gsd-core` @ `05092ff3` (MIT), `gsd-core/references/debugger-semantic-recall.md`. Rewritten only where it named GSD's own agent and phase machine; the technique content is upstream's. See NOTICE.*

Matching Logic. Replaces keyword-overlap matching with **semantic recall** so a
prior session that resolved "requests hang under load" surfaces for a new "API
times out when many users connect" — same root cause, no shared keywords.

## Why this exists

The knowledge base's self-noted limitation was explicit: *"Matching is keyword
overlap, not semantic similarity."* Keyword overlap only fires on lexical
coincidence — the highest-value recalls (same root cause, different wording)
are exactly the ones it misses, and its value decays as the corpus grows.

## The approach — reuse MemPalace, add no new infrastructure

Layer semantic recall on top of the existing knowledge base by **reusing
MemPalace** (the semantic-memory capability already in this environment) —
**without adding new embedding or vector infrastructure** (Choose Boring /
Zawinski: spend no new "innovation token" on a bespoke vector store the
debugger would own).

`.planning/debug/knowledge-base.md` remains the **durable plain-text source of
truth**; semantic recall is an additive layer over it, not a replacement.

## Write — index resolved sessions at archive

At `archive_session`, after appending the entry to `knowledge-base.md` (the KB
append + commit MUST succeed first — `knowledge-base.md` is the durable source
of truth; skip indexing on KB-write failure), **index the resolved session into
MemPalace**.

**Index the agent-authored `Resolution` summary — `root_cause(s)` + `fix` + the
Prevention `recurrence_guard` — NOT the raw user-supplied `Symptoms`.** The
Resolution is the post-investigation, agent-synthesized signal; indexing it
(rather than raw symptoms) excludes attacker-controlled prose from the
cross-session index and reduces secret/PII leakage. Even so, **redact
secret-shaped values** (API keys, bearer tokens, JWTs, passwords, credentials)
from the summary before indexing — a bug report's error string can echo a
secret, and MemPalace is a cross-session, cross-project store.

## Invocation

Upstream's debugger agent declared no MCP tools in its `tools:` frontmatter, so it
had to shell out. In this fork the stores are moe-memory's `search_journal` and
`search_conversations`, and which store answers which question is the
`retrieve-context` skill's routing rule, not this file's. Upstream's CLI path is
kept below because it still applies to a headless run with no MCP surface at all:
`mempalace search
"<symptoms>" --wing <wing>` to recall, and the matching index command on
archive. If an `mempalace_search(query, wing)` MCP tool is registered in the
runtime, prefer it. **Resolve the wing** from `config.mempalace.wing` → else the
project's `project_code` → else the project directory name (the same precedence
every other MemPalace integration uses).

## Read — query MemPalace at Phase 0

At Phase 0, **query MemPalace semantically with the current symptoms** and
surface the **top-k meaning-similar prior resolutions** as candidate
hypotheses. Each surfaced candidate flows into Evidence exactly as a
keyword-match candidate would — a hypothesis to test first, not a confirmed
diagnosis.

This catches the **same-root-cause / different-wording** case: a prior
"requests hang under load" resolution surfaces for "API times out when many
users connect" even though no keywords overlap.

## Graceful degradation — MemPalace absent

When MemPalace is unavailable (not installed, not configured, or the query
errors), **fall back to keyword-overlap matching** against
`knowledge-base.md`: extract nouns, error substrings, and **identifiers**
(function/variable names — often the highest-signal token) from
`Symptoms.errors` and `Symptoms.actual`, and scan each entry's `Error patterns`
field for **2+ token overlap (case-insensitive)**. The fallback is logged
(Kernighan — never a silent skip), and `knowledge-base.md` continues to be
written regardless, so no session is lost to a missing palace.

## Scope boundary (Zawinski's Law)

An additive recall layer over the existing knowledge base, reusing an existing
semantic-memory capability. Not a new command, not a vector database, not an
embedding pipeline the debugger owns. Where MemPalace is absent the debugger
behaves exactly as it did before this layer — keyword matching against the
plain-text knowledge base.
