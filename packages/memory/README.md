# @bubstack/moe-memory

Semantic recall over past sessions and journal entries. One embedding layer, one
store, two record types, one MCP server.

A **conversation exchange** is *harvested*: sync copies a transcript out of
`~/.claude/projects`, `~/.claude/transcripts` or `~/.codex/sessions`, and the
indexer derives rows from it. Nobody chose to write it down. A **journal entry**
is *deliberate*: the model called `process_thoughts` and a markdown file was
written. They share an encoder and a SQLite file; they share nothing else.

Ships as the **`moe-memory`** plugin, generated into `/plugins/moe-memory` by
`@bubstack/moe-mint`. Never hand-edit the generated manifest. Works as a Claude
Code plugin and as a **Codex plugin** — see [docs/CODEX.md](docs/CODEX.md).

**Status:** imported and reconciled. 258 tests passing across 37 suites in the
CI-safe project; 36 more across 9 suites in the opt-in `model` project, which
needs a one-time ~35 MB encoder download. See
[Verification](#verification).

## Forked from

| Upstream repo | Pinned | License |
|---|---|---|
| `episodic-memory` | `1075769` | MIT |
| `private-journal-mcp` | `016953f` | MIT |

Both are MIT with the same copyright holder and byte-identical `LICENSE` files,
so one retained `LICENSE` (Copyright © 2025 Jesse Vincent) covers both — said out
loud here rather than silently dropping one. The scaffold's `package.json` said
`Apache-2.0`; the inbound licence governs, so it is `MIT` — the same correction
`packages/glass` and `packages/crew` made.

Snapshots are in `../../../.moe-references/` (gitignored). They are the spec —
not upstream `main`. See [PARITY.md](../../PARITY.md).

## Layout

```
src/cli.ts             The dispatcher and the package's single bin.
src/mcp-server.ts      One MCP server, seven tools, both record types.
src/{db,embeddings,paths,types}.ts
                       The four reconciled modules. Read their headers first —
                       they say which implementation won and what was lost.
src/embedding-migration.ts
                       Lock-protected, resumable, batched re-embedding. The
                       mechanism that makes changing encoders survivable.
src/{parser,indexer,sync,summarizer,verify,stats,show}.ts
                       The conversation half: harvest, parse, embed, summarise.
src/{doctor,codex-support,codex-hook-trust}.ts
                       Codex diagnostics behind `moe-memory doctor codex`.
src/journal/           The journal half: store (write + index), search,
                       markdown (the on-disk format), legacy-sidecars.
src/install-check.ts   A dependency probe that diagnoses and never installs.
skills/remembering-conversations/
                       The skill: SKILL.md plus an MCP tool reference.
agents/search-conversations.md
                       A haiku-model search agent, dispatched from the skill.
prompts/search-agent.md  The search agent's output contract.
hooks/hooks.json       SessionStart -> `moe-memory sync --background`.
.mcp.json              The MCP server declaration and its env-var allowlist.
test/                  37 CI-safe suites.
  fixtures/            Five upstream transcript fixtures (2.9 MB). Input data.
  model/               9 suites that need the real encoder. Opt-in.
  manual/              The two live e2e harnesses. Real auth, real binaries.
docs/CODEX.md          Codex setup and troubleshooting.
docs/SCHEMA.md         The store's schema, regenerated from db.ts.
docs/history/          Both upstreams' plans, specs, dev notes and
                       private-journal-mcp's CHANGELOG. Inherited record, left
                       byte-identical — see below.
```

## The reconciliation

Both sources shipped `embeddings.ts`, `paths.ts`, `search.ts` and `types.ts` —
the same four jobs written twice, independently — and embedded with two releases
of the same library, because `@xenova/transformers` is the former name of
`@huggingface/transformers`. Two model downloads, two indexes, two MCP
registrations, for one capability.

`episodic-memory` is the substrate. It won on every axis that mattered:
`@huggingface/transformers` ^4 against `@xenova` ^2 (same library, two majors),
`@modelcontextprotocol/sdk` ^1.20 against ^0.4 (four majors, and a breaking
constructor), vitest against jest, a real vector store against a
file-per-entry scan — and, decisively, an existing embedding-version migration.

| Concern | Winner | What was lost |
|---|---|---|
| `embeddings.ts` | episodic: module functions over a module-level pipeline, `Xenova/bge-small-en-v1.5` at dtype q8, 2000-char truncation, the asymmetric BGE query prefix, the import-time `env` mutations that keep transformers.js off stdout | journal's `EmbeddingService` singleton — private constructor, `private readonly modelName`, so one process could only ever hold one model. Its `cosineSimilarity` went too; the store computes similarity in SQL. |
| `paths.ts` | union — zero name overlap between the ten transcript-locating functions and the three journal-resolving ones | nothing functional. Four env namespaces became one. |
| `search.ts` | episodic: sqlite-vec KNN, SQL LIKE, bound-parameter metadata filters | journal's in-memory sidecar scan: O(n) I/O and O(n) memory per query, no cache. Its `readEntry` containment guard and `generateExcerpt` were carried forward. |
| `types.ts` | episodic — journal's was **entirely dead** (`JournalEntry`, `ServerConfig`, `ProcessThoughtsRequest` had zero importers anywhere in its src or tests) | nothing. The names are re-established as live types, and the six-field thought shape that journal retyped inline in four places is now one declaration. |
| `index.ts` | episodic's re-export barrel keeps the filename | journal's `index.ts` was the executable bin. It became `src/cli.ts`, which the package's single `bin` points at. |

Three things were carried **forward** from the losing encoder because they were
better there: the memoised init promise, the load timeout with retry (the memo is
cleared so the next call retries rather than awaiting a dead promise), and the
reset seam its two timeout tests need. `episodic-memory` had none of them.

### EMBEDDING_VERSION is 2

Journal entries were embedded upstream with `Xenova/all-MiniLM-L6-v2` and
exchanges with `Xenova/bge-small-en-v1.5`. **Both are 384-dimensional**, so a
unified vec0 column accepts either vector without complaint and a mixed corpus
ranks wrongly with no error, no log line and no type error. That is exactly the
event `EMBEDDING_VERSION` exists for, so it goes 1 → 2 as part of the merge and
`sync` re-embeds stale rows in lock-protected, resumable batches.

Anything that changes model, dtype, prefix, pooling, normalisation or truncation
must bump it again. `l2DistanceToCosineSimilarity` in `src/search.ts` is
mathematically valid *only* because `embeddings.ts` passes `normalize: true`, and
both record types now depend on that one line.

### Journal entries get rows, not sidecars

`private-journal-mcp` wrote a `<entry>.embedding` JSON sidecar beside every
`<entry>.md`. Journal entries are rows in `journal_entries` +
`vec_journal_entries` now, and the markdown files are the source of truth that
`moe-memory journal index` rebuilds from. That swap fixed three defects:

- **An entry whose encode failed was permanently invisible.** Upstream caught and
  logged every embedding error so "embedding failure shouldn't prevent journal
  writing" — but the sidecar index was the *only* enumeration path in the whole
  package, so the entry was written and then unreachable by search,
  `list_recent_entries` and `read_recent_entries` alike, with no doctor or verify
  command to notice. The `.md` is authoritative here; `indexJournal()` picks it up
  on the next run.
- **Search returned paths that read then refused.** `EmbeddingData.path` was an
  absolute path baked into the JSON, and search returned *that*, not the path it
  had just walked — so renaming the journal directory produced hits that
  `read_journal_entry` rejected with a security-flavoured error. The `path` column
  is refreshed from the walk on every index run, and the entry's id is
  `md5(scope + ':' + path relative to its root)`, which survives the root moving.
- **A stale sidecar was never re-embedded.** `generateMissingEmbeddings()` keyed
  purely on the *absence* of a sidecar. The scan now re-indexes when the file's
  mtime moved or its row is behind `EMBEDDING_VERSION`, and prunes rows whose file
  is gone.

`moe-memory journal import-legacy` reconciles what upstream left on disk. It
imports nothing from the sidecars — the vectors are from the wrong encoder and
the path is stale, so both are discarded and the entry is re-embedded from its
markdown — it finds orphans and, with `--remove`, deletes sidecars once their
entry is indexed. Opt-in, because deleting a file an upstream install might still
read is not something to do silently.

### Scope is a column now

`type: 'project' | 'user'` was **derived at read time from which directory the
file was walked out of** and never stored. That broke the moment both roots
resolved to the same directory — the documented containerised configuration —
where upstream loaded the one directory twice, once labelled `project` and once
`user`, so every entry appeared twice with contradictory labels and `limit: 10`
yielded 5 unique entries. Roots are de-duplicated, scope is stored, and when the
roots *are* collapsed the entry's own sections decide (only `project_notes` ever
routes to the project journal, so a `## Project Notes` heading is a faithful
discriminator either way).

### Other upstream defects fixed while porting

- **Four of six documented `sections` filter values matched nothing.**
  `search_journal` compared the caller's snake_case names against the *rendered*
  heading text, so only `reflections` and `observations` ever matched — and the
  broken form was the worked example inside the live tool description, i.e. the
  model was actively instructed to pass filters that silently returned zero
  results. Both sides are normalised now; `feelings` still matches pre-2.0.0
  `## Feelings` entries, which is the one compatibility promise upstream made to
  data already on disk.
- **`repairIndex` was the one indexing path that required live Claude auth.** The
  summarizer call and the indexing loop shared a single try/catch, so a transient
  API error meant the exchanges were never indexed. It writes the same error
  sentinel the indexer and sync write (#96) and carries on, and it takes
  `{ noSummaries }` like every other indexing entry point already did.
- **`paths.test.ts` failed on any machine that actually used the tool.** It
  snapshotted `process.env` but never cleared `PRIVATE_JOURNAL_PATH`, which
  returns before all other logic, so 8 of its 13 tests failed for exactly the
  population running them. Two more jest-isms went with it: `process.env =
  originalEnv` replaces Node's special env object with a plain one, and
  `jest.spyOn(process, 'cwd')` was never restored.
- **`multi-concept.test.ts` read the developer's real production index.** It set
  no override at all, so `getDbPath()` resolved to
  `~/.config/superpowers/conversation-index/db.sqlite` — read *and created* on a
  developer box, empty in CI, with every assertion guarded by
  `if (results.length > 0)` so it passed vacuously. Its own comment claimed "the
  fixture corpus mentions skills and research repeatedly"; the file indexed no
  fixtures. It does now.
- **`--limit ''` parsed to `NaN`.** Same class of bug the strict base found in
  `packages/glass`; here it was found by reading the arg parser while collapsing
  the CLI layer. Rejected explicitly.
- **`escapeHtml` and `extractSearchableText` had regex bugs.** The HTML escaper's
  map lookup could return `undefined`; the frontmatter stripper did not handle
  `\r\n`, so a CRLF entry embedded its own frontmatter.

## What changed on import

**Four bins and a shim layer became one `moe-memory`.** Upstream shipped
`episodic-memory`, `-index`, `-search` and `-mcp-server`, pointing at four
extensionless files that spawned four `.js` dispatchers that spawned the compiled
`dist/*-cli.js` scripts — `join(__dirname, '../dist')` three times, two of them
resolving `__dirname` through `realpathSync` and two not, so half of them broke
under a symlinked bin. There is now one bin at `./dist/cli.js` with subcommands,
each `*-cli.ts` exports a function, and the dispatcher calls them in-process.
**There is no `../dist/` prefix left in the package.**

| Old invocation | New |
|---|---|
| `episodic-memory sync` | `moe-memory sync` |
| `episodic-memory index --cleanup` | `moe-memory index --cleanup` |
| `episodic-memory-index --verify` | `moe-memory index --verify` |
| `episodic-memory-search "q"` | `moe-memory search "q"` |
| `episodic-memory show f.jsonl` | `moe-memory show f.jsonl` |
| `episodic-memory stats` | `moe-memory stats` |
| `episodic-memory doctor codex` | `moe-memory doctor codex` |
| `episodic-memory-mcp-server` | `moe-memory mcp-server` |
| `private-journal-mcp --journal-path D` | `moe-memory mcp-server --journal-path D` |
| — (new) | `moe-memory journal {index,search,recent,paths,import-legacy}` |

**Dropped the esbuild bundle.** `dist/mcp-server.js` was an esbuild bundle with
eight `--external:` flags — including `better-sqlite3`,
`@huggingface/transformers` and `sqlite-vec`, i.e. everything that actually
matters — so it was never self-contained and the plugin directory always needed a
resolvable `node_modules`. All it bundled was `zod`, `marked` and the MCP SDK.
`tsc -b` output only. The generated plugin must carry a built `dist/` and reach
its dependencies, which was already true.

**Dropped the postinstall script.** It ran `npm rebuild better-sqlite3` — wrong
tool inside a pnpm workspace, and redundant with `allowBuilds`, which is where the
native-binding guarantee lives now. The Windows lesson it encoded (`2>/dev/null ||
true` is not valid cmd.exe, so `npm install` exited non-zero even on success,
#95) is recorded here rather than in code.

**`cli/install-check.js` cannot install any more, and that is the point.** It
probed `<pluginRoot>/node_modules/<pkg>/package.json` for six packages and, on
any miss, ran `npm install --no-audit --no-fund` inside the plugin root. Under
pnpm's non-flat store that probe is broken by construction — and one of the six,
`onnxruntime-node`, **is not a declared dependency at all**; it arrives as an
optional dependency of `@huggingface/transformers`, which resolves it from its own
tree. So the probe returned a false positive on *every* MCP server start, and
every start shelled out to npm inside a pnpm workspace. `src/install-check.ts`
resolves rather than path-probes, and prints one line telling the operator to run
`pnpm install`.

**`src/version.ts` is checked in, not generated.** It was produced by
`scripts/generate-version.js` from npm `prebuild`/`pretest` hooks and gitignored,
so it was absent from the pinned snapshot and a fresh checkout could neither
typecheck nor test. There is no npm lifecycle hook to hang a generator on under
turbo and `tsc -b`, so it is a constant and `test/version-consistency.test.ts` is
the guard. `private-journal-mcp` shows the failure mode: its MCP server reported a
hardcoded `version: '1.0.0'` while its package.json said `2.0.1`.

**`env.cacheDir` is pinned.** Upstream set neither `cacheDir` nor a local model
path, so the first `initEmbeddings()` fetched the model into whatever
transformers.js defaults to — under pnpm a path inside the content-addressed
store, shared across the workspace and possibly read-only in a container. It is
`<data dir>/models` now and moves with `MOE_MEMORY_CONFIG_DIR`, which is what
makes the `model` test project reproducible.

**Two vitest projects.** Ten suites reached the encoder. `pnpm test` is the
CI-safe set — no network, no model, no Claude auth; `pnpm test:model` is opt-in.
Where a file was mostly offline with one encoder-dependent test — the embedding
migration, verify's repair block, exclude-nested, sync's indexing test — the test
was split out rather than exiling the whole suite.

**jest → vitest, three suites.** `tests/setup.ts` globally mocked
`@xenova/transformers` through `setupFilesAfterEach`; `vi.mock()` is hoisted per
test *file* and does not work from a setup file, so a literal port would have
silently stopped intercepting and started downloading a real ONNX model inside
tests that already carried 30–90 s timeouts — a slow CI flake, not an obvious
missing mock. The two timeout tests could not be ported literally either: they
exploited ts-jest's forced `module: 'commonjs'` to reassign
`transformers.pipeline` on the module object, which ESM does not permit. They are
`vi.mock` + `vi.mocked` now. The encoder is injected into `JournalStore` and
`JournalSearchService` instead, so the offline suites exercise real ranking rather
than a stub that returned one vector for every input.

**`tsconfig` excluded `test/` upstream**, so all 38 suites were unchecked. They
are checked now — 34 errors on first contact, all `noUncheckedIndexedAccess` on
assertion subscripts and `verbatimModuleSyntax` on type imports.

### The strict base found no new bugs in src, and one design smell

103 errors across 10 files, and every one was a shape problem rather than a
defect: 72 `noUncheckedIndexedAccess` reads in `show.ts` (fixed by
`Array.prototype.entries()` and one explicit guard, no casts), 8
`verbatimModuleSyntax` type imports, and a cluster of
`exactOptionalPropertyTypes` errors on options bags whose `x?: T` declarations
genuinely mean `x?: T | undefined` — `ExchangeBuilder`'s thirteen transcript
fields, `CodexSummarizerCommand`, `IndexStats.dateRange`. Widening the
declarations is what those interfaces actually say. No casts, no loosened base,
no per-package escape hatch.

The one thing worth flagging is not a type error: `search.ts` returned
`similarity: undefined` into a field declared `similarity: number` and papered
over it with `as SearchResult & { summary?: string }`. `mode: 'text'` has no
vector and therefore no similarity; the field is `number | undefined` now and the
cast is gone.

## Rebrand, and what was deliberately left alone

**293 measured token occurrences swept across 53 files** on the
`episodic-memory` side. Applied longest-token-first, with separate passes for the
ALL-CAPS, Title-Case, PascalCase and snake_case forms, because a lowercase-kebab
sweep misses every one of them.

The `private-journal-mcp` side (another ~40 identifiers across 10 files) was
**not** swept — its five modules were rewritten rather than renamed, so those
identifiers were re-authored. Counts below are from the upstream snapshots,
restricted to the files actually imported.

| Kind | Upstream | Moe | Count |
|---|---|---|---|
| package, plugin, server key, bin — all kebab forms including the compounds below | `episodic-memory` | `moe-memory` | 145 |
| env vars, 14 distinct, ALL-CAPS | `EPISODIC_MEMORY_*` | `MOE_MEMORY_*` | 84 |
| data directory, and the env var that pointed at it | `superpowers`, `PERSONAL_SUPERPOWERS_DIR` | `moe/memory`, `MOE_DATA_DIR` | 33 |
| display name, spaced Title Case | `Episodic Memory` | `Moe Memory` | 25 |
| plugin-id prefix | `episodic-memory@episodic-memory-dev` | `moe-memory@moe` | 12 |
| Claude Code tool name (two renamed identifiers in one string) | `mcp__plugin_episodic-memory_episodic-memory__search` | `mcp__plugin_moe-memory_moe-memory__search_conversations` | 11 |
| marketplace name | `episodic-memory-dev` | `moe` | 7 |
| lowercase prose | `episodic memory` | `Moe Memory` | 3 |
| PascalCase identifier | `hookBelongsToEpisodicMemory` | `hookBelongsToMoeMemory` | 2 |
| Codex's underscore-normalised tool name | `mcp__episodic_memory__` | `mcp__moe_memory__` | 1 |
| **re-authored, not swept:** journal env var | `PRIVATE_JOURNAL_PATH` | `MOE_MEMORY_JOURNAL_PATH` | 20 |
| **re-authored:** journal directory | `.private-journal` | `.moe-journal` | 31 |
| **re-authored:** bin and server class | `private-journal-mcp`, `PrivateJournalServer` | folded into `moe-memory` | 10 |
| **re-authored:** dependency | `@xenova/transformers` | `@huggingface/transformers` | 8 |
| **re-authored:** CLI flag | `--journal-path` | `moe-memory mcp-server --journal-path` | 3 |

Four of those are **silent-failure renames** — they break at runtime, not at read
time, and nothing reports them:

- `agents/search-conversations.md`'s `tools:` frontmatter. A stale
  `mcp__plugin_…` string leaves the agent with **no tools and no error**.
- `src/codex-hook-trust.ts`'s `startsWith('moe-memory@')`. A stale prefix makes
  `moe-memory doctor codex` report hook trust `not_found` forever.
- `src/doctor.ts`'s `startsWith('moe-memory ')` — **with a trailing space**. A
  stale prefix makes doctor report the MCP server `missing` forever.
- `.mcp.json`'s `env_vars` allowlist. A var renamed in code but not here is
  simply not passed through to the server.
  `test/codex-plugin.test.ts` now diffs that allowlist against the `MOE_*` names
  `src/paths.ts` actually reads, so the fourth cannot drift again.

### `<INSTRUCTIONS-TO-EPISODIC-MEMORY>` is honoured forever

The in-transcript DO-NOT-INDEX marker is **data, not a brand token**. It is
hyphenated ALL-CAPS (invisible to both a lowercase and an underscore sweep), it is
matched literally, and people have already typed it into transcripts sitting on
disk. Renaming it and dropping the old form does not fail loudly — it silently
starts indexing every conversation a user explicitly opted out of. So
`EXCLUSION_MARKERS` carries both:

```
<INSTRUCTIONS-TO-MOE-MEMORY>DO NOT INDEX THIS CHAT</INSTRUCTIONS-TO-MOE-MEMORY>
<INSTRUCTIONS-TO-EPISODIC-MEMORY>DO NOT INDEX THIS CHAT</INSTRUCTIONS-TO-EPISODIC-MEMORY>
```

`test/exclusion-markers.test.ts` pins both, offline. Upstream had one assertion on
it, inside an encoder-dependent sync test.

### The data directory moved, and there is no migration

`~/.config/superpowers/` → `~/.config/moe/memory/`. Cache and state directory
names are Zone A, and this is the same call `packages/glass` made for
`~/.cache/superpowers/`. But it is a **deliberate, announced reset**, not a
migration: `getMemoryDataDir()` is the single root for the archive, the index,
`exclude.txt`, the logs, the locks, the model cache and the user journal, and
renaming it makes an existing upstream index invisible with no error — the tool
would report an empty index and re-sync from scratch, which means re-downloading
the model, re-embedding everything and re-running *paid* summarisation over the
user's whole history.

So it is announced instead of moved. `findLegacyDataDir()` detects the upstream
directory and both `moe-memory sync` and `moe-memory doctor codex` print where it
is. Copying it across is a one-liner the user runs knowingly:

```sh
mkdir -p ~/.config/moe && cp -a ~/.config/superpowers ~/.config/moe/memory
```

Moving a multi-gigabyte archive behind someone's back is worse than telling them
where it is.

**`conversation-archive/` and `conversation-index/` keep their names.** They
describe what they hold — the `chrome-ws` precedent from `packages/glass`.

### `PRIVATE_JOURNAL_PATH` still works, with a warning

An unset override does not error, it silently changes where entries land: a
containerised deployment writing to `/data/journals` would start writing to `cwd`
with no message. So the upstream name is honoured, `MOE_MEMORY_JOURNAL_PATH` wins
if both are set, and the deprecation warning prints once per process.

### Kept deliberately

**`remembering-conversations`, `search-conversations` and `index-conversations`.**
They describe what they are, and two of them are load-bearing:
`SKILL.md` dispatches `subagent_type: "search-conversations"`, matched against the
agent *filename*. Renaming buys no identity and costs churn — the same reasoning
`glass` applied to `chrome-ws` and `crew` to `driving-claude-code-sessions`.

**`Xenova/bge-small-en-v1.5` and `Xenova/all-MiniLM-L6-v2`.** `Xenova/` here is a
Hugging Face **org namespace inside a model id**, resolved over the network — not
a vendor brand. A case-insensitive `xenova` sweep (which the
`@xenova/transformers` → `@huggingface/transformers` rename legitimately wants)
corrupts it into a 404 at model load, i.e. at runtime, not at compile time.

**`jesse` in four test files.** Synthetic `cwd` values like
`/Users/jesse/Documents/GitHub/example-project` inside hand-written test
fixtures. `jesse` is not in the fork's brand-token list — the same call
`packages/crew` made.

**`src/summarizer.ts`'s issue link stays on GitHub.** `github.com/obra/episodic-memory/issues/98`
is provenance: it cites the report that explains why `getCodexModel` returns
`undefined` by default. The eight self-referential manifest URLs became GitLab.
This is the one place the blanket URL sweep got it wrong and had to be reverted by
hand — worth knowing, because the sweep rewrites `github.com/obra/<pkg>` *after*
`<pkg>` has already become `moe-memory`, so the provenance URL looks
self-referential by the time the URL rule runs.

**`CHANGELOG.md`, `LICENSE` and `docs/history/` are untouched — byte-identical to
upstream, verified with `diff`.** They describe two projects that *were* called
`episodic-memory` and `private-journal-mcp`. Rewriting them would falsify the
record and, for `LICENSE`, break the MIT notice. `episodic-memory`'s CHANGELOG
credits two outside contributors (@minyek #93, @monsterxz9 #99) and names env vars
that no longer exist under their old names; `private-journal-mcp`'s is the only
written record of the `feelings` → `reflections` rename, the ESM migration that
fixed an empty `tools/list` on Node 22+, and why the 30 s model timeout exists.

**`test/fixtures/*.jsonl` are excluded from every sweep.** 2.9 MB of the upstream
author's real, partially-scrubbed transcripts — 146 brand tokens, 23 `obra`, 10
`mcp__private-journal__` tool calls, 8 residual `Jesse`. They are also the
executable spec for the parser, show, verify, stats and integration suites, which
assert on their content. Sweeping them would corrupt the corpus *and* rewrite
someone else's words. Kept, unswept, and the judgment holds only because
PARITY.md's distribution boundary means nothing leaves the company.

### Where the upstream files went

| Upstream path | Here | Why |
|---|---|---|
| `episodic-memory/CLAUDE.md` | `docs/history/episodic-memory/CLAUDE.md` | Dev-facing, and it documents an 8-step release runbook with `gh release create` that is void under the no-public-publishing decision. Relocated, not swept: a swept copy would document a process that does not exist. |
| `episodic-memory/docs/superpowers/plans/` | `docs/history/episodic-memory/plans/` | Upstream plan. Moved as an opaque directory — the `superpowers` path segment is itself a brand token that must not be swept *inside* the file. |
| `private-journal-mcp/docs/` (5 records) | `docs/history/private-journal-mcp/` | Spec, implementation plan, the raw authoring transcript, and the 804-line 2.0.0 field-rename plan. Per-source subdirectories, because both upstreams had a `docs/superpowers/plans/` and flattening them would destroy which record belongs to which. |
| `private-journal-mcp/CHANGELOG.md` | `docs/history/private-journal-mcp/CHANGELOG.md` | Zone B. `episodic-memory`'s keeps the package root, being the substrate's. |
| `private-journal-mcp/README.md` | `docs/history/private-journal-mcp/README.md` | Superseded by this file; kept because it documents the pre-merge MCP config people may still have. |
| `scripts/{claude,codex}-e2e.js` | `test/manual/` | Opt-in harnesses needing live auth and a *generated* plugin dir. `test/manual/**` is biome-excluded by the root config and collected by neither vitest project. |
| `cli/` (9 files) | `src/cli.ts` | The whole shim layer. |

### Not imported

| Path | Why |
|---|---|
| `.private-journal/2025-05-27/*.md` | Two of the upstream author's own journal entries, committed upstream. The content is trivially "boop", but they are his journal directory and not ours to redistribute — the same call `packages/glass` and `packages/crew` made. |
| `dist/` (58 files, 1.3 MB) | Committed upstream and **already stale**: `dist/version.js` said `1.4.1` while package.json said `1.4.2`. Its premise — the plugin is installed by cloning the repo, so "CI doesn't rebuild for you" — is void when mint generates the plugin. Gitignored here. |
| `scripts/bump-version.sh` (220 lines), `.version-bump.json` | A 3-file version lockstep driving a release runbook that publishes and edits a sibling marketplace repo. Moe publishes nothing publicly and has one root marketplace. |
| `scripts/scrub-fixtures.sh` | Upstream data-hygiene tooling: 8 `sed` patterns that scrub the author's PII out of the fixtures. Neither Zone A nor B, and a sweep would rewrite the patterns and make it silently stop matching. Deleted rather than swept. |
| `scripts/generate-version.js` | See `src/version.ts` above. |
| `scripts/postinstall.js` | See above. |
| `cli/mcp-server-wrapper.js` | Its reason for existing was the `npm install` path. |
| `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json` | `@bubstack/moe-mint` generates manifests. Read for identifiers: name `episodic-memory`, author Jesse Vincent, homepage/repository `github.com/obra/episodic-memory`, keywords `memory, search, conversations, semantic-search, episodic`, `agents: ["./agents/search-conversations.md"]`, `skills: "./skills/"`, `hooks: "./hooks/hooks.json"`, `mcpServers: "./.mcp.json"`, and an `interface` block with `displayName: "Episodic Memory"`, `category: "Developer Tools"`, `brandColor: "#4F46E5"`, and `websiteURL`/`privacyPolicyURL` both pointing at the GitHub repo. The Claude manifest's `mcpServers` invoked `${CLAUDE_PLUGIN_ROOT}/cli/mcp-server-wrapper.js`; the generated one must invoke `${CLAUDE_PLUGIN_ROOT}/dist/cli.js mcp-server`. |
| `.claude-plugin/marketplace.json`, `.agents/plugins/marketplace.json` | Both collapse into the single root `.claude-plugin/marketplace.json`, where `moe-memory` is already listed. Marketplace name was `episodic-memory-dev`; the plugin-id form Codex builds is now `moe-memory@moe`. |
| `docs/SCHEMA.md` (upstream copy) | Already stale — it documented `exchanges` without `harness`, `agent_version`, `model`, `model_provider` or `embedding_version`, i.e. it predated three migrations. Regenerated from `db.ts`. |
| `package-lock.json` (221 KB), `.gitignore`, `tsconfig.json`, `jest.config.cjs`, `.eslintrc.cjs`, `.prettierrc` | Nested lockfile and tool configs; the root ones govern. Read first: `private-journal-mcp`'s `"prepare": "npm run build"` had to go — in a pnpm workspace `prepare` runs during install, before project references are built. |
| `.github/workflows/` | Neither repo shipped one for `episodic-memory`; replaced by the root `.gitlab-ci.yml`. |

## Environment variables

Fourteen of the fifteen own variables are a straight `EPISODIC_MEMORY_*` →
`MOE_MEMORY_*` rename. The ones with changed meaning:

| Variable | Meaning |
|---|---|
| `MOE_MEMORY_CONFIG_DIR` | The data directory, directly. Also the test seam. |
| `MOE_DATA_DIR` | Shared cross-package Moe root; memory lives in `<it>/memory`. Was `PERSONAL_SUPERPOWERS_DIR`, which named the superpowers ecosystem rather than this package. |
| `MOE_MEMORY_JOURNAL_PATH` | Overrides **both** journal roots. `PRIVATE_JOURNAL_PATH` still honoured, with a warning. |
| `MOE_MEMORY_MODEL_CACHE_DIR` | Where the ONNX model is cached. New — upstream pinned nothing. |
| `MOE_MEMORY_MODEL_INIT_TIMEOUT_MS` | Model-load timeout, default 180 s. New on this side; ported from the journal encoder's 30 s, raised because a cold download is not a computation. |

Unchanged and **not** renamed, because they belong to other tools:
`CLAUDE_CONFIG_DIR`, `CODEX_HOME`, `XDG_CONFIG_HOME`, `CLAUDE_PLUGIN_ROOT`,
`PLUGIN_ROOT`, `CLAUDE_BIN`, `CLAUDE_CODE_MAX_OUTPUT_TOKENS`,
`ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`, `API_TIMEOUT_MS`.
`CONVERSATION_SEARCH_EXCLUDE_PROJECTS` also keeps its name — it describes what it
excludes.

## Verification

```
pnpm --filter @bubstack/moe-memory run build       # tsc -b, exit 0
pnpm --filter @bubstack/moe-memory run typecheck   # src + tests, exit 0
pnpm --filter @bubstack/moe-memory run test        # 258 passed (37 files)
pnpm --filter @bubstack/moe-memory run test:model  # 36 passed (9 files)
biome check packages/memory                        # exit 0; 72 warnings, 0 errors
```

The `model` project needs one ~35 MB download from huggingface.co into
`<MOE_MEMORY_CONFIG_DIR>/models`. It is not in `pnpm test` and not in CI.

The two harnesses under `test/manual/` are unverified: `claude-e2e.js` needs a
real `claude` binary with live auth, and `codex-e2e.js` needs `codex` ≥ 0.130.0,
`tmux`, and a copy of the user's `~/.codex/auth.json`. Both also need a
**generated** plugin directory, which is why they take
`MOE_MEMORY_E2E_PLUGIN_DIR` — upstream pointed `claude plugin validate` at the
repository root, and the package root is no longer a valid plugin. The two cheap
suites that grep them for the renamed tokens do run in `pnpm test`.

### Biome

`biome check` exits 0 with **72 warnings and no errors**. Upstream ran no
formatter at all on the `episodic-memory` side, so the whole package was
reformatted to the root options (double quotes, width 100) — a real
reformatting, not the like-for-like re-application `packages/crew` did. Node
builtins gained the `node:` protocol, dead `catch (error)` bindings became bare
`catch`, and 21 genuinely unused imports and locals were removed.

What is left, and why:

| Rule | Count | Why it stays |
|---|---|---|
| `suspicious/noExplicitAny` | 53 | Inherited untyped boundaries: `parser.ts` walking two undocumented JSONL dialects, `show.ts` rendering their content blocks, `summarizer.ts` over the Claude Agent SDK and Codex's app-server JSON-RPC. Typing them properly is a behaviour-risk refactor of the parsing code, not a rename. |
| `style/noNonNullAssertion` | 18 | All in `test/`, on lock handles and mock calls the test has just asserted exist. The offered autofix is *unsafe* and would weaken the assertions (`expect(h!.path)` → `expect(h?.path)` passes on null), so `packages/crew`'s root-override answer applies here too. |
| `suspicious/noTemplateCurlyInString` | 1 | `test/hooks.test.ts` asserts the literal `${PLUGIN_ROOT:-${CLAUDE_PLUGIN_ROOT}}` shell expansion in `hooks.json`. It is supposed to be a `${...}` inside a plain string. |

## Four defects found by the post-merge audit, all fixed

None of these were upstream bugs. Three are fork-introduced, and they cluster
around the same structural change — one database now holds both record types,
and both journals now share it across every project on the machine.

1. **The journal index leaked and deleted across projects.** `journal_entries`
   had no `root` column, so a `project`-scope id was
   `md5("project:<day>/<file>.md")` — two repos that journalled in the same
   second collided, `indexJournal()`'s prune deleted every row it had not just
   walked (i.e. every *other* project's entries, on every server start), and
   search returned other projects' private entries. One missing column, three
   defects, both directions of the privacy property. Fixed with the column, a
   `j.root IN (…)` retrieval filter, a prune restricted to walked roots, and a
   migration that clears the derived index rather than guessing a backfill.
   `test/journal-project-isolation.test.ts`.
2. **`moe-memory index --rebuild` emptied the journal index and never rebuilt
   it.** It deletes `getDbPath()`, which is *one* database holding both record
   types, then re-indexed conversations only — and returned 0. Recoverable
   (markdown is the source of truth) but never announced. It now re-indexes the
   journal too, and reports a failure there without failing the rebuild, because
   the conversation pass above it can cost hours and paid summarisation.
3. **`journal import-legacy` looked only where the sidecars are not.** It walked
   the current roots, but the command exists *because* the paths moved
   (`<project>/.private-journal` → `.moe-journal`, `~/.private-journal` →
   `<data dir>/journal`). Every upgraded install got
   "Legacy .embedding sidecars found: 0" — indistinguishable from success.
   `findLegacyJournalRoots()` now surveys the upstream directories and the CLI
   prints what it found and the copy command. It reports rather than migrates,
   matching `findLegacyDataDir`: journal entries are private reflections, so
   relocating them silently is a worse trade than relocating an archive.
4. **`journal search --limit 5 foo` searched for `"5 foo"`.** The query was
   `rest.filter((a) => !a.startsWith("--")).join(" ")`, which drops flag names
   but keeps their values — so `--scope`, `--limit` and `--journal-path` all
   leaked into the search string. A semantic search does not fail on a polluted
   query, it silently ranks worse, which is why nothing caught it. Replaced with
   a single-pass parser (`parseJournalArgs`) so positionals and flags cannot
   disagree. `test/journal-cli-args.test.ts`.

## Follow-ups

- **`moe-mint` must generate this plugin's manifest**, and the generated tree
  needs a built `dist/` plus resolvable dependencies (the bundle is gone). Until
  then `test/manual/*` cannot run and the plugin cannot be installed.
- **The `sections` filter fix changes behaviour for existing callers.** Anyone who
  worked around the bug by passing rendered heading text (`'Project Notes'`) still
  matches — normalisation is symmetric — but a caller who learned that
  `project_notes` returned nothing will now get results.
- **`formatResults` does a `statSync` plus a full readline line-count per result.**
  A 50-result search re-reads up to 50 transcripts from disk inside the formatter.
  Pre-existing; untouched because changing it changes the output the search agent
  parses.
- **`src/indexer.ts` mutates global state at import time** —
  `process.env.CLAUDE_CODE_MAX_OUTPUT_TOKENS = '20000'` and
  `EventEmitter.defaultMaxListeners = 20`. In a single-process MCP server those now
  apply to the journal half too. Harmless today; worth moving into the
  summarizer's own setup.
- **`journal_entries` has no summariser.** Conversations get AI summaries; journal
  entries are their own summary. If that changes, the sentinel protocol in
  `summary-sentinel.ts` is the pattern to reuse.
- **`protobufjs: false` in the root `pnpm-workspace.yaml` is now justified by a
  false premise.** Its comment says "reached only through crew's type-only
  `@earendil-works/pi-coding-agent`", but `pnpm why` shows it is also reached
  through `onnxruntime-web` ← `@huggingface/transformers` ← this package. The
  encoder works with the build skipped, so `false` still holds — but the reason
  needs rewriting. See root-changes.
