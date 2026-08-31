---
slug: gsd-core-skill-import
title: GSD-Core Census And Debugger Reference Import
idea: |
  - Examine GSD-core for skills to import
status: backlog
size: M
estimate: 3-5 h
depends_on: [DO-NOW-1, DO-NOW-2]
blocks: [tiered-workflow-naming]
conflicts_with: [parallel-execution-option, tiered-workflow-naming, deterministic-task-dag, native-renderers, moe-tone-and-branding]
touches:
  - PARITY.md
  - ARCHITECTURE.md
  - packages/core/skills/systematic-debugging/
  - packages/core/skill-tiers.yaml
  - packages/core/test/metadata.test.ts
decision_needed: yes
---

# GSD-Core Census And Debugger Reference Import

## The idea

> Examine GSD-core for skills to import

GSD-core is **`https://github.com/open-gsd/gsd-core`** — "Git. Ship. Done — Core",
**MIT**, 8,948 stars, branch `next` at `996196f` (2026-08-31), v1.7.0, active. It is
the successor to the archived `gsd-build/get-shit-done` (also MIT). It ships **71
skills** under `skills/gsd-*`, 111 prose references under `gsd-core/references/`, plus
`agents/`, `capabilities/`, `hooks/` and a `src/` of ~200 `.cts` modules. Research and
planning run in fresh-context subagents against a `.planning/` state directory.

**There are three links in the chain, not two.** `~/.claude/moe-core` is *not*
GSD-core: it is the installed artifact of an **older, now-deleted Moe repo** that was
itself derived from GSD. Importing means going to upstream, and the census below is
what says whether anything is worth going for.

## Why it matters

Three reasons, and only one of them is about skills.

**The census is the deliverable.** A 27-skill package with two competing planning
methodologies is worse than one. Twenty people leaving the lean plugin on
permanently pay a context line per description, forever. The census produces a
defensible "no" with a pinned revision behind it, so the question stops reopening.

**There is a deadline shape.** Zak said on 2026-08-31 that he intends to delete
`~/.claude/moe-core` and its 64 installed skills. That is unexecuted and nothing here
touches it. But the deleted source repo is already gone, which makes the install the
only surviving copy of that project — so any census that wants to read the *fork's*
divergences has to happen before the deletion. This doc removes most of that urgency
by establishing that everything worth importing exists upstream instead (below), but
not all of it.

**One name collision is live today.** `~/.claude/moe-core/bin/lib/package-identity.cjs:6-11`
declares that deleted project as `packageName = "@bubstack/moe"`, `binName = "moe"`,
`repoUrl = "https://gitlab.com/moe-ai/moe-cc"` — the same npm scope this fork
publishes into, and it occupies the `~/.claude/moe-core/` path that a package named
`@bubstack/moe-core` would want. The repo is gone and the install is slated for
deletion, so this may resolve itself; it is a flag for `moe-tone-and-branding`, not a
task here.

## Current state

**The provenance chain, with evidence for each link.**

1. **Upstream GSD.** `gsd-build/get-shit-done`, MIT, archived, pointing readers at
   `open-gsd/gsd-core` (MIT, active). Both verified via the public GitHub API.
2. **A deleted Moe repo derived from it.** `~/.claude/.moe-source` points at
   `/Users/ZKeown/Code/tools/moe-cc/commands/moe` — **that directory no longer
   exists**. `~/.claude/moe-core/bin/lib/installer-migrations/004-prune-stale-pristine-snapshots.cjs:3-4`
   records "the get-shit-done → moe-core rename (#604, #934)", and the compiled
   libraries still carry the original identifiers (`formatGsdSlash`,
   `ensureGsdTempDir`, `_removeGsdEntries` — `bin/lib/shell-command-projection.cjs:49-50`,
   `bin/lib/install-engine.cjs:561-569`).
3. **The installed artifact.** `~/.claude/moe-core`, VERSION `0.0.1`, hand-installed
   rather than a plugin. It supplies this session's **64 skills** at
   `~/.claude/skills/moe-*` and **39 agents** at `~/.claude/agents/moe-*`.

**Link 2 diverged from upstream — that is what proves it is a distinct project, not a
copy.** Diffing the 71 upstream skill names against the 64 installed ones: 60 shared,
**11 upstream-only** (`code-review`, `discuss-phase`, `graphify`, `ingest-docs`,
`map-codebase`, `onboard`, `secure-phase`, `spec-phase`, `update`, `validate-phase`,
`verify-work`), **4 local-only** (`says-what`, `says-how`, `takeover`,
`verify-phase`). The swap is deliberate: `~/.claude/moe-install-state.json` records an
applied migration `2026-08-24-retire-spec-discuss-convergence-surfaces` — the fork
retired GSD's `discuss-phase`/`spec-phase` pair and replaced it with its own
`says-what`/`says-how`.

**The install is a snapshot with no history** — the same situation `PARITY.md:8-12`
describes for the 19 shallow clones, except worse: there is no revision to pin it to
and no repository to fetch one from.

**Three other things on this machine are named Moe and none is a skill source.**
`~/Code/tools/moe` is `askmoe` — a ground-up TypeScript rearchitecture of the
Charm/Crush Go ecosystem (bubbletea, lipgloss, glamour), 17 packages, `@askmoe/*`,
zero-runtime-dependency rule (`README.md:1-10`). `~/Code/tools/moedex` is a Go
code-search engine whose installed binary is a 118 MB `~/.local/bin/moe`. Both ruled
out.

**Size asymmetry, and it is the whole argument.** The install is **10 MB**: 6.7 MB
`bin/` (**206** CommonJS modules), 2.1 MB `workflows/` (79 specs — `plan-phase.md`
alone is 1,617 lines), 876 KB `references/` (105 files), 348 KB `templates/` (35).
Each skill is a ~1 KB stub: `~/.claude/skills/moe-fast/SKILL.md` is frontmatter plus
an `<execution_context>` that loads `~/.claude/moe-core/workflows/fast.md`. **A GSD
skill has no content of its own.** Against that, `packages/core/skills/` in the
`import/packages-core` worktree (`.claude/worktrees/wf_238bb49d-362-13`) is **892 KB,
27 self-contained prose skills, no runtime, no state directory, no agents.**

**The hard constraint: there is no slot for a skill that did not come from an
upstream.** In `packages/core/test/metadata.test.ts`:

- `:115` — `expect(skills.length).toBe(27)`
- `:156-192` — `expect([...skillNames].sort()).toEqual(expected)` against a hardcoded
  enumeration of the six upstream sources' skill names
- `:242` — every `**REQUIRED SUB-SKILL:**` marker must resolve against core's own 27
  names, so a REQUIRED edge pointing out to another package fails
- `:470` — `expect(core.length).toBe(13)`, the lean tier count

An imported GSD skill is exactly a skill that did not come from one of those six
sources. Adding one means editing assertions that exist *to pin the import's
fidelity* — a decision about when the fork stops being a fork, not a test tweak.
`parallel-execution-option` hits the identical wall and flagged the same fork in the
road. **Every IMPORT verdict below carries this cost**; it is stated once here rather
than repeated per row, and it is the reason the recommendation adds no skill.

## Prerequisites

- **DO-NOW-1** — the 27 skills are on a branch. Editing `systematic-debugging` and
  `skill-tiers.yaml` before the merge means resolving conflicts twice.
- **DO-NOW-2** — anything new needs a `tier:` and a `why:`; `metadata.test.ts:453-462`
  asserts `skill-tiers.yaml` keys equal the skill set exactly.

No backlog slug is a prerequisite. This one **blocks `tiered-workflow-naming`**: that
slug owns GSD's fast/quick/default tiering, and until this census says whether
`workflows/fast.md` (118 lines) and `workflows/quick.md` (780 lines) arrive as content
or only as a naming pattern, it is designing against an unknown.

## The import census

All 71 upstream skills, grouped. Each group shares one verdict and one reason;
ungrouping would not change any verdict.

| GSD-core family (count) | What it does | Verdict |
|---|---|---|
| Lifecycle (12) — `new-project` `onboard` `new-milestone` `complete-milestone` `audit-milestone` `milestone-summary` `cleanup` `stats` `health` `resume-work` `pause-work` `thread` | CRUD over `.planning/` state: PROJECT.md, ROADMAP.md, STATE.md, milestone archives | **SKIP** — all of it is the 206-module runtime. Design owned by `deterministic-task-dag` |
| Phase workflow (11) — `discuss-phase` `spec-phase` `plan-phase` `execute-phase` `verify-work` `validate-phase` `phase` `progress` `next` `autonomous` `manager` | The core loop: converge spec → plan → execute in waves → verify | **ALREADY-COVERED-BY** `writing-plans`, `executing-plans`, `implementing-tasks`, `subagent-driven-development`, `verification-before-completion` — as prose, statelessly. Importing means running two methodologies |
| Tiering (2) — `fast` `quick` | Tier 1 inline-and-commit; tier 2 plan-without-verify | **SKIP here** — pattern only. Owned by `tiered-workflow-naming` |
| Review (5) — `review` `code-review` `plan-review-convergence` `secure-phase` `audit-fix` | Cross-AI peer review, convergence loops, ASVS security phase | **ALREADY-COVERED-BY** `requesting-code-review` + `receiving-code-review`. Exception: upstream `references/security-asvs-levels.md` has no counterpart here — secondary **IMPORT candidate** |
| Debugging (2) — `debug` `forensics` | Multi-cycle debug sessions with persistent state; failed-run post-mortem | **IMPORT (references only)** — see below. The session-state machinery: SKIP |
| Testing (2) — `add-tests` `audit-uat` | Generate tests from UAT criteria; cross-phase UAT audit | **ALREADY-COVERED-BY** `test-driven-development` (320 lines) — upstream `references/tdd.md` (330 lines) is a peer, not an addition |
| UI (3) — `ui-phase` `ui-review` `sketch` | UI-SPEC contracts, 6-pillar visual audit, throwaway HTML mockups | **SKIP** — no frontend audience in a 20-person internal tool; `glass` owns browser work |
| AI/eval (2) — `ai-integration-phase` `eval-review` | AI-SPEC design contract; eval-coverage audit | **SKIP** — `@bubstack/moe-flight` owns evaluation |
| Docs/context (5) — `docs-update` `map-codebase` `ingest-docs` `import` `graphify` | Verified doc generation, codebase mapping, doc ingestion, graph context | **SKIP** — `graphify`/`map-codebase` overlap `codegraph-context-layer`; the rest have no audience |
| Memory (2) — `mempalace-capture` `mempalace-recall` | File and recall phase artifacts in MemPalace | **SKIP** — external dependency on `mempalaceofficial.com`'s CLI (`bin/lib/capability-registry.cjs`); `@bubstack/moe-memory` owns memory |
| Namespace routers (6) — `ns-context` `ns-ideate` `ns-manage` `ns-project` `ns-review` `ns-workflow` | Six stubs existing only to compress 60+ descriptions into 6 context lines | **SKIP as content** — the same problem `skill-tiers.yaml` solves by curation instead. Worth naming in the lean/full rationale |
| Install/config (6) — `config` `settings` `surface` `update` `help` `workspace` | Interactive config, skill surfacing, self-update, isolated workspaces | **SKIP** — `installer-hq-dx` owns installer DX. `surface` (toggle clusters without reinstall) is the one idea worth stealing there |
| Ideation (5) — `capture` `explore` `spike` `review-backlog` `profile-user` | Socratic ideation, spikes, backlog promotion, developer profiling | **ALREADY-COVERED-BY** `brainstorming` (250 lines) and `scoping-the-simplest-core` |
| Git/ship (4) — `pr-branch` `ship` `undo` `inbox` | PR branch filtering, ship gate, git revert by manifest, issue triage | **ALREADY-COVERED-BY** `finishing-a-development-branch` (225 lines). `tc-standards-conformance` owns MR + `sc-{card}/{slug}` conventions |
| Remaining (4) — `workstreams` `extract-learnings` `mvp-phase` `ultraplan-phase` | Parallel workstreams; learning extraction; SPIDR MVP slicing; cloud planning | **SKIP** — `workstreams` overlaps `parallel-execution-option`; `mvp-phase` overlaps `scoping-the-simplest-core`; `ultraplan-phase` is beta cloud tooling |

**70 of 71: skip or already covered.** The reason is structural, not taste — a GSD
skill is a 1 KB stub over a 10 MB runtime this workspace has no place for.

### The one real find

**GSD's debugger reference set: 9 prose files, 1,117 lines**, at
`open-gsd/gsd-core/gsd-core/references/debugger-*.md`. `debugger-sbfl.md` (110)
specifies spectrum-based fault localization with the Ochiai formula and explicit
skip-preconditions; `debugger-bug-taxonomy.md` (111) classifies Bohrbug /
Heisenbug-Mandelbug / concurrency and **routes** technique selection off the class.
The rest: `debugger-techniques.md` (255), `fix-acceptance` (157), `repro-hardening`
(130), `rca-branching` (98), `prevention` (98), `semantic-recall` (81), `philosophy` (77).

A grep for `spectrum|sbfl|fault localiz|bug taxonom|delta debug` across all 27 skills
returns **zero hits**. `systematic-debugging` (283 lines, 11 files) has no
fault-localization step and no bug classification. Additive, prose-only,
methodology-compatible — the opposite of the other 70.

## The license and provenance question

**Resolved for everything recommended, and the diff is the proof.** All nine debugger
references exist upstream in MIT `open-gsd/gsd-core`, and the local copies are pure
token rebrands of them: across 1,117 lines, **17 lines differ in total**, every one a
`gsd-` → `moe-` rename (`debugger-sbfl.md` differs by exactly one line, line 3,
`gsd-debugger` → `moe-debugger`). So the content is upstream MIT, verifiable against
a pinned revision, and needs no second `superpowers-evals`-shaped decision. MIT sits
inside `PARITY.md:50-53`'s existing envelope. **Import from upstream, never from the
install** — the install has no revision to pin and no repo to pin it against.

**The unlicensed material is real but narrow, and the recommendation avoids it.**
Diffing the reference directories: 111 upstream, 105 local, and only **three local
files have no upstream counterpart** — `panel-protocol.md` (181 lines),
`convergence-loop.md` (69), `codex-post-dispatch.md` (29). (A fourth,
`moe-run-resolver.md`, is upstream's `gsd-run-resolver.md` renamed — 3 differing
lines.) Those three plus the four local-only skills (`says-what`, `says-how`,
`takeover`, `verify-phase`) are the deleted repo's own authored evidence-panel
convergence protocol. **No license has been located for any of it**, and none is
locatable: no LICENSE file in the tree, `gitlab.com/moe-ai/moe-cc` returns HTTP 403,
source repo gone. This census recommends importing none of it, which is what keeps
`PARITY.md`'s single knowingly-accepted exception at one.

## Proposed approach

**Option A — census only, import nothing.** Add `open-gsd/gsd-core` to `PARITY.md`'s
**Excluded** table (`PARITY.md:46-50`) at `996196f` with this census as the reason.
~1 h, zero risk, and the debugger content stays lost.

**Option B — census plus the debugger references, no new skills.** Same ledger work,
then fold the 9 upstream references (and optionally `security-asvs-levels.md`) into
`packages/core/skills/systematic-debugging/` as sibling files, rewritten to drop the
`@-include` / `gsd-debugger` agent framing that has no counterpart here. **No new
skill directory**, so `:115` (27), the enumeration at `:156-192`, `:242` and `:470`
all stay untouched — the only test that gains work is the relative-link check at
`:251`. This is the whole reason to prefer it: it captures the content without
touching the fidelity assertions or forcing the non-upstream-skill decision.

**Option C — import the phase runtime.** XL. 10 MB, 206 CJS modules into a
TypeScript-only pnpm workspace, 39 agents, a second planning methodology competing
with `writing-plans`/`executing-plans`, and a `.planning/` state machine
`deterministic-task-dag` is separately chartered to design. Reject.

**Recommendation: Option B.** It is the only option that captures the one thing GSD
has that this fork does not, without paying for the 70 things it duplicates or
spending the exact-27 assertion. Fall back to A if the SBFL preconditions (a live
suite with per-test coverage) do not hold for the repos these 20 people actually work
in — check that first; it is a 15-minute question and it decides the whole item.

## Scope boundary

**In:** the provenance chain and the 71-skill census with verdicts; a `PARITY.md` row
for `open-gsd/gsd-core` @ `996196f`, MIT, with a landing place; a shallow clone into
`../.moe-references/gsd-core`; the 9 upstream debugger references rewritten into
`systematic-debugging/`; an `ARCHITECTURE.md` §2 note recording GSD as an
evaluated-and-declined upstream.

**Out:** the fast/quick/default tiering design — `tiered-workflow-naming`. The
`.planning/` state machine and phase DAG — `deterministic-task-dag`. Wave-based
parallel execution and `workstreams` — `parallel-execution-option`. Installer,
`config`/`settings`/`surface`/`update` — `installer-hq-dx`. Graph and codebase-map
context — `codegraph-context-layer`. MR and branch conventions —
`tc-standards-conformance`. The `@bubstack` scope collision — `moe-tone-and-branding`.
**Also out: deleting or modifying anything under `~/.claude/`.** Nothing in this item
touches the install; it only reads it.

## Open questions for Zak

1. **Does the fork admit non-upstream skills, and what replaces the exact-27
   assertion when it does?** `metadata.test.ts:115` and the enumeration at `:156-192`
   exist to pin import fidelity, so the first authored skill has to replace them with
   something that still catches a silent drop. **Shared with at least two other
   backlog items** — `parallel-execution-option` hit this same wall, and
   `native-renderers` will. Worth deciding once, for all of them, rather than three
   times. Option B is designed so this item does not force the decision.

2. **When does `~/.claude/moe-core` get deleted?** Not a request to delete it —
   only a sequencing question. Everything Option B imports comes from upstream, so
   the deletion does not block it. But the three unlicensed local-only references and
   four local-only skills (the evidence-panel convergence protocol) exist in exactly
   one place on earth. If any of that is wanted, it has to be copied out first; if
   none of it is, this question is closed.

3. **Option B or Option A** — is 1,117 lines of debugging methodology worth a new
   upstream row in `PARITY.md`, or is a clean "evaluated, declined" the better ledger
   entry for a fork that is trying to shrink?

## Effort

| Step | Time |
|---|---|
| Shallow-clone `open-gsd/gsd-core` @ `996196f` into `../.moe-references/`, verify LICENSE on disk | 15 min |
| Check the SBFL preconditions against two real TC repos (decides B vs A) | 15 min |
| `PARITY.md` row + census summary; `ARCHITECTURE.md` §2 note | 45 min |
| Read the 9 references against `systematic-debugging`'s 11 files; drop true overlap | 1 h |
| Rewrite the survivors as skill siblings — strip `@-include` and `gsd-debugger` framing, rewrite cross-links | 1-1.5 h |
| `pnpm --filter @bubstack/moe-core test`, biome, `tsc -b` | 20 min |

**3-5 h.** Slower if the rewrite finds `debugger-sbfl.md` and
`debugger-rca-branching.md` assume a persistent DEBUG.md session document — then each
either loses its state assumptions or drops out, and that is judgement per file, not
mechanical editing. Option A alone is ~1 h.

## Verification

- `../.moe-references/gsd-core` exists as a one-commit shallow clone;
  `git -C ../.moe-references/gsd-core rev-parse --short HEAD` equals the `PARITY.md`
  row; a `LICENSE` naming MIT is present in it.
- `PARITY.md` names `open-gsd/gsd-core` with pinned revision, `MIT`, and a landing
  place — or lists it under **Excluded** with the census as the reason.
- `pnpm --filter @bubstack/moe-core test` green **with `metadata.test.ts:115` still
  asserting 27, the enumeration at `:156-192` unchanged, and `:470` still 13.** This
  is the assertion that proves no skill was added and the fidelity pins survived.
- The relative-link test (`:251`) passes with the new siblings linked from
  `systematic-debugging/SKILL.md`.
- `grep -rniE "spectrum|sbfl|fault localiz|bug taxonom" packages/core/skills/` returns
  hits where it returned none.
- `grep -rn "gsd" packages/core/skills/` returns nothing — the rebrand is complete.
- Nothing under `~/.claude/` is modified: `git status` in this repo is the only diff.
