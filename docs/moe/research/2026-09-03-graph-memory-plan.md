# Graph-Structured Memory with Provenance — Plan

**Status:** Planning only — no execution  
**Complexity:** Very high (ranked #11 of 12)  
**Date:** 2026-09-03  
**Signal:** Semantica (11.7k★, W3C PROV-O), TencentDB-Agent-Memory (25.7k★, four-asset taxonomy)

---

## Current State of moe-memory

moe-memory is a flat semantic-search system over two record types in one SQLite
file:

1. **Conversation exchanges** — harvested from Claude Code and Codex transcripts.
   Each row is a user/assistant turn with metadata (project, timestamp, session,
   git branch, model, thinking config, tool calls). Searchable via sqlite-vec
   KNN (bge-small-en-v1.5, 384-dim) + SQL LIKE.

2. **Journal entries** — deliberately written markdown files (reflections,
   observations, project notes, user context, technical insights, world
   knowledge). Indexed into the same SQLite file but in separate tables.

**Data model surfaces:**
- `exchanges` table: 23 columns, vector in `vec_exchanges`
- `tool_calls` table: FK to exchanges with CASCADE delete
- `journal_entries` table: 10 columns, vector in `vec_journal_entries`
- 7 MCP tools: `search_conversations`, `read_conversation`, `process_thoughts`,
  `search_journal`, `read_journal_entry`, `list_recent_entries`,
  `read_recent_entries`

**What it does NOT have:**
- Relations between records (no "this exchange led to this decision")
- Conflict detection (two contradictory findings coexist silently)
- Temporal querying ("what did we believe about X on date Y?")
- Record-type taxonomy beyond exchange/journal (no skill-memory, no code-graph)
- Provenance chains (no "why was this decision made?")

---

## What "Graph-Structured Memory" Concretely Means

### Data Model: Relations as First-Class Records

Add a `memory_edges` table to the existing SQLite schema. An edge connects two
records (of any type) with a typed relationship:

```sql
CREATE TABLE IF NOT EXISTS memory_edges (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,      -- 'exchange' | 'journal' | 'decision' | 'finding'
  source_id TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  relation TEXT NOT NULL,         -- 'caused_by' | 'contradicts' | 'supersedes' | 'supports' | 'implements'
  confidence REAL DEFAULT 1.0,   -- 0.0-1.0, for model-inferred edges
  created_at TEXT NOT NULL,       -- ISO timestamp
  created_by TEXT,                -- 'model' | 'user' | 'system'
  metadata TEXT                   -- JSON blob for relation-specific data
);
```

Plus a `memory_nodes` table for first-class knowledge nodes that don't map to
existing exchange/journal rows:

```sql
CREATE TABLE IF NOT EXISTS memory_nodes (
  id TEXT PRIMARY KEY,
  node_type TEXT NOT NULL,        -- 'decision' | 'finding' | 'belief' | 'constraint'
  project TEXT,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  superseded_at TEXT,             -- NULL if current, ISO timestamp if replaced
  embedding_version INTEGER NOT NULL DEFAULT 0
);

CREATE VIRTUAL TABLE IF NOT EXISTS vec_memory_nodes USING vec0(
  id TEXT PRIMARY KEY,
  embedding FLOAT[384]
);
```

**Key insight:** This is an additive schema. Existing `exchanges` and
`journal_entries` tables are unchanged. The graph layers ON TOP of the flat
store. Old databases work without migration beyond adding the new tables (which
`CREATE TABLE IF NOT EXISTS` handles).

### Record Type Taxonomy

Mapping TencentDB's four-asset taxonomy to Moe's world:

| TencentDB | Moe Current | Moe Graph |
|---|---|---|
| Chat memory | `exchanges` table | Unchanged — exchange rows are chat memory |
| Skills | Journal `technical_insights` + skill YAML | `memory_nodes` type=`skill_learned` for cross-session skill acquisition |
| LLM-wiki | Journal `world_knowledge` | `memory_nodes` type=`belief` with supersession chains |
| Code-graph | Not in memory (lives in moedex) | Bridge edges from `memory_nodes` to moedex symbols (out of scope for memory; moedex owns code structure) |

**Design decision:** moe-memory does NOT absorb moedex. Code intelligence stays
in moedex; memory can reference moedex symbols via edges whose target_type is
`moedex_symbol` (a cross-system pointer, not a stored record). This keeps the
single-responsibility boundary clean and avoids duplicating graph storage.

---

## Provenance: Causal Links Between Memories

### How It Works

When the model makes a decision, memory records both the decision and what
informed it:

```
Exchange #A: "We should use SQLite for the store"
  ↓ caused_by
Exchange #B: "User said they need offline-first support"
  ↓ supports
Journal entry #C: "SQLite is the right choice for single-writer embedded stores"
```

### Write Path

Two mechanisms for creating edges:

1. **Explicit (user/model-initiated):** A new MCP tool `link_memories` lets the
   model create edges during a session:
   ```
   link_memories({
     source: "exchange:abc123",
     target: "journal:def456",
     relation: "caused_by"
   })
   ```

2. **Inferred (post-hoc):** A background indexer pass scans recent exchanges for
   decisions and findings, then uses embedding similarity + heuristics to propose
   edges. These get `confidence < 1.0` and `created_by: 'system'`.

### Read Path

A new MCP tool `trace_provenance` walks the edge graph from a given record:

```
trace_provenance({ id: "exchange:abc123", depth: 3, direction: "causes" })
→ Returns the causal chain: what caused this → what caused that → ...
```

---

## Conflict Detection

### How It Works

Two records conflict when they make contradictory claims about the same subject.
Detection is a two-phase process:

**Phase 1 — Candidate generation (cheap):** When a new `memory_nodes` row of
type `belief` or `decision` is inserted, search for existing nodes with high
embedding similarity (cosine > 0.85) in the same project.

**Phase 2 — Conflict classification (expensive):** For each candidate pair, a
lightweight LLM call classifies the relationship:
- `agrees` — no action
- `contradicts` — create a `contradicts` edge between the two nodes
- `supersedes` — create a `supersedes` edge and set `superseded_at` on the old node
- `unrelated` — false positive from embedding similarity

**Cost control:** Phase 2 only runs during `moe-memory sync` (the batch
indexer), never on the hot MCP path. Conflict edges accumulate and are surfaced
on the next search that hits either node.

### Surfacing

When `search_conversations` or `search_journal` returns a result that has
`contradicts` edges, the result includes a `conflicts` array:

```json
{
  "exchange": { ... },
  "snippet": "...",
  "conflicts": [
    { "with": "journal:xyz", "excerpt": "...", "detected_at": "2026-09-03" }
  ]
}
```

---

## Temporal Querying: state_at(date)

### How It Works

The `supersedes` relation creates a temporal chain: each belief/decision has at
most one successor. To answer "what did we believe about X on date Y?":

1. Search `memory_nodes` for nodes matching X
2. Walk the `supersedes` chain for each hit
3. Find the node that was current at date Y: `created_at <= Y` and either
   `superseded_at IS NULL` or `superseded_at > Y`

### MCP Tool

```
search_memories({
  query: "database choice",
  as_of: "2026-08-15"
})
```

Returns results as they would have appeared on that date — superseded nodes
included if they were current then, current nodes excluded if they didn't exist
yet.

---

## Migration Path: Flat → Graph

### Phase 0: Schema addition (no behavioral change)

Add `memory_edges`, `memory_nodes`, and `vec_memory_nodes` tables. This is
additive — existing tables and queries are untouched. Old databases get the new
tables on next `initDatabase()`. No data migration needed.

**Estimated effort:** 1-2 days

### Phase 1: Edge-writing tools

Add `link_memories` and `trace_provenance` MCP tools. The model can start
creating explicit edges during sessions. No automatic inference yet.

**Estimated effort:** 3-5 days

### Phase 2: Conflict detection

Add the candidate-generation + classification pipeline to the sync/index path.
This is the first phase that needs an LLM call, so it requires the existing
summarizer infrastructure (which already makes API calls during sync).

**Estimated effort:** 1-2 weeks

### Phase 3: Temporal querying

Add `supersedes` chain walking and the `as_of` parameter to search tools. This
builds on the edge infrastructure from Phase 1.

**Estimated effort:** 3-5 days

### Phase 4: Inferred edges

Background indexer that proposes edges from embedding similarity and heuristics.
Most complex phase — needs careful tuning to avoid noisy false positives.

**Estimated effort:** 2-3 weeks

---

## Composition with platform-registry

The active `moe-platform-registry` worktree changes to `packages/memory/` are
**entirely packaging/distribution**, with zero overlap on the data model:

### Shared surfaces

| Surface | platform-registry | graph-memory | Conflict? |
|---|---|---|---|
| `packages/memory/mint/moe-memory.yaml` | Adds `distribution`, `artifact`, `targets` sections; rewrites `imported_works` format; updates URLs | Untouched | **None** — graph-memory changes nothing in the mint yaml |
| `packages/memory/package.json` | Rewrites description, keywords, homepage, repository, build script | Untouched | **None** |
| `packages/memory/tsconfig.json` | Adds `sourceMap: false`, `declarationMap: false` | Untouched | **None** |
| `packages/memory/src/types.ts` | **No changes** | Adds `MemoryNode`, `MemoryEdge` interfaces | **None** |
| `packages/memory/src/db.ts` | **No changes** | Adds new tables, new insert/query functions | **None** |
| `packages/memory/src/search.ts` | **No changes** | Adds `conflicts` to results, `as_of` parameter | **None** |
| `packages/memory/src/mcp-server.ts` | **No changes** | Adds 2-3 new MCP tools | **None** |

### How they compose

Platform-registry defines HOW memory is distributed (npm package, per-harness
targets, artifact payloads). Graph-memory changes WHAT memory stores and queries.
These are orthogonal axes:

- **Merge order doesn't matter.** Either can land first. Platform-registry
  changes build/packaging files; graph-memory changes src/ files. No file
  overlaps.
- **The `targets:` section in moe-memory.yaml needs no update** for graph-memory.
  The new MCP tools (`link_memories`, `trace_provenance`, `search_memories`) are
  served by the same `moe-memory` MCP server, which is already declared via
  `.mcp.json` in the plugin. Harnesses that support `mcp-registration` will pick
  them up automatically.
- **The `artifact.payloads` section works.** Graph-memory's new code compiles
  into `dist/` like everything else. The `{from: dist, to: dist}` payload
  captures it.
- **Codex compatibility is preserved.** Graph-memory adds MCP tools (which Codex
  can call) and SQLite tables (which are local). Nothing in the graph additions
  assumes a Claude-Code-specific API. The `harness` column on exchanges is
  already `'claude' | 'codex'`; `memory_nodes` and `memory_edges` are
  harness-agnostic.

### One integration concern

If platform-registry changes the build script (it does: `tsc -b --force`
replaces the old `tsc -b && copy-license` pipeline), ensure that any new
`src/` files from graph-memory compile under the new build. This is
automatically true since both use `tsc -b` — the `--force` flag just means
full rebuild instead of incremental. But verify after merge.

---

## Minimum Viable Graph vs Full Vision

### MVP (Phases 0 + 1): ~1 week

- New tables added to schema
- `link_memories` tool: model can create explicit edges
- `trace_provenance` tool: walk edge chains
- No automatic inference, no conflict detection, no temporal queries
- Value: the model can start building a knowledge graph session by session

### Mid-tier (+ Phase 3): ~2 weeks total

- Add `supersedes` chain walking and `as_of` search
- Value: temporal queries work, the model can track how beliefs evolve

### Full vision (all phases): ~6-8 weeks total

- Automatic conflict detection with LLM classification
- Background edge inference from embedding similarity
- Full causal chain traversal
- Value: memory becomes a self-maintaining knowledge graph with provenance

---

## Open Questions and Hard Problems

### 1. Edge inference quality
Embedding similarity alone produces too many false positives. The heuristic
layer (Phase 4) needs careful design. Options:
- Restrict to same-project edges only
- Require topic overlap (shared keywords) as a pre-filter
- Use a cheap LLM call (Haiku) for classification
- Let users delete bad edges

### 2. Storage growth
Each edge is ~200 bytes. A 10k-exchange corpus with 2 edges per exchange is
~4MB — negligible. But Phase 4's automatic inference could produce 10-50x more
edges. Need a pruning strategy for low-confidence edges.

### 3. Query performance
Graph traversal in SQLite is recursive CTEs, which are O(edges) per hop. For
depth-3 traversals on a corpus with <100k edges this is fast (<10ms). But the
full vision's inference engine could push edge counts much higher.

### 4. Conflict detection accuracy
LLM-based contradiction detection is imperfect. False positives ("these are
different but not contradictory") are worse than false negatives (missing a real
conflict). The confidence threshold needs tuning.

### 5. Cross-project edges
Should edges cross project boundaries? A decision in project A might be informed
by a finding in project B. The current `project` column on exchanges would need
to be optional on edges, which adds query complexity.

### 6. MCP tool ergonomics
The model needs to learn when to create edges. This is a meta-skill problem —
the model won't spontaneously call `link_memories` unless instructed. The
`remembering-conversations` skill in `packages/memory/` would need to teach
edge creation.

### 7. Backward compatibility
The MVP's additive schema is safe. But Phase 2's conflict detection inserts
edges automatically during sync — if it's buggy, it could fill the database
with garbage edges. Need a `moe-memory doctor` check for edge integrity.

---

## Estimated Effort Summary

| Phase | Scope | Effort | Dependencies |
|---|---|---|---|
| 0: Schema | Add tables, types, basic CRUD | 1-2 days | None |
| 1: Explicit edges | `link_memories` + `trace_provenance` tools | 3-5 days | Phase 0 |
| 2: Conflict detection | Candidate gen + LLM classification in sync | 1-2 weeks | Phase 1, summarizer infra |
| 3: Temporal queries | `supersedes` chains, `as_of` parameter | 3-5 days | Phase 1 |
| 4: Inferred edges | Background inference pipeline | 2-3 weeks | Phase 1, careful tuning |
| **Total** | | **6-8 weeks** | |

Phase 0+1 (MVP) is independently shippable and useful in ~1 week. Each
subsequent phase is independently shippable. The phases can be interleaved with
other work.
