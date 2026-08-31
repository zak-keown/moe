# Store schema

One SQLite file, two record types, five tables. Read `src/db.ts` for the
authoritative definitions — this file is a map, and the upstream copy of it was
already three migrations stale (it documented `exchanges` without `harness`,
`agent_version`, `model`, `model_provider` or `embedding_version`).

Location: `<data dir>/conversation-index/db.sqlite`, where the data directory is
`MOE_MEMORY_CONFIG_DIR`, else `$MOE_DATA_DIR/memory`, else
`$XDG_CONFIG_HOME/moe/memory`, else `~/.config/moe/memory`.
`MOE_MEMORY_DB_PATH` overrides the file outright.

`journal_mode = WAL`, and the `sqlite-vec` extension is loaded on every open.

## Conversation exchanges — harvested transcript turns

### `exchanges`

One row per user/assistant exchange, keyed by
`md5(archivePath + ':' + lineStart + '-' + lineEnd)`.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | see above |
| `project` | TEXT NOT NULL | directory name, or Codex's `cwd` basename |
| `timestamp` | TEXT NOT NULL | ISO 8601, from the last assistant message |
| `user_message` | TEXT NOT NULL | |
| `assistant_message` | TEXT NOT NULL | assistant turns joined with `\n\n` |
| `archive_path` | TEXT NOT NULL | the archived copy, not the live transcript |
| `line_start` | INTEGER NOT NULL | 1-indexed |
| `line_end` | INTEGER NOT NULL | the high-water mark incremental sync resumes from |
| `embedding` | BLOB | **vestigial** — vectors live in `vec_exchanges`. Never written. |
| `last_indexed` | INTEGER | epoch ms; `verify` compares it against the file's mtime |
| `parent_uuid` | TEXT | |
| `is_sidechain` | BOOLEAN DEFAULT 0 | search excludes sidechains |
| `harness` | TEXT NOT NULL DEFAULT 'claude' | `claude` or `codex` |
| `session_id` | TEXT | |
| `cwd` | TEXT | |
| `git_branch` | TEXT | |
| `claude_version` | TEXT | |
| `agent_version` | TEXT | harness-neutral; falls back to `claude_version` |
| `model` | TEXT | |
| `model_provider` | TEXT | Codex only |
| `thinking_level` | TEXT | |
| `thinking_disabled` | BOOLEAN | |
| `thinking_triggers` | TEXT | JSON array |
| `embedding_version` | INTEGER NOT NULL DEFAULT 0 | see below |

Indexes: `idx_timestamp` (DESC), `idx_session_id`, `idx_project`, `idx_harness`,
`idx_sidechain`, `idx_git_branch`.

### `tool_calls`

`FOREIGN KEY (exchange_id) REFERENCES exchanges(id) ON DELETE CASCADE`. Earlier
versions had no CASCADE, so deleting an exchange with tool calls raised
`SQLITE_CONSTRAINT_FOREIGNKEY` (#81) and orphans accumulated;
`migrateToolCallsCascade` detects the legacy shape by string-matching
`sqlite_master.sql`, drops orphans and rebuilds.

| Column | Type |
|---|---|
| `id` | TEXT PK |
| `exchange_id` | TEXT NOT NULL → `exchanges.id` |
| `tool_name` | TEXT NOT NULL |
| `tool_input` | TEXT (JSON) |
| `tool_result` | TEXT |
| `is_error` | BOOLEAN DEFAULT 0 |
| `timestamp` | TEXT NOT NULL |

Indexes: `idx_tool_name`, `idx_tool_exchange`.

### `vec_exchanges`

```sql
CREATE VIRTUAL TABLE vec_exchanges USING vec0(
  id TEXT PRIMARY KEY,
  embedding FLOAT[384]
)
```

Written as `Buffer.from(new Float32Array(embedding).buffer)`. The virtual table
rejects `REPLACE`, so every write is DELETE-then-INSERT.

## Journal entries — deliberately written

### `journal_entries`

One row per markdown file. The **markdown file is the source of truth**; this
table is a rebuildable index (`moe-memory journal index`).

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | `md5(scope + ':' + path relative to its root)` — survives the root moving |
| `path` | TEXT NOT NULL UNIQUE | absolute, **refreshed from the walk on every index run** |
| `scope` | TEXT NOT NULL | `project` or `user`. Stored, not derived from the directory. |
| `timestamp` | INTEGER NOT NULL | epoch ms, from the entry's own frontmatter |
| `text` | TEXT NOT NULL | frontmatter- and heading-stripped body; what gets embedded |
| `sections` | TEXT NOT NULL | JSON array of rendered headings, e.g. `["Project Notes"]` |
| `source_mtime_ms` | INTEGER NOT NULL | so an edited entry re-indexes |
| `last_indexed` | INTEGER | epoch ms |
| `embedding_version` | INTEGER NOT NULL DEFAULT 0 | see below |

Indexes: `idx_journal_scope`, `idx_journal_timestamp` (DESC), `idx_journal_path`
(UNIQUE).

`path` being refreshed and `id` being root-relative are both deliberate:
`private-journal-mcp` stored an absolute path as the record's identity inside its
sidecar, so renaming the journal directory made search return paths that
`read_journal_entry` then refused.

### `vec_journal_entries`

Same shape as `vec_exchanges`: `vec0(id TEXT PRIMARY KEY, embedding FLOAT[384])`.

## `embedding_version`

Both record types carry it, and `EMBEDDING_VERSION` in
`src/embedding-migration.ts` is the current value — **2**.

It must be bumped by anything that changes the model, dtype, query prefix,
pooling, normalisation or truncation. Two encoders' vectors can be dimensionally
identical and semantically incomparable, so a mixed corpus does not error, it
just ranks wrongly. `moe-memory sync` re-embeds stale `exchanges` rows in
lock-protected, resumable batches (`MOE_MEMORY_MIGRATION_BATCH`, default 500);
stale `journal_entries` rows are re-indexed by the journal walk.

1 → 2 on the merge, because journal entries had been embedded with
`Xenova/all-MiniLM-L6-v2` and exchanges with `Xenova/bge-small-en-v1.5`.

## Files beside the database

| Path | What |
|---|---|
| `<data>/conversation-archive/<project>/<session>.jsonl` | the archived transcript |
| `<data>/conversation-archive/<project>/<session>-summary.txt` | AI summary, or a sentinel: empty = zero-exchange, permanent skip; `__ERRORED__\n` prefix = retryable failure |
| `<data>/conversation-index/exclude.txt` | one project name per line, `#` comments |
| `<data>/conversation-index/.embedding-migration.lock` | migration mutex |
| `<data>/logs/moe-memory.log` | hook and background sync log |
| `<data>/logs/moe-memory-sync.lock` | single-instance sync mutex |
| `<data>/models/` | the ONNX model cache |
| `<data>/journal/YYYY-MM-DD/HH-MM-SS-µµµµµµ.md` | user-global journal entries |
| `<project>/.moe-journal/YYYY-MM-DD/HH-MM-SS-µµµµµµ.md` | project journal entries |
