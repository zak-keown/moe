# Moe Memory MCP Tools Reference

The moe-memory plugin exposes nine MCP tools in three groups. This file
documents the two **conversation** tools — harvested Claude Code and Codex
transcripts — in full, plus the two **graph / provenance** tools
(`link_memories`, `trace_provenance`) that connect and walk memory records
across the closed source-type set (`exchange`, `journal`, `decision`,
`finding`, `moedex_symbol`).

The five **journal** tools cover what you deliberately wrote down:
`process_thoughts`, `search_journal`, `read_journal_entry`,
`list_recent_entries` and `read_recent_entries`. They are self-describing at
`tools/list`; the one thing worth knowing is that `search_journal`'s `sections`
filter takes the same snake_case names as `process_thoughts`
(`project_notes`, `technical_insights`, …), and `type` selects the project
journal, the user journal, or both.

## search_conversations

Search your Moe Memory of past Claude Code and Codex conversations using semantic or text search.

**Tool name:** `mcp__plugin_moe-memory_moe-memory__search_conversations`

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | `string` or `string[]` | Yes | Search query. String for single-concept search, array of 2-5 strings for multi-concept AND search |
| `mode` | `"vector"` \| `"text"` \| `"both"` | No | Search mode (default: `"both"`). Only used for single-concept searches |
| `limit` | `number` | No | Maximum results to return, 1-50 (default: 10) |
| `after` | `string` | No | Only return conversations after this date (YYYY-MM-DD) |
| `before` | `string` | No | Only return conversations before this date (YYYY-MM-DD) |
| `response_format` | `"markdown"` \| `"json"` | No | Output format (default: `"markdown"`) |

### Search Modes

- **`vector`** - Semantic similarity search using embeddings
- **`text`** - Exact text matching (case-insensitive)
- **`both`** - Combined semantic + text search (default, recommended)

### Single-Concept Search

```typescript
{
  query: "React Router authentication errors",
  mode: "both",
  limit: 10
}
```

### Multi-Concept Search (AND)

Search for conversations containing ALL concepts:

```typescript
{
  query: ["authentication", "React Router", "error handling"],
  limit: 10
}
```

Note: `mode` is ignored for multi-concept searches (always uses vector similarity).

### Date Filtering

```typescript
{
  query: "refactoring patterns",
  after: "2025-09-01",
  before: "2025-10-01"
}
```

### Response Format

#### Markdown (default)

Human-readable format with:
- Project name and date
- Conversation summary
- Matched exchange snippet
- Similarity score
- File path and line numbers

#### JSON

Machine-readable format:
```json
{
  "results": [...],
  "count": 5,
  "mode": "both"
}
```

## read_conversation

Display a full conversation from Moe Memory as markdown.

**Tool name:** `mcp__plugin_moe-memory_moe-memory__read_conversation`

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | `string` | Yes | Absolute path to the JSONL conversation file |
| `startLine` | `number` | No | Starting line number (1-indexed, inclusive) |
| `endLine` | `number` | No | Ending line number (1-indexed, inclusive) |

### Usage

**Read entire conversation:**
```typescript
{
  path: "/Users/name/.config/moe/memory/conversation-archive/project/uuid.jsonl"
}
```

**Read specific range:**
```typescript
{
  path: "/Users/name/.config/moe/memory/conversation-archive/project/uuid.jsonl",
  startLine: 100,
  endLine: 200
}
```

### Response Format

Markdown-formatted conversation with:
- Message roles (user/assistant)
- Content (including tool uses and results)
- Line numbers for reference

## Error Handling

Both tools return errors as text content with `isError: true`:
- Invalid parameters (validation errors)
- File not found
- Date parsing errors
- Search failures

## Performance Notes

- **search_conversations** is fast (< 100ms typically)
- **read_conversation** can be slow for large conversations
  - Use `startLine`/`endLine` to paginate
  - Conversations can be 1000+ lines
- Vector search uses sqlite-vec with cached embeddings
- Text search is a bound-parameter SQL `LIKE`, not FTS5 — the upstream note claiming FTS5 was wrong

## link_memories

Create a typed edge between two memory records. `source` and `target` are
`type:id` strings; the `type` half must be one of the closed source-type set
(`exchange`, `journal`, `decision`, `finding`, `moedex_symbol`) or the call is
rejected.

**Tool name:** `mcp__plugin_moe-memory_moe-memory__link_memories`

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `source` | `string` | Yes | Source record as `type:id` (e.g. `exchange:abc123`) |
| `target` | `string` | Yes | Target record as `type:id` (e.g. `journal:def456`) |
| `relation` | `"caused_by"` \| `"contradicts"` \| `"supersedes"` \| `"supports"` \| `"implements"` | Yes | Relationship from source to target |
| `confidence` | `number` | No | Confidence in the relationship, 0.0–1.0 (default: 1.0) |

### Usage

```typescript
{
  source: "exchange:abc123",
  target: "decision:ghi789",
  relation: "caused_by",
  confidence: 0.9
}
```

## trace_provenance

Walk the relationship graph from a memory record and return the chain of
connected records. Use `causes` to find what led to a record, `effects` to
find what it influenced.

**Tool name:** `mcp__plugin_moe-memory_moe-memory__trace_provenance`

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | `string` | Yes | Starting record as `type:id` (e.g. `exchange:abc123`) |
| `depth` | `number` | No | Maximum traversal depth, 1–10 (default: 3) |
| `direction` | `"causes"` \| `"effects"` | No | Direction to walk (default: `"causes"`) |

### Usage

```typescript
{
  id: "decision:def456",
  depth: 3,
  direction: "causes"
}
```
