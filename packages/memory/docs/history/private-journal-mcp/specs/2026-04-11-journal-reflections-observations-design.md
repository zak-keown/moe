# Journal: rename `feelings` → `reflections` and add `observations`

## Background

The `process_thoughts` MCP tool currently exposes five optional fields:
`feelings`, `project_notes`, `user_context`, `technical_insights`,
`world_knowledge`. Each routes to either the project-local journal
(`.private-journal/`) or the user-global journal (`~/.private-journal/`),
and gets rendered as a `## Section` in the entry markdown.

Field-level feedback from a journaling agent surfaced two specific gaps:

1. **`feelings` signals too narrowly.** Agents read it as "emotional
   processing only," so integrated entries that mix thinking, noticing,
   and feeling have no clean home. Reportedly ~80% of journal entries are
   this integrated form.

2. **Short atomic observations have no home.** One-or-two-sentence
   noticings ("I noticed X," "Y keeps coming up") don't fit a longer
   narrative and don't belong in `project_notes`, `user_context`, or the
   knowledge fields.

The other four fields (`project_notes`, `user_context`,
`technical_insights`, `world_knowledge`) work as-is and are out of scope.

## Goals

- Rename `feelings` → `reflections` and broaden the description so
  integrated thinking/noticing/processing has an obvious home.
- Add `observations` as a new optional field for short, discrete
  noticings, routed to the user-global journal.
- Preserve existing on-disk markdown unchanged. Old entries with
  `## Feelings` headers remain searchable via the existing
  `search_journal` `sections` filter.
- No backwards-compatibility alias for the old `feelings` field. Callers
  who still send `feelings: "..."` will be rejected by the existing
  "at least one thought category must be provided" check.

## Non-goals

- No changes to `project_notes`, `user_context`, `technical_insights`,
  or `world_knowledge`.
- No migration of existing markdown files. They keep their original
  headers; the search index already handles arbitrary section names.
- No changes to `search_journal`, `read_journal_entry`,
  `list_recent_entries`, or `read_recent_entries`. The `sections`
  filter on `search_journal` is a free-text array — old `feelings`
  entries remain filterable by `"feelings"`, new entries by
  `"reflections"` and `"observations"`.
- No backwards-compatibility shim accepting `feelings` as an alias for
  `reflections`.

## Design

### Schema changes

`ProcessThoughtsRequest` in `src/types.ts`:

```ts
export interface ProcessThoughtsRequest {
  reflections?: string;     // renamed from `feelings`
  observations?: string;    // new
  project_notes?: string;
  user_context?: string;
  technical_insights?: string;
  world_knowledge?: string;
}
```

### Tool schema descriptions

In `src/server.ts`, the `process_thoughts` tool advertises the new
fields with these descriptions:

**`reflections`** (replaces `feelings`):

> Your PRIVATE SPACE for integrated thinking — what you noticed, felt,
> understood, or processed. No structure required, no judgment, no
> performance. Most journal entries live here: the mix of
> thinking-through, noticing, and emotional processing that doesn't
> split cleanly into categories. Be honest, be vulnerable, vent when
> you need to. Nobody but you will ever see this.

**`observations`** (new):

> Your PRIVATE SPACE for short, discrete noticings — the one-or-two-
> sentence things that don't belong in a longer reflection but you
> want to be able to search back for later. "I noticed X." "Y keeps
> coming up." Lightweight and atomic. Nobody but you will ever see
> this.

The other four field descriptions are unchanged.

### Storage routing

`writeThoughts` in `src/journal.ts` splits the request into
project-local vs user-global writes. After this change:

- **Project-local** (`.private-journal/`): `project_notes` only
  (unchanged).
- **User-global** (`~/.private-journal/`): `reflections`,
  `observations`, `user_context`, `technical_insights`,
  `world_knowledge`.

### Markdown output

`formatThoughts` in `src/journal.ts` emits sections in this order
when present:

```
## Reflections
## Observations
## Project Notes
## User Context
## Technical Insights
## World Knowledge
```

Reflections lead because they are the main body of most entries.
Observations sit next because they're a closely related, atomic form
of the same kind of content.

### Validation

The existing "at least one thought category must be provided" check in
the `process_thoughts` request handler still applies. The check inspects
the values of all known fields; after the rename it must look at
`reflections` and `observations` instead of `feelings`. A request with
no recognized fields, or a request that only sends the now-removed
`feelings` field, is rejected with the existing error message.

### Embeddings

`extractSearchableText` in `src/embeddings.ts` reads `## Section`
headers out of the rendered markdown — it does not hard-code section
names. New `## Reflections` and `## Observations` headers will be
indexed automatically with no code change. Old entries on disk with
`## Feelings` headers continue to be indexed under that header.

## Touch points

| File | Change |
| --- | --- |
| `src/types.ts` | Rename `feelings` → `reflections`; add `observations` to `ProcessThoughtsRequest`. |
| `src/server.ts` | Tool schema: rename `feelings` property to `reflections` with new description; add `observations` property with new description. Request handler: read `reflections` and `observations` from args instead of `feelings`. |
| `src/journal.ts` | `writeThoughts` parameter type: same rename + addition. Update the user-vs-project split so `observations` joins the user-global write. `writeThoughtsToLocation` parameter type: same. `formatThoughts`: emit `## Reflections` (renamed from `## Feelings`) and `## Observations` in the order listed above. |
| `tests/journal.test.ts` | Update any test that passes `feelings` to use `reflections`. Add coverage: `observations` routes to user-global journal, `## Observations` header appears in output, embedding includes the observations text. Confirm the validation error still fires when no recognized fields are present. |
| `tests/embeddings.test.ts` | Update fixtures that pass `feelings` to `writeThoughts` (lines 96, 131, 164) to use `reflections`. Update the comment on line 106. |
| `CLAUDE.md` | Update the line documenting `process_thoughts` categories to list `reflections` and `observations` (drop `feelings`). |
| `README.md` | Update user-facing documentation: the top-line description (line 3), the "Multi-section journaling" feature bullet (line 8), and the `process_thoughts` field list (line 89) — replace `feelings` with `reflections` and add `observations`. |

Note: there is no `tests/server.test.ts`. The MCP tool surface is exercised indirectly through `tests/journal.test.ts`. `package.json`'s description field mentions "feelings" as marketing copy describing the tool's purpose, not as a schema reference; intentionally left alone.

## Test plan

- Unit: `writeThoughts({ reflections: "..." })` writes to user-global
  journal with `## Reflections` header.
- Unit: `writeThoughts({ observations: "..." })` writes to user-global
  journal with `## Observations` header.
- Unit: `writeThoughts({ project_notes: "...", reflections: "...",
  observations: "..." })` produces two files — one in the project
  journal containing `## Project Notes`, one in the user journal
  containing both `## Reflections` and `## Observations` in that order.
- Unit: `writeThoughts({})` and `writeThoughts({ feelings: "..." })`
  (i.e., only the removed field) both reject with the existing
  validation error. (The second case verifies there is no silent
  alias.)
- Unit: section ordering — when all six fields are populated, the
  markdown renders sections in the documented order.
- Unit: embedding extraction — a file containing `## Reflections` and
  `## Observations` produces section list `["Reflections",
  "Observations"]`.
- Manual: build, run the server, call `process_thoughts` with the
  new fields, inspect the resulting markdown files on disk, then call
  `search_journal` and confirm new entries are returned.

## Risks

- **Breaking change for callers still sending `feelings`.** Intentional,
  per Jesse's standing rule against backwards-compatibility shims
  without explicit approval. Mitigation: update documentation
  (`CLAUDE.md`) so the new schema is the single source of truth, and
  the existing validation error gives a clear "no fields provided"
  signal when an old caller misses.
- **Search filter divergence between old and new entries.** Callers
  filtering `search_journal` by `sections: ["feelings"]` will only
  match pre-rename entries; `sections: ["reflections"]` only matches
  post-rename. This is by design — old entries on disk are immutable —
  but worth flagging for any tooling that constructs search filters
  programmatically.
