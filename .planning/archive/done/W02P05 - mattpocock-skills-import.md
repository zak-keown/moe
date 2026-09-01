---
slug: mattpocock-skills-import
title: mattpocock/skills Census And Deep-Module Vocabulary Import
idea: |
  - Examine mattpocock/skills for skills to import
status: done
size: M
estimate: 4-6 h
depends_on: []
blocks: []
conflicts_with: [gsd-core-skill-import, parallel-execution-option, native-renderers, tiered-workflow-naming]
touches:
  - PARITY.md
  - ARCHITECTURE.md
  - packages/core/skills/
  - packages/core/skills/requesting-code-review/
  - packages/core/skills/writing-skills/
  - packages/core/skill-tiers.yaml
  - packages/core/test/metadata.test.ts
decision_needed: yes
---

# mattpocock/skills Census And Deep-Module Vocabulary Import

## The idea

> Examine mattpocock/skills for skills to import

`mattpocock/skills` is **`https://github.com/mattpocock/skills`** — "Skills for
Real Engineers. Straight from my .agents directory." **MIT**, single-author (Matt
Pocock), 1.5 MB, active — branch `main` at `6654f6b` (2026-08-24), Claude Code
plugin (`.claude-plugin/plugin.json`), homepage `aihero.dev/skills`. It ships
**37 `SKILL.md` files** grouped into five buckets — `engineering/` (17),
`productivity/` (7), `in-progress/` (8), `misc/` (4), `deprecated/` (0) — of
which only `engineering/` and `productivity/` are **promoted** (surfaced in
plugin.json and README). No runtime, no state directory, no agents, no
`.planning/` machinery. The only shell surface is `scripts/link-skills.sh` and a
per-skill `wizard/template.sh`.

**This is the census-changing fact, and it is the opposite of GSD-core.**
GSD-core was 1 KB stubs over a 10 MB runtime; nothing importable without
importing the runtime. mattpocock is prose-only — every skill is a self-contained
Markdown file that could physically move into `packages/core/skills/` without
dragging infrastructure. `codebase-design/SKILL.md` is 6.4 KB of prose;
`tdd/SKILL.md` is 3.5 KB with two sibling reference files; the working median
across the promoted set is 3-7 KB. The structural question W01P07 answered "no"
for GSD-core answers "yes" here, and that alone is why this document exists.

## Why it matters

Two reasons, and only one of them is about code.

**The census is the deliverable, again.** The 37 skills are being read by a
growing number of teams; leaving the question "does Moe want any of them?"
unresolved means it reopens every time someone new joins. This document produces
a defensible answer with a pinned revision behind it, so the question stops
reopening — the same value W01P07 delivered for GSD-core.

**There is one genuine architectural-vocabulary gap in the current 27 skills,
and this upstream fills it.** `grep -rniE "deep module|shallow module|deepening|ousterhout"
packages/core/skills/` returns **1 hit**, in `writing-skills/anthropic-best-practices.md:887`
— an incidental "Ousterhout's law" reference. "Seam" appears 68 times but every
instance is a *test seam* in `iterative-development` (proof placement — unit /
integration / e2e); the Feathers *architectural seam* is absent. Moe teaches how
to test modules but has no vocabulary for what makes a module deep. mattpocock's
`codebase-design` is exactly that vocabulary, made operational.

## Current state

**The provenance chain, with evidence for each link.**

1. **Upstream.** `github.com/mattpocock/skills`, MIT (`LICENSE:1-2` — "MIT
   License / Copyright (c) 2026 Matt Pocock"), active, first-party single-author.
   Claude Code official marketplace verified 2026-08-05
   (`.agents/adrs/0002-ship-as-a-claude-code-plugin.md`, Update section).
2. **Shallow-clone target.** `../.moe-references/mattpocock-skills/`, one commit at
   `6654f6b` (2026-08-24, "feat: add 'Information access' category to retrospective
   skill"). Same envelope every other upstream in `PARITY.md` sits in.
3. **No fork of it and no derivative install.** Unlike GSD-core, there is no
   `~/.claude/mattpocock-*` install and no deleted-repo problem. Zero provenance
   ambiguity — the LICENSE on disk matches the API, the author is reachable, and
   nothing on this machine derives from it yet.

**Project stance, from its own words.**

- `README.md:15` — "*My agent skills that I use every day to do real engineering
  — not vibe coding.*"
- `README.md:17` — explicit non-alignment with the process-owning frameworks
  Moe's other upstreams do not compete with either: "*Approaches like GSD,
  BMAD, and Spec-Kit try to help by owning the process. But while doing so, they
  take away your control and make bugs in the process hard to resolve.*"
- `README.md:19` — "*small, easy to adapt, and composable. They work with any
  model.*"
- `CLAUDE.md:1-9` — five buckets, only `engineering/` and `productivity/` ship
  in the plugin. `misc/`, `in-progress/`, `deprecated/` are not promoted.

**Curation is done for us.** mattpocock's `.out-of-scope/` directory records
three items explicitly declined with prior-issue citations
(`mainstream-issue-trackers-only.md`, `question-limits.md`,
`setup-skill-verify-mode.md`). None of the three maps to anything Moe ships or
has queued, so nothing in the declined pile changes any verdict below.

**Size profile.** The full clone is 1.5 MB. The promoted set (24 skills across
`engineering/` and `productivity/`) totals ~180 KB of prose plus small
`wizard/template.sh` and `diagnosing-bugs/scripts/` helpers. Against Moe's
current `packages/core/skills/` at 892 KB / 27 skills, the delta for Option B (§
Proposed approach) is +4 skill directories and ~30 KB.

## The import census

All 37 upstream skills, grouped. `[E]` = engineering (promoted), `[P]` =
productivity (promoted), `[I]` = in-progress (not promoted), `[M]` = misc (not
promoted). One verdict per family; ungrouping would not change any verdict.

| Family (count) | Matt's skills | Verdict |
|---|---|---|
| **Router / setup [E] (2)** — `ask-matt`, `setup-matt-pocock-skills` | Human map over user-reachable skills; repo bootstrap | **SKIP** — assumes an issue-tracker abstraction Moe does not have; `skill-tiers.yaml` + `using-moe` cover the discovery function |
| **Grilling / interview [E,P] (3)** — `grilling`, `grill-me`, `grill-with-docs` | Round-based BFS through design-tree frontier, one recommended answer per Q | **PARTIAL OVERLAP with `brainstorming`.** Different philosophies: `brainstorming/SKILL.md:14-20` is a classify-and-gate pattern with a `<HARD-GATE>`; `grilling/SKILL.md:6-8` is a design-tree frontier BFS. Peers, not competitors. **SKIP as skill** — importing means two openers racing. Worth cross-pollinating into `brainstorming` as an "already-scoped, need to sharpen" branch later |
| **Domain modeling [E] (2)** — `domain-modeling`, `grill-with-docs` (delegator) | Ubiquitous-language / `CONTEXT.md` / ADR discipline | **IMPORT candidate.** `grep "ubiquitous language\|CONTEXT.md\|ADR" packages/core/skills/` returns 1 hit total. Real gap. Matt himself flags it in `README.md:106-141` as "the single coolest technique in this repo" |
| **Deep-module design [E] (2)** — `codebase-design`, `improve-codebase-architecture` | Ousterhout's deep-module vocabulary; deletion test; design-it-twice; seam analysis; hotspot scan producing HTML report | **IMPORT — this is the find.** See below. Load-bearing across the rest of matt's set (`tdd`, `to-spec`, `wait-what`, `DEEPENING.md` all reference it) |
| **Debugging [E] (1)** — `diagnosing-bugs` | Loop-first: 10 loop-construction techniques ordered by fallback; hypothesis ranking; phase-gated | **ALREADY-COVERED-BY `systematic-debugging` — peer, different frame.** Matt's Phase 1 is "build a feedback loop that goes red" (`diagnosing-bugs/SKILL.md:20-37`); Moe's Iron Law is "NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST" (`systematic-debugging/SKILL.md:16-17`), Phase 1 is data-flow tracing. Neither covers SBFL or bug taxonomy — that is what W01P07 imports. Two peer skills fighting for the debug opener would harm both |
| **TDD [E] (1)** — `tdd` + `tests.md` + `mocking.md` | Compact TDD with seam vocabulary tied to `codebase-design` | **ALREADY-COVERED-BY `test-driven-development` (9.0 KB + `writing-good-tests.md` 8.3 KB) — Moe is stronger.** If `codebase-design` imports, Matt's `tdd/SKILL.md:19-26` seam cross-link becomes worth mirroring in Moe's TDD as one line |
| **Review [E] (1)** — `code-review` | Parallel Standards vs Spec sub-agents; 12-item Fowler smell baseline pasted into the Standards sub-agent prompt at `code-review/SKILL.md:45-56`; two-axis "Standards pass / Spec fail" classification | **PARTIAL OVERLAP with `requesting-code-review` + `receiving-code-review` — different actor.** Matt's is reviewer-side; Moe's are requester/recipient. **Secondary IMPORT candidate:** fold the Fowler-smell block + two-axis classification into `requesting-code-review/` as a sibling reference. Portable prose, cited to Fowler *Refactoring* ch.3 |
| **Planning: issue-tracker-native [E] (3)** — `to-spec`, `to-tickets`, `wayfinder` | Fog-of-war; decision tickets vs task tickets; tracker-native blocking | **SKIP as skills.** Different metaphor, and every one assumes an "issue tracker" abstraction Moe deliberately does not have (`README.md` describes `.planning/` markdown as the ledger). `wayfinder/SKILL.md:74-80`'s decision-ticket / task-ticket split is a good idea worth cross-pollinating into `writing-plans` prose — but that is a rewrite, not an import |
| **Implement [E] (1)** — `implement` | 433 B trivial delegator | **ALREADY-COVERED-BY** `implementing-tasks` + `executing-plans` + `subagent-driven-development` |
| **Research [E] (1)** — `research` | 794 B background-agent research with primary-source rule | **ADDITIVE (small).** Moe has `subagent-driven-development` but no explicit background-research pattern. Weak IMPORT candidate |
| **Prototype [E] (1)** — `prototype` + `LOGIC.md` + `UI.md` | Throwaway HTML prototype for logic vs UI questions | **IMPORT candidate.** No Moe equivalent. Matches the spike frame `brainstorming` opens with |
| **Wizard [E] (1)** — `wizard` + `template.sh` | Interactive bash wizard for human-only setup steps (`.env`, `gh secret`) | **ADDITIVE but narrow.** Weak IMPORT candidate; small audience overlap with Moe's 20 users |
| **Merge conflicts [E] (1)** — `resolving-merge-conflicts` | 918 B, prose-only | **ADDITIVE.** No Moe counterpart. Small IMPORT candidate |
| **Triage [E] (1)** — `triage` | 6.6 KB tracker-native triage flow | **SKIP** — assumes issue-tracker abstraction |
| **Writing for agents [P] (1)** — `writing-for-agents` + `SKILL-MECHANICS.md` | Conceptual framework: context load vs cognitive load; information hierarchy; progressive disclosure; leading words; no-op detection; negation as failure mode | **PARTIAL OVERLAP with `writing-skills` — complementary, not duplicative.** Moe's is TDD-for-skills (RED-GREEN-REFACTOR at `writing-skills/SKILL.md:30-45`); Matt's is the design method. **Secondary IMPORT candidate** as `writing-skills/` sibling reference — teaches the typography, not the test |
| **Teach [P] (1)** — `teach` + 4 format siblings | Stateful teaching workspace with lessons/reference/mission | **SKIP** — off-thesis, no Moe audience |
| **Handoff [P,I] (3)** — `handoff`, `claude-handoff`, `to-questionnaire` | Session-continuation pattern; `claude-handoff` uses `claude --bg` | **ADDITIVE (marginal).** `handoff` is 894 B, portable. Weak IMPORT candidate |
| **Wait-what [P] (1)** — `wait-what` | 394 B one-liner | **ADDITIVE (trivial).** IMPORT-if-trivial |
| **In-progress: writing [I] (3)** — `writing-fragments`, `writing-shape`, `writing-beats` | Prose-writing helpers | **SKIP** — different domain from `writing-clearly-and-concisely`; upstream marks in-progress |
| **In-progress: other [I] (5)** — `loop-me`, `retro`, `setup-ts-deep-modules`, `implement-spec` | Upstream marks in-progress | **SKIP** — Matt himself has not shipped these. `setup-ts-deep-modules` becomes worth watching if `codebase-design` imports |
| **Misc [M] (4)** — `setup-pre-commit`, `git-guardrails-claude-code`, `scaffold-exercises`, `migrate-to-shoehorn` | Project-specific: Husky wiring, aihero.dev exercise scaffold, `@total-typescript/shoehorn` migration, git guardrails | **SKIP** — project-specific or overlaps `mint` hook work |

**33 of 37: skip or already covered. 4 primary IMPORT candidates, 2 secondary
sibling-reference imports.** The list is short because Moe already imports six
tightly-curated upstreams that cover most ground; what remains is real.

### The one real find

**`codebase-design` + `improve-codebase-architecture`.** Ousterhout's
deep-module vocabulary, made operational.

`codebase-design/SKILL.md:10-30` defines an eight-term glossary — **Module**,
**Interface**, **Implementation**, **Depth**, **Seam** (Feathers), **Adapter**,
**Leverage**, **Locality** — with an explicit "avoid" list ("Avoid: component,
service, boundary"). Four principles (`SKILL.md:60-66`):

- "Depth is a property of the interface, not the implementation."
- "The deletion test. Imagine deleting the module. If complexity vanishes, it
  was a pass-through."
- "The interface is the test surface."
- "One adapter means a hypothetical seam. Two adapters means a real one."

`DEEPENING.md:5-28` operationalises this with four dependency categories
(in-process / local-substitutable / remote-but-owned / true-external) driving
whether a port/adapter is warranted. `DESIGN-IT-TWICE.md:1-30` is a
Ousterhout-cited pattern for spawning 3+ parallel sub-agents to draft radically
different interfaces before picking one. `improve-codebase-architecture/SKILL.md:22-38`
is the *scan* skill built on this vocabulary — walks git hotspots, applies the
deletion test, produces a Tailwind+Mermaid HTML report with before/after
diagrams per candidate.

**Why this is the find.** Additive to at least three existing Moe skills.
`test-driven-development` gains a vocabulary its own author already reached for
(Matt's `tdd/SKILL.md:19-26` explicitly delegates to `codebase-design` for the
seam concept). `finding-duplicate-functions` gains the deletion test as a
formal criterion. And W01P07's queued `debugger-*` references gain teeth: the
"correct seam" question at Moe's `systematic-debugging` Phase 5 currently has
no vocabulary to answer with, and Feathers's "seam" is exactly the missing
noun.

Prose-only, MIT, no runtime dependency, load-bearing across five other matt
skills — battle-tested prose. Additive, methodology-compatible — the opposite
of the 33 skipped above.

**Secondary finds worth naming, both as sibling references, no new skill
directory:**

- **Fowler smell baseline** in `code-review/SKILL.md:45-56` — a portable 12-item
  checklist that could sit under `requesting-code-review/` as
  `references/fowler-smells.md` without any Moe-side rewrite. Cited to
  *Refactoring* ch.3.
- **`writing-for-agents/SKILL.md:11-82`** — context load vs cognitive load,
  information hierarchy (in-file step / in-file reference / disclosed reference),
  leading words, no-op detection, negation-as-failure-mode. Sibling under
  `writing-skills/` as `references/skill-typography.md`. Zero methodology
  conflict; Moe teaches the test method, this teaches the design method.

### Cross-check against W01P07's debugger-reference import

**Zero overlap. W01P07's decision holds.**
`grep -rniE "sbfl|spectrum|ochiai|bohrbug|heisenbug|mandelbug|fault local|bug
taxonom|delta debug|semantic recall|asvs" ../.moe-references/mattpocock-skills/`
returns no hits. Matt's `diagnosing-bugs` has a phase-gated loop-first structure
with 10 loop-construction techniques (`SKILL.md:26-36`) and a hypothesis-ranking
rule (`SKILL.md:88-98`), but no spectrum-based fault localization, no Ochiai
formula, no Bohrbug/Heisenbug/Mandelbug classification, no RCA branching
taxonomy, no fix-acceptance formal criteria, no ASVS levels, no semantic-recall
equivalent. The nine GSD debugger references and `security-asvs-levels.md` are
additive to *both* Moe's `systematic-debugging` and Matt's `diagnosing-bugs`.
**Nothing in mattpocock supersedes any file W01P07 is queued to import.** The
cross-reference is worth adding to W01P07's "already-covered-by" scan — proposed
as a one-line edit below, not folded in silently.

## The license and provenance question

**The cleanest of any upstream in the ledger, and this is the whole answer.**

- `LICENSE:1-2` verified on disk — MIT, Copyright (c) 2026 Matt Pocock. Matches
  the GitHub API's SPDX claim, matches `.claude-plugin/plugin.json` metadata.
  MIT sits inside `PARITY.md:50-53`'s existing envelope.
- **First-party, single-author.** No embedded third-party content requiring
  separate attribution. No vendored source trees. The three named external
  sources — Ousterhout (*A Philosophy of Software Design*), Feathers
  ("seam" definition), Fowler (*Refactoring* ch.3, 12 smells) — appear as
  conceptual citations in prose, not as included content. No license
  implication.
- **No derivation from any upstream Moe already carries.**
  `grep -rli "anthropic\|superpowers\|jesse\|obra\|prime.radiant" ../.moe-references/mattpocock-skills/`
  returns zero content-file hits. Matches to "anthropics/claude-plugins-official"
  in `.agents/adrs/0002-ship-as-a-claude-code-plugin.md` are references to the
  Claude Code marketplace org, not derivation. Not derived from Anthropic's
  skill starter kit, `obra/superpowers`, or any other upstream in the ledger.
- **Author is reachable.** Unlike the deleted `moe-cc` repo, license questions
  about anything in this tree can be *asked*. Artifact archaeology is not
  required.

**Import from upstream, never from any local copy.** No local copy exists; this
is easier than for GSD-core, where the temptation was to read
`~/.claude/moe-core`. Here every file comes from `../.moe-references/mattpocock-skills/`
pinned at `6654f6b`.

## Proposed approach

**Option A — census only, import nothing.** Add `mattpocock/skills` to
`PARITY.md`'s **Excluded** table at `6654f6b` with this census as the reason;
note that the deep-module vocabulary was evaluated and declined on
shrinking-the-fork grounds. ~1 h. Zero risk. The vocabulary gap stays open, and
the value that Matt himself flags as "the single coolest technique in this
repo" (`README.md:106-141`) is left on the table.

**Option B — import the additive material, four new skills plus two sibling
references.**
- `codebase-design/{SKILL.md, DEEPENING.md, DESIGN-IT-TWICE.md}` → new
  `packages/core/skills/codebase-design/` directory
- `improve-codebase-architecture/{SKILL.md, HTML-REPORT.md}` → new
  `packages/core/skills/improve-codebase-architecture/`
- `domain-modeling/{SKILL.md, CONTEXT-FORMAT.md, ADR-FORMAT.md}` → new
  `packages/core/skills/domain-modeling/`
- `prototype/{SKILL.md, LOGIC.md, UI.md}` → new `packages/core/skills/prototype/`
- Fowler smell block from `code-review/SKILL.md:45-56` → sibling reference
  `packages/core/skills/requesting-code-review/references/fowler-smells.md`
- `writing-for-agents/{SKILL.md, SKILL-MECHANICS.md}` → sibling reference
  `packages/core/skills/writing-skills/references/skill-typography.md` (+ one
  companion)

Adds a `mattpocock/skills` row to `PARITY.md`, 4 entries to the `authored:` /
`imported:` split in `skill-tiers.yaml`, 4 lines to
`metadata.test.ts:156-192`'s enumeration (the `imported:` list, since these are
imports from a new upstream — not `authored:`). ~30 KB of new prose, no
runtime. **4-6 h.**

**Option C — import the whole promoted set** (24 skills across `engineering/`
and `productivity/`) as a new upstream row. Rejected: 20 of the 24 duplicate
existing Moe skills or assume the tracker abstraction. Shrinking is the fork's
thesis; this would grow.

**Recommendation: Option B.** The wall that made W01P07 hard is gone —
`skill-set-fidelity-refactor` merged 2026-08-31 and split the registry into
`imported:` (fidelity-pinned) and `authored:` (open), so the exact-27 assertion
no longer decides this. The remaining question is scope discipline, and the
answer is that `codebase-design` fills a vocabulary gap at least three existing
skills would silently benefit from having a name for. It arrives prose-only,
MIT, from a first-party reachable author — the cleanest license situation in
the ledger. **Same shape as W01P07's Option B, at a slightly wider scope, and
with the extra-27 assertion already resolved before we get here.**

Fall back to A only if the "shrink to 9 packages" thesis outranks filling the
architectural-vocabulary gap. That is a judgment call for the human reviewer,
not evidence a fresh census could overturn.

## Scope boundary

**In:** the provenance chain and 37-skill census with verdicts; a `PARITY.md`
row for `mattpocock/skills` @ `6654f6b`, MIT, with landing places; a shallow
clone into `../.moe-references/mattpocock-skills` (already present after the
census); the four new skill directories under `packages/core/skills/`; the two
sibling references under existing skill directories; corresponding
`skill-tiers.yaml` entries; the `imported:` enumeration update in
`metadata.test.ts:156-192`; an `ARCHITECTURE.md` §2 note recording
`mattpocock/skills` as an evaluated-and-imported upstream.

**Out:** running mode / opener design — `brainstorming` and `grilling` are
peers and importing both would create a race, so `grilling` stays out. The
issue-tracker abstraction — `wayfinder` / `to-tickets` / `to-spec` / `triage`
all assume it; Moe's ledger is `.planning/` markdown by design (see W01P07's
`deterministic-task-dag` and this repo's `README.md`). Cross-pollinating
`wayfinder`'s decision-ticket / task-ticket split into `writing-plans` — a
follow-up rewrite, not an import. Anything under `misc/` or `in-progress/`.
**Also out: modifying W01P07's decisions.** This document confirms zero overlap
with W01P07's queued debugger imports; the only proposed change to W01P07 is
the one-line cross-reference edit named below.

## Proposed edits to sibling backlog items

**W01P07 — one-line cross-reference edit only, subject to approval.** Under
"The one real find" (line 187), append: *"Cross-checked against
`mattpocock/skills` @ `6654f6b` by `mattpocock-skills-import` — no overlap; the
9 references remain the only source for SBFL/bug-taxonomy content."* That is
the entire proposed W01P07 change. Its decisions, its debate-review record and
its 2026-08-31 sign-off remain untouched.

## Effort

| Step | Time |
|---|---|
| Verify shallow clone at `../.moe-references/mattpocock-skills/` matches `6654f6b`; LICENSE on disk still MIT | 10 min |
| `PARITY.md` row + census summary; `ARCHITECTURE.md` §2 note; one-line W01P07 cross-reference edit | 45 min |
| Copy the 4 skill directories from upstream to `packages/core/skills/`; strip Matt-specific `ask-matt` / repo-router language; rewrite any cross-links against Moe's skill names | 1.5 h |
| Extract Fowler smell block to `requesting-code-review/references/fowler-smells.md`; extract `writing-for-agents` to `writing-skills/references/skill-typography.md`; rewrite any cross-links | 45 min |
| `skill-tiers.yaml` entries (4 new imported skills, `from: mattpocock-skills`); `metadata.test.ts` `imported:` enumeration update | 30 min |
| `pnpm --filter @bubstack/moe-core test`, biome, `tsc -b` | 20 min |

**4-6 h.** Slower if `codebase-design/DEEPENING.md`'s four-category dependency
model turns out to name concepts already named in Moe under other words — then
the sibling-reference is a rewrite pass, not a copy. Option A alone is ~1 h.

## Verification

- `../.moe-references/mattpocock-skills` exists as a one-commit shallow clone;
  `git -C ../.moe-references/mattpocock-skills rev-parse --short HEAD` equals
  `6654f6b`; a `LICENSE` naming MIT is present in it.
- `PARITY.md` names `mattpocock/skills` with pinned revision, `MIT`, and landing
  places (`@bubstack/moe-core`) — or lists it under **Excluded** with this
  census as the reason.
- `pnpm --filter @bubstack/moe-core test` green **with `metadata.test.ts`'s
  `imported:` enumeration extended to include the 4 new entries and the
  `imported:` count assertion updated by exactly 4.** The `authored:` set is
  unchanged; these are imports, not authored additions.
- `grep -rniE "deep module|shallow module|deletion test|design it twice"
  packages/core/skills/` returns hits under the new `codebase-design/`,
  `improve-codebase-architecture/`, and `test-driven-development/` (via a
  one-line cross-link if `tdd/SKILL.md:19-26` is mirrored).
- `grep -rn "mattpocock\|matt-pocock\|ask-matt\|setup-matt-pocock-skills"
  packages/core/skills/` returns nothing — the rebrand is complete.
- The relative-link test passes with the new siblings linked from
  `codebase-design/SKILL.md` and the two host skills.
- Nothing under `~/.claude/` is modified: `git status` in this repo is the only
  diff.
