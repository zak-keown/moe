# Moe Backlog — Durable In-Repo Deferral

Give deferred work a durable, tracked home in `.moe/backlog/` and a small state
machine so a deferral is a real, resumable record instead of a note that dies
with the worktree. Adds a `moe jig backlog` command tree; `defer` is one verb in
it, not the feature.

**Status:** Design. No implementation yet. Builds on the shipped `moe jig` CLI
(`packages/jig`), adding one module and one subcommand tree. First producer is
`fixing-a-code-review`; other producers and a driver skill are out of scope for
v1 (see §11).

## Problem

Two problems wear one word — "deferred."

**Deferrals evaporate.** When the review-fix flow marks a finding `deferred` or
`skipped`, the record lands in `CODEBASE-REVIEW.md`. That file is tracked, but it
is a *review-scoped artifact*: its lifecycle is one review cycle, and the work
usually happens in a throwaway worktree. The fixes merge home; the report — and
every deferral in it — does not. There is no durable, tracked home in `.moe/`
for "work we consciously chose not to do." The only `.moe/` subdirectories that
exist are transient workspaces (`worktrees/`, `concept-review/`,
`review-shards/`), most of them gitignored. A deferred item's only home is a
document whose reason to exist ends when the findings are worked.

**"Deferred" is overloaded.** One label covers two unrelated outcomes:

- **Blocked** — the work cannot proceed without an *external* change: a missing
  runtime, an upstream decision, a human action. A real deferral. Someone must
  unblock it.
- **Carry-over** — the work is doable; the run ran out of budget or context. Not
  a deferral. It should be re-queued and resumed.

"I was low on context" is an agent filing a carry-over as a deferral because
carry-over has no honest bin. The failure is not that the agent lies; it is that
the vocabulary forces the misfile. The fix is to give carry-over its own cheap,
legitimate state that feeds resumption — then it stops polluting `deferred`.

## Decision

A durable backlog store at `.moe/backlog/`, one markdown file per item, tracked
in git, and a `moe jig backlog` command tree that moves items through a small
state machine. `defer` is a routing verb: it reads the reason and routes to
`blocked`, `carry-over`, or — for any unrecognized reason — `needs-triage`, a
loud state a human must resolve. Nothing blocks a run; the durable un-adjudicated
state *is* the escalation. The review-fix flow's `deferred`/`skipped` findings
are promoted into backlog items, which is what stops the loss.

### Why per-file, not one backlog file

Parallel workers each file their own item. A single shared `backlog.md` walks
straight back into the worktree merge conflicts this repo has already bled on.
One file per item means each worker's write touches a distinct path and merges
clean. It also mirrors how specs, ADRs, and plans already live as per-file docs.

### Why the store resolves to the current worktree

The path resolves against the current working tree's top-level
(`git rev-parse --show-toplevel`), **not** the primary checkout. A subagent that
defers inside `.moe/worktrees/<branch>` writes the item into *its own branch*; the
coordinator's merge carries it home. Resolving to the primary root instead would
write across git's branch isolation and lose the merge story. This is the
mechanism that fixes the evaporation.

### Why in jig

Jig is already the deterministic place for "do this repo operation correctly
regardless of harness." The backlog is exactly that: id allocation, frontmatter
shape, and legal state transitions are all things a model drifts on if left to
prose. Skills call `moe jig backlog …`; they degrade to a documented manual file
write where jig is not on PATH, the same pattern every other jig-backed skill
already uses.

## Architecture

### Store shape

```text
.moe/backlog/
├── 0001-tab-ffi-abi-drift.md
├── 0002-glass-cdp-timeout.md
└── ...
```

`<NNNN>-<slug>.md` — zero-padded incrementing number; the item's `id` is
`BL-<NNNN>` and the slug is derived from the title. Tracked in git;
`.moe/backlog/` sits outside every current `.gitignore` entry and must stay
that way (a blanket `.moe/` ignore would silently re-break this — the store is
explicitly *not* ignored, guarded by a test in §10).

### Item schema

Flat YAML frontmatter plus a markdown body. Written and parsed by a small helper
in `backlog.ts` — no new dependency, consistent with how jig already hand-writes
frontmatter.

```markdown
---
id: BL-0007
title: tab FFI ABI rename not mirrored in Rust header
status: carry-over            # see §Statuses
reason: budget                # required unless status ∈ {open, in-progress, done};
                              # for needs-triage, holds the raw unrecognized reason
severity: high                # low | medium | high | critical
source: code-review:CR-012    # code-review:<id> | brainstorm | hardener | manual
claimed_by:                   # agent/run id while in-progress, else empty
created: 2026-09-04
updated: 2026-09-04
filed_by: wave3-item/tab      # agent or run that filed it
filed_sha: a1b2c3d
moved_by: coordinator
moved_sha: e4f5g6h
ref: CR-012                   # originating finding / spec / plan
blocked_by: BL-0003           # comma-separated ids
blocks: BL-0009
parent: BL-0001               # decomposition
tags: tab, ffi                # comma-separated
---

## Context

Why this exists and what "done" looks like.

## Resume                      # required for carry-over; recommended for blocked

- done: header regenerated, cbindgen run
- next: update the three language bindings to the new symbol name
- branch: fix/tab-abi @ e4f5g6h
- touched: packages/tab/include/moe_tab.h
```

`provenance` is what lets a later reader tell a real environment block from a
story: the sha and agent that filed the deferral are on the record.

### Statuses and transitions

```text
add ─────────────► open
open ────────────► in-progress          (claim / start)
in-progress ─────► done                  (terminal)
open|in-progress ► blocked               (defer, block reason)
open|in-progress ► carry-over            (defer, carry reason)
open|in-progress ► declined              (terminal; not a deferral, a rejection)
open|in-progress ► needs-triage          (defer, unrecognized reason)

blocked ─────────► open                  (resume: unblocked, back in the pool)
carry-over ──────► in-progress           (resume: same thread continues)
needs-triage ────► open | declined       (triage: a human sets a real state)
```

The resume asymmetry is deliberate. A cleared **block** returns to `open` —
someone still has to decide it is actionable now and claim it. A resumed
**carry-over** returns straight to `in-progress` — the thread the `Resume` block
records is picked up where it stopped.

`done` and `declined` are terminal. Every other state is reachable back to work.

### Reason enums

`reason` is a closed set per deferral class. Membership is what `defer` routes on.

| Class | Reasons | Routes to |
|---|---|---|
| block | `no-runtime` · `upstream-decision` · `depends-on` · `needs-human` · `external-service` | `blocked` |
| carry | `budget` · `scope-split` | `carry-over` |
| decline | `wont-fix` · `out-of-scope` · `duplicate` · `not-reproducible` | `declined` |
| — | anything else | `needs-triage` |

A carry-over **requires a non-empty `next` step** in the `Resume` block. A
carry-over that cannot say where it stopped is not resumable; `defer` refuses it
and routes it to `needs-triage` instead. That is the enforcement that keeps
carry-over honest — the state is only as legitimate as the thread it hands off.

### Where the code lands

- New `packages/jig/src/backlog.ts` — command handlers, the frontmatter helper,
  id allocation, and transition validation.
- `cli.ts` gains one subcommand tree, wired the same way as `worktree`:
  ```js
  const backlog = program.command("backlog")
    .description("Durable deferral and work tracking in .moe/backlog/");
  ```
- Reuses `util.ts`: `today()`, `git()`/`gitIn()`. Adds one helper,
  `worktreeRoot(cwd)` = `git rev-parse --show-toplevel`, to resolve the store
  against the working tree (§Why the store resolves to the current worktree).
- Node stdlib + `commander`, matching the rest of jig. No new package
  dependency. Jig stays L0 with no cross-package imports.

## Command surface

`moe jig backlog <verb>`.

**`add <title> [--source <s>] [--severity <s>] [--tag <t>...]`**
Creates an `open` item, allocates the next id, prints the path. Refuses a
duplicate title-slug that is still open.

**`defer <id> --reason <r> [--note <n>] [--next <step>] [--branch <ref>]`**
The routing verb, and the literal answer to "add defer to jig." Reads `--reason`,
routes per §Reason enums, records provenance (agent, sha), stamps `updated`.
A carry reason with an empty `--next` routes to `needs-triage`, not `carry-over`.
Unrecognized reason → `needs-triage`, a loud warning on stderr, **exit 0** — it
never blocks a wave.

**`resume <id>`**
`blocked` → `open`; `carry-over` → `in-progress`. Refuses any other current
state. Prints the item's `Resume` block if present, so the caller (or
`moe-resume`) has the thread.

**`done <id> [--commit <sha>]`** — → `done`. Records the commit if given.

**`decline <id> --reason <r> [--note <n>]`** — → `declined`. Requires a decline
reason.

**`list [--status <s>] [--source <s>] [--severity <s>] [--tag <t>]`**
Prints matching items, one line each, filters AND-ed. Default (no filter) hides
`done`/`declined` — readers care about what is still open.

**`show <id>`** — Prints the full item.

**`triage`** — Lists every `needs-triage` item for a human. The one command whose
audience is a person, not an agent.

## Code-review integration

`fixing-a-code-review` stops burying `deferred`/`skipped` findings in a
review-scoped report and promotes them:

- A finding it will not fix is promoted with
  `moe jig backlog add … --source code-review:CR-### --severity <copied>` and
  then routed with `moe jig backlog defer <id> --reason …`.
- The report keeps a one-line pointer to the `BL-####`; the durable truth is the
  backlog item.
- `fixed`/`stale` findings are unchanged — they resolve within the review cycle
  and need no durable record.

This is the concrete fix for the evaporation in §Problem and the only producer
wired in v1.

## Skill updates

Each skill that defers work gains a one-line instruction: "Call
`moe jig backlog defer …`," with the existing prose fallback for harnesses where
jig is not installed — the skill degrades to a documented manual frontmatter
write, not silence. `fixing-a-code-review` is updated in v1; the disposition
contract in its `SKILL.md` gains the promotion step and `stamp-disposition.mjs`
keeps stamping the report pointer.

## Multi-harness and headless behavior

- **Every harness** gets the CLI. The store, the schema, and the transitions are
  identical regardless of who calls `moe jig backlog`.
- **Headless is the default case, not an edge.** There is no synchronous human
  gate anywhere in the flow. An unrecognized-reason deferral resolves to a
  durable `needs-triage` record and exits 0. A wave never hangs waiting on a
  human; the human finds the record via `triage` on their own time.
- **No new escalation primitive.** "Escalate to a human" is implemented entirely
  as durable state plus a `triage` listing — nothing to build, nothing to block
  on.

## Testing

New `packages/jig/test/backlog.test.ts`:

- **Transitions:** every legal move succeeds; every illegal move is refused with
  a diagnostic. `done`/`declined` are terminal.
- **Reason routing:** block reasons → `blocked`; carry reasons → `carry-over`;
  unknown → `needs-triage`; carry with empty `--next` → `needs-triage`.
- **Id allocation:** `NNNN` increments; a gap from a deleted file does not
  collide.
- **Store resolution:** the file is written under the *current worktree's*
  top-level. Integration test in a temp repo: `defer` inside a linked worktree,
  merge the branch, assert the item is present at the primary checkout — the
  evaporation regression test.
- **Filters:** `list` AND-s its filters; default hides terminal items.

Guarded surfaces: `packages/core/test/metadata.test.ts` is unaffected — the
backlog is a jig command, not a skill. A new assertion (in jig's suite or the
gitignore guard) confirms `.moe/backlog/` is not ignored, so a future blanket
`.moe/` rule cannot silently re-break persistence.

## What this does not do (v1.5+)

- **Machine-falsifiable blocker checks.** Verifying a `no-runtime` claim by
  running `which python` is a strong follow-up, but v1 records the claim with
  provenance rather than proving it.
- **A driver skill.** `moe-resume` consuming `carry-over` items, or a "work the
  next actionable item" mode, is separate backlog work. v1 exposes `list`/`show`/
  `resume` and the `Resume` block; the consumer comes later.
- **Multi-producer ingestion.** `reviewing-a-codebase`, the hardener skill, and
  brainstorming's out-of-scope items are natural producers. v1 wires one
  (code-review) to prove the shape before generalizing.
- **A TUI or web view.** `list`/`show`/`triage` are CLI-only.
- **Cross-repo backlogs.** The store is scoped to the repo it runs in.

## v1.5 addendum (2026-09-04): id uniqueness, triage-accept, decline note

Three follow-ups surfaced after v1 shipped. Two correct gaps between this spec
and the code; one is the id-uniqueness prerequisite flagged for `moe-resume`.
They land together because they share `backlog.ts` and one test file.

### 1. Ids must be unique across worktrees (the prerequisite)

**Problem.** `allocateId` computes `max(existing NNNN) + 1` from the *local*
worktree's `.moe/backlog/` listing. The store deliberately resolves to the
current worktree (§Why the store resolves to the current worktree), so two
worktrees branched from the same base each see the same `max` and each allocate
the same next number. On merge, two unrelated items claim one id. A consumer
that fetches by id — the whole point of `moe-resume` — then resolves the wrong
record. Monotonic-from-local-max is unfixable without cross-worktree
coordination the store is designed not to need.

**Fix.** Ids become random, not sequential. `allocateId` generates
`BL-` + 5 random bytes as hex (`^BL-[0-9a-f]{10}$`), regenerating on the
astronomically-rare collision with an id already present locally — the
`existing` list it already holds. Cross-worktree uniqueness is then
probabilistic at 2^40, not coordinated: safe for a backlog of realistically
hundreds to thousands of items, with no merge-time machinery and no collision
window. Sequentiality was incidental to v1, never a requirement; `BL-7f3a2b1c9d`
is exactly as greppable and quotable in a disposition `Note` as `BL-0007`.

**Ripple.** The id no longer carries an ordinal, so:

- `allocateId(existing)` returns `{ id }` (the `num` field is gone). The
  filename becomes `<id>-<slug>.md` (e.g. `BL-7f3a2b1c9d-fix-thing.md`),
  self-identifying and still slug-readable. `loadItem`/`parseItem` already key
  off the frontmatter `id`, never the filename, so lookups are unaffected.
- `loadAll` sorts by filename today, which gave chronological-ish order only
  because `NNNN` incremented. Random ids break that, so `loadAll` sorts by the
  `created` field (id as the stable tiebreak). List/triage order is thereby
  decoupled from the id scheme entirely.

**Migration.** None. No `BL-####` item is committed anywhere in the repo, so
there are no files to rename and no ids to reissue. This is why the change is
free *now* and would not be once real deferrals land on `main`.

**Breaking test.** `backlog.test.ts` "allocates the next zero-padded id,
ignoring gaps" asserts the old sequential behaviour and must be rewritten to the
new contract: two `add`s yield distinct, well-formed ids; the filename is
`<id>-<slug>.md`; list order follows `created`, not the id.

### 2. `needs-triage → open` needs a verb (`accept`)

§Statuses and transitions draws `needs-triage ─► open | declined (triage: a
human sets a real state)`. The `→ declined` half exists (`decline` operates on a
triaged item). The `→ open` half was never given a verb: `resume` refuses
`needs-triage`, `claim` refuses it, and `triage` only *lists*. A legitimately
open item filed under a mistyped reason is stranded — visible and declinable,
but not acceptable. The command surface simply never gave `triage` a way to
*set* a state; this closes that gap.

**`accept <id>`** — a new top-level verb, sibling to `decline`. The two triage
outcomes are now symmetric: `accept` → `open`, `decline` → `declined`. It
requires current status `needs-triage` and refuses any other state with a
diagnostic, the way `resume` guards its inputs. Backend `backlogAccept(id, {
cwd?, by? })` stamps `updated`/provenance and persists. `triage` stays a pure
listing; `accept` is distinct from `claim` (a human accepting a triaged item
into the pool, versus a worker taking an open item to `in-progress`).

### 3. Decline notes belong under `## Disposition`, not `## Resume`

`backlogDecline` currently routes its `--note` through `writeResume`, stamping a
`## Resume` block with `next: —` onto a record that is never resumed. Decline
gets its own section: `## Disposition`, holding `- declined: <reason>` and, when
given, `- note: <note>`. `## Resume` is reserved for `blocked`/`carry-over`,
whose semantics it actually matches. Cosmetic, but it stops a terminal record
from advertising a resumption thread.

### Testing additions

- **Ids:** two `add`s produce distinct ids matching `^BL-[0-9a-f]{10}$`; the
  filename is `<id>-<slug>.md`. The regression that motivated the change: two
  items filed in two linked worktrees off one base get *distinct* ids and both
  survive the merge (strengthens the existing "survives worktree teardown"
  test). List/triage order tracks `created`, proven independent of id.
- **`accept`:** `needs-triage → open`; refuses a non-triage state; provenance
  stamped. CLI e2e: `add` → `defer` with an unrecognized reason (→ `needs-triage`)
  → `accept` → status `open`.
- **Decline note:** a declined item's body contains `## Disposition`, never
  `## Resume`.

### Still out of scope

The v1.5+ list above is unchanged: no machine-falsifiable blocker checks, no
driver skill (`moe-resume` is the consumer these ids unblock, still separate
work), no multi-producer ingestion beyond code-review, no TUI, no cross-repo
store.
