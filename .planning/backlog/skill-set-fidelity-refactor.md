---
slug: skill-set-fidelity-refactor
title: Two-List Skill Fidelity, Upstream Pinned
idea: |
  Not an IDEA-LOG.md item. Created by a decision of 2026-08-31: the fork WILL
  admit Moe-original skills — "new skills are coming once this initiative
  completes." `packages/core/test/metadata.test.ts` currently makes a
  fork-authored skill impossible, and four backlog items were written around
  that wall. This item removes the wall without removing the guarantee it was
  protecting.
status: backlog
size: M
estimate: 4-5 h
depends_on: [DO-NOW-1, DO-NOW-2]
blocks: [deterministic-task-dag]
conflicts_with: [parallel-execution-option, gsd-core-skill-import, tiered-workflow-naming, native-renderers, deterministic-task-dag, runtime-pruning]
touches:
  - packages/core/skill-tiers.yaml
  - packages/core/test/metadata.test.ts
  - packages/core/README.md
  - PARITY.md
decision_needed: yes
---

# Two-List Skill Fidelity, Upstream Pinned

## The idea

> The fork admits Moe-original skills. The import-fidelity assertions do not
> allow that. Replace them with a two-list model: an upstream-pinned set that
> still fails loudly on any drop or rename, and an open fork-authored set.

`packages/core` today is 27 skills from six pinned snapshots and nothing else, and
`test/metadata.test.ts` says so with **equality** assertions. Equality catches a
deletion, which is what it was written for — but it catches an addition with the
same force, and the failure reads like a fidelity breach when it is someone doing
the newly-sanctioned thing. The job is to split one assertion into two: keep
equality on the upstream half, open the other half, and make the two separable
from the files alone.

## Why it matters

The wall is load-bearing in the *backlog*, not just the test. Three docs cite the
same four line numbers as the reason they chose a weaker mechanism, and
`gsd-core-skill-import:249-255` files it as an open question for Zak explicitly
flagged as "shared with at least two other backlog items. Worth deciding once,
for all of them, rather than three times." This item is that once.

The guarantee must survive intact. `PARITY.md:3-6` is the fork's ledger precisely
because there is no reachable upstream author — "find the artifact, not the
person." `:115` and `:153-190` are the mechanical half of that ledger: how "the
import is complete and unmodified" gets checked by a machine rather than asserted
in prose. A refactor that trades them for a subset assertion buys additions by
deleting the only automated fidelity check in the package.

## Current state

All citations from the `import/packages-core` worktree
`.claude/worktrees/wf_238bb49d-362-13`, package `packages/core`. On `main` this
package is a stub; nothing below exists there yet (DO-NOW-1).

The sites named in the brief, verified:

- `:115` — `expect(skills.length).toBe(27)`, inside `it("ships exactly 27 skills")`
  at `:109`.
- `:153-191` — `it("accounts for every skill the six upstream sources shipped")`.
  The `expected` literal is `:156-189`, grouped by source with each snapshot's
  short SHA in a comment, headed "Enumerated from the pinned snapshots at import
  time." The assertion at `:190` is `expect([...skillNames].sort()).toEqual(expected)`.
- `:457` — `expect(Object.keys(tiers.skills).sort()).toEqual([...skillNames].sort())`:
  `skill-tiers.yaml` must name every skill directory exactly, both directions.
  `:458-465` then requires `tier` ∈ {core, everything}, a truthy `from`, and a
  `why` over 40 characters.
- **`:470` is the real line** for `expect(core.length).toBe(13)`. `:468` opens
  `it("keeps the lean tier lean")` and `:469` is the filter; the readers citing
  468/469 were one or two lines short. `:471` adds
  `toBeLessThan(skills.length / 2 + 1)`.
- `:241-244` — REQUIRED-marker resolution. `:241` collects every backticked bare
  kebab token on the line, `:242` keeps the ones that are skill names, `:243`
  flags only when **zero** resolve. The brief is right that this is weaker than
  it looks.
- `:312-327` — 14 hardcoded paths asserted to exist and carry the execute bit
  (loop at `:328-332`). `:336-348` and `:355-360` are two more hardcoded lists,
  for `bash -n` and `node --check`.

Four further facts that change the answers, none of them in the brief:

**`skill-tiers.yaml` has exactly one machine consumer.** `metadata.test.ts:452`
is the only code that parses it; `moe-mint.yaml:11` mentions it in a comment and
`README.md:99,112,141,155,715` describe it in prose. DO-NOW-3 has not yet been
written against its schema, so this is the cheapest moment the schema will ever
be changeable.

**The execute-bit allowlist has already drifted.** `find skills hooks -type f
-perm -u+x` returns 18 non-example files; `:312-327` lists 14. The four missing
are all Python, all in the iterative-development cluster:
`skills/extracting-requirements/scripts/{aggregate_stories,chunk_spec}.py` and
`skills/{running-an-iteration,scoping-the-simplest-core}/scripts/check_citations.py`.
They carry no execute-bit guard and no parse check — a hand-maintained allowlist
already fell behind before any fork-authored skill existed.

**All-resolve passes today.** Seven real REQUIRED lines exist (nine matches minus
the two `- ✅` authoring examples `:240` already skips):
`executing-plans/SKILL.md:37`, `writing-plans/SKILL.md:61,166,170`,
`writing-skills/SKILL.md:18,393`,
`writing-skills/testing-skills-with-subagents.md:13`. Every backticked kebab
token on all seven is a real skill name, so tightening `:243` is a zero-content diff.

**Provenance cannot live in frontmatter.** `:145` allows exactly `name`,
`description`, `allowed-tools`, `argument-hint` — the keys Claude Code recognises
on a skill. An `origin:` key fails that test *and* ships a non-standard key into
every generated plugin.

## Prerequisites

**DO-NOW-1** — the file is on a branch; restructuring before the merge means
resolving the same conflict twice.

**DO-NOW-2 — the dependency is right, but not for the schema reason the brief
gives.** The schema argument is weak in both directions: DO-NOW-2 edits `tier:`
*values*, I edit *structure*, and my restructure would remove work from DO-NOW-2
by retiring the magic number it would otherwise hand-update. The real reason is
`:470`. My recommendation keeps an explicit lean-tier count, and
`skill-tiers.yaml`'s own header says the current split "is a PROPOSAL awaiting
human review, not a settled decision." Landing first means pinning an undecided
13 as the diff's central assertion and having DO-NOW-2 move it before review.
Landing second means the number I pin is a decision. Separately, this item
reindents all 27 entries under a new top-level key, which conflicts textually
with any concurrent edit to that file — same-wave was never available regardless
of order.

No backlog slug is a prerequisite.

### What blocks on this, and what does not

Only one of the brief's four genuinely blocks.

**`deterministic-task-dag` — blocks. Confirmed.** It adds a 28th core skill,
`sequencing-plans`. Its `:146-148` already names this item a hard prerequisite,
its `depends_on` at `:11` already lists this slug, its `:211` wants `from: moe`,
and its `:302` needs `plan-set` in the two hardcoded allowlists. It is also the
acceptance test for this design.

**`tiered-workflow-naming` — does not block.** It re-weighed after the decision
(`:245-258`, "That leg is gone and I am not going to pretend otherwise") and kept
its no-new-skill recommendation on a different argument. **But there is an
ordering collision.** Its Verification at `:360-362` requires
"`test/metadata.test.ts:115`, `:153-190` and `:470` **unmodified** in the diff"
as its proof it took the right mechanism. After this item those lines do not
exist in that form and the bullet is unsatisfiable as written; it needs restating
as *touches neither `imported:` nor the pinned literal, and does not move
`LEAN_TIER_BUDGET`*. Same file, so `conflicts_with` either way.

**`moe-tone-and-branding` — does not block.** Explicit at `:145`: "Not
`skill-set-fidelity-refactor`, because this item adds no skill." Recommendation C
(`:171-180`) is a `house-voice.md` reference file, not a 28th skill. Its
`:148-150` correctly predicts the one consequence — it cited `:115` as the
automatic guard on "no 28th skill," which becomes "documented, not enforced."
Worth telling that doc: an unregistered skill still fails the completeness
equality and a registered one is an explicit two-line manifest diff, so the guard
is narrower than `toBe(27)` but better aimed.

**`codegraph-context-layer` — does not block.** It routes around core, to
`packages/memory/skills/retrieving-context/` (`:247`, `touches:13`). Verified
independently: no test under `packages/memory/test/` or `packages/flight/test/` in
worktrees `-14`/`-15` asserts a skill count, a name set, or reads a tiers file
(`grep -rn "skills.length\|skillNames\|skill-tiers"` over both returns nothing).
Its rationale at `:250-256` ("`packages/core` is effectively closed to new
skills") becomes false once this lands, so a reader may revisit the placement, but
its on-the-merits argument at `:262-264` stands alone.

Two more, not in the brief, neither blocking: `gsd-core-skill-import` recommends
"no new skills" (`:210`) — though its open question 1 is precisely this doc, and it
becomes a hard dependency if the census returns IMPORT; and `native-renderers`
adds assertions to `metadata.test.ts` but no skill (`:215`). `conflicts_with`
covers every doc touching `metadata.test.ts` or `skill-tiers.yaml`, plus
`runtime-pruning`, the other `PARITY.md` editor. The sharpest is
`parallel-execution-option`: its `:176` moves `:470` from 13 to 14, the same
assertion this item rewrites.

## Proposed approach

The work splits into three parts, and the split is deliberate. **Part A** is the
upstream-fidelity model: where the pinned list lives, what replaces `toBe(27)`,
the `from:` convention, and what a Moe-original skill needs. **Part B** is the
`skill-tiers.yaml` schema: the lean budget, tier assignment, and the closure rule.
**Part C** is independent of both.

**Part B is contingent on a pending decision.** Zak has questioned the premise of
the lean/full split — measured, the 27 name+description pairs are 5,333 characters
(~1,333 tokens) resident per session against ~57k tokens of bodies loaded on
demand, so the split saves roughly 700 tokens, and `ARCHITECTURE.md` §2 justifies
it purely on context cost. This doc is written for the world where the split
exists, because that is today's code. If it is dropped, `:457`, `:460`, `:470` and
`:474` go with it and **Part B is deleted rather than rewritten.** That holds
because `skill-tiers.yaml` is already two files in one: a provenance registry
(`from:` on all 27 entries) and a tiering table (`tier:` plus the `plugins:`
block). Part A uses only the first, so dropping the split deletes the `tier:` keys
and renames the file; `imported:`/`authored:`/`from:` stay exactly as Part A
leaves them.

### Part A — the upstream-fidelity half

#### A1 — where the upstream list lives

Not a new manifest, and not `PARITY.md`. The Map (`PARITY.md:24-44`) is
repo→package with no per-skill rows; deriving a skill list from it means adding 27
rows to the ledger and parsing a prose table in a unit test. A third file is a
third copy — and **every one of the 27 `skill-tiers.yaml` entries already carries
`from:`** naming its upstream repo.

So split the existing `skills:` map in place, in the file that already holds the
provenance:

```yaml
imported:              # 27 entries. Frozen. A diff here is a fidelity decision.
  brainstorming:
    tier: core
    from: superpowers
    why: >-
      ...
authored:              # Open. Moe-original skills. `from: moe`, no upstream.
  {}
```

The two lists are then separable by opening one file, with no git history — the
stated requirement. Two assertions replace the old two, **both still equalities**:

1. **The pin.** The 27-name literal now at `:156-189` stays — comment, per-source
   grouping, snapshot SHAs and all — and is asserted against
   `Object.keys(imported)` rather than against on-disk names. Its strength is
   unchanged; its subject narrows to the upstream half.
2. **Completeness.** `[...keys(imported), ...keys(authored)]` equals the on-disk
   skill names exactly, and the two maps are disjoint.

This adds no copy of anything: the same fact is already stored twice today — the
test literal and the yaml keys — tied only transitively through the filesystem.
After the change they are tied directly, so the equality assertion *is* the drift
detector, and the drift risk the brief asks me to weigh goes to zero rather than
being traded away.

I deliberately do **not** have the test read `../../../PARITY.md`: every path in
this file today is `join(PKG, …)` or `join(SKILLS, …)`, and a package test
reaching to the repo root costs more than it buys.

#### A2 — what replaces `toBe(27)`

**`toBe(27)` goes.** It is a total, and a total is exactly what additions are now
allowed to move. It becomes `expect(Object.keys(imported).length).toBe(27)` —
still an explicit pinned 27, but pinning the upstream half instead of the package.
No assertion on the grand total: it follows arithmetically from the completeness
equality, so restating it only creates a line to hand-bump per addition, which is
the defect being removed. (`toBe(13)` is a different animal and is B1.)

#### A3 — the `from:` convention

**First, a correction to the premise I was handed.** `:460` is
`expect(entry.from, ...).toBeTruthy()` — truthy only. `from: moe` satisfies it, so
it is **not** a fifth assertion blocking a fork-authored skill; nothing fails
there today. `deterministic-task-dag:209-212` reads it the same way ("Also minor")
and asks this item to define the value rather than inventing one. The real defect
is the opposite of blocking: truthy is *too weak to be a convention at all*. It
accepts `from: unknown`, `from: ?`, `from: n/a`, and it accepts an upstream skill
relabelled to hide a drop. That is what needs fixing, and it is a harder
constraint than the `PARITY.md` row shape because it is enforced in code rather
than by convention.

Three options. A distinct key (`authored: true` alongside `from:`) means two
fields that must agree and a third state when they disagree. A nullable `from:`
with `:460` relaxed to "upstream entries must name a pinned upstream" means every
reader handles `undefined`, and it leaves nowhere to record a *different* kind of
provenance later.

**Recommendation: `from:` stays a required non-empty string in both maps, and the
allowed value set is asserted per map.** Distinct `from:` values inside
`imported:` must equal a five-name literal (`superpowers`, `superpowers-lab`,
`superpowers-developing-for-claude-code`, `iterative-development`,
`the-elements-of-style`); `authored:` entries must be exactly `moe` and must not
name any of the five. `:460` itself is unchanged — this is added around it, not in
place of it.

Three reasons. One key, one meaning, one type — no consumer grows an `undefined`
branch. It closes the relabelling loophole: moving an upstream skill to
`authored:` to dodge the pin means writing `from: moe` over a real provenance
value, a lie a reviewer can see in a diff that also deletes a line from the pinned
literal. And provenance is a vocabulary that will grow, not a boolean:
`gsd-core-skill-import` adds a sixth value if its census returns IMPORT, and TC's
own `gitlab.tcdevops.com/ai/skills` is a plausible seventh for
`tc-governance-integration`. Extending a value set is one test edit plus a
`PARITY.md` row; extending a boolean is a schema change. `from: moe` is also what
`deterministic-task-dag:211` already assumes.

#### A4 — what else a Moe-original skill needs

**Frontmatter: nothing.** `:145` forbids it and Claude Code would not read it, so
provenance lives in the registry (A3), never in `SKILL.md`.

**`licenses/` entry: no.** `:624-635` is "one LICENSE per inbound license, as
NOTICE promises" — *inbound*. Fork-authored content has no inbound license and
does not change `package.json`'s `"MIT AND Apache-2.0"` (`:650`), which is a
statement about imported material, so the `licenses/` equality at `:630-635`
stays untouched. Single exception: a fork-authored skill that *vendors*
third-party text, the way `writing-clearly-and-concisely` vendors the 1918
Strunk, does need a `licenses/` row and an update to that literal.

**`PARITY.md` row: yes, but a pointer, not an inventory.** The Map's five columns
describe something a fork-authored skill is not; four empty cells would corrupt
the table's meaning. The reason not to simply omit it is that `PARITY.md` is the
first file a later auditor opens, and a ledger silently describing core as 100%
imported teaches an auditor something false. So a short sibling section,
deliberately one row per *package* rather than per skill so it cannot rot as
skills are added:

```markdown
## Authored here

Not imported. No upstream repository, no pinned revision, no inbound license —
the Map above does not describe these and must not be stretched to. Each
package's own registry is authoritative; this table only says where to look.

| Package | Authored content under | Registry of record |
|---|---|---|
| `@bubstack/moe-core` | `skills/` | `skill-tiers.yaml` → `authored:` |
```

Be honest that nothing asserts this section — it is a one-row pointer verified by
human review, and the per-package granularity is what makes that acceptable. If
the pending decision renames `skill-tiers.yaml`, this is the one cell that has to
follow.

### Part B — the `skill-tiers.yaml` half (contingent, see above)

#### B1 — what replaces `toBe(13)`

**`toBe(13)` stays, as an explicit number.** Deriving it from the manifest is the
option to reject. `:470`'s job is not fidelity — it is a *budget*. It makes any
tier reassignment a two-file diff, which is the enforcement arm of
`skill-tiers.yaml`'s own ERR SMALL rule ("Every description in an installed
plugin costs context in every session, for ~20 people who will leave the lean
plugin on permanently"). A count derived from the yaml can never fail; it just
reports whatever the yaml says, and the speed bump is gone. So: one named
constant, `LEAN_TIER_BUDGET`, with the ERR SMALL rationale in a comment beside
it, asserted with equality against `core.length` across both maps. A magic number
stops being magic when it is named and explained; it does not stop being a
deliberate speed bump. Drop `:471`'s proportional bound — an exact equality makes
a `<` bound dead weight, and `authored:` growth would only loosen it.

This is the half `parallel-execution-option` cares about: its `:176` plans
`:470`: 13 → 14. Under this shape that is one constant, in one place, still
reviewable.

#### B2 — tiers for fork-authored skills, and `:457`

`:457`'s exactness survives and gets stronger via the completeness assertion:
every skill directory is registered in exactly one of the two maps. No new tier
vocabulary — a fork-authored skill takes the same `tier: core | everything`, so
the closure rule at `:474-499` and the two generated plugins need no change at
all. The `why` > 40 characters rule at `:462-464` applies equally: a Moe-original
skill still has to argue its tier. `deterministic-task-dag:211` already
anticipated `from: moe`; that is the value.

One rot risk to fix in passing: `skill-tiers.yaml`'s `moe-everything` description
hardcodes "all 27 skills". Remove the number from the prose rather than assert it.

#### B3 — closure across the upstream/fork-authored boundary

**The closure property survives, because tier is a property of the entry and not
of the map.** `:474-499` must stay provenance-blind: a core-tier skill may not
REQUIRE an everything-tier skill regardless of who authored either one, since the
reader of the lean plugin hits the same dead end either way. The case named to me
— a fork-authored core skill REQUIREd by an upstream core skill — passes cleanly:
both are `tier: core`, so `:491` never fires. The direction that bites is the
reverse, a fork-authored *everything*-tier skill REQUIREd by an upstream *core*
skill, and it should fail.

**But there is a trap in my own refactor, and it is the worst kind.** `:478` is
`const tierOf = (n: string) => tiers.skills[n]?.tier`. Split `skills:` into two
maps and `tiers.skills` is `undefined`, so `tierOf` returns `undefined` for every
skill, `:481`'s `if (tierOf(s.name) !== "core") continue` skips all 27, `offenders`
stays empty and **`:474` passes vacuously** — the closure rule silently gone. Of
the four assertions reading `tiers.skills` this is the only one that fails
silently: `:457`/`:458` throw on `undefined`, and `:469`'s filter yields an empty
array so `:470` fails loudly against the budget.

So build one merged lookup at the top of the `describe` block —
`{ ...tiers.imported, ...tiers.authored }` — and have `tierOf`, the `:469` filter
and the `:457` check all read it. Then assert inside the closure test that
`tierOf` returns a defined tier for every on-disk skill. The completeness equality
already implies that, but the implication is what just went wrong: two lines
separate a vacuous pass from a real one.

**The coupling, for DO-NOW-2's reviewer:** tier verdict and pointer strength are
one decision, not two. `deterministic-task-dag:205-208` already says so and is
right, and its own case is live — it wants a `**REQUIRED SUB-SKILL:**` pointer at
`writing-plans:23` and `writing-plans` is `tier: core`, so if DO-NOW-2 lands
`sequencing-plans` in `everything` then `:474` fails and the pointer must soften
to "consider". This item cannot fix that for it; it must keep the constraint
enforceable, which the merged lookup does.

### Part C — independent of both halves

#### C1 — the REQUIRED markers

**Tighten it, now.** Change `:243` from `resolved.length === 0` to
`resolved.length === named.length`. It passes on day one on all seven real lines,
so the diff is one operator and no content. Leaving a check weaker than its own
name inside a refactor aimed at exactly this guarantee is the wrong call, and
afterwards the check has more to do: a fork-authored core skill can be REQUIREd,
and zero-resolve would let a typo in a brand-new name pass whenever another token
on the line happened to resolve.

The cost is a real authoring constraint — every backticked bare-kebab token on a
REQUIRED line must be a skill name — and that is the constraint you want, since
`writing-skills/SKILL.md:283-284` already documents that syntax as the house form.

Two consequences to record rather than fix. Cross-package REQUIRED gets stricter,
not merely unsupported: a core skill pointing at memory's `retrieving-context`
now definitely fails. That **confirms** `codegraph-context-layer:268-271` rather
than undermining it, and is right for the same reason as the `:474` closure rule —
core's plugin does not ship memory's skills, so the pointer is a dead end. Second,
the plugin-qualified sweep at `:203-209` matches any `word:word`, so a
fork-authored skill named a bare common word would raise false offenders wherever
that word follows a colon in prose. Multi-word hyphenated names avoid it;
`sequencing-plans` is already safe.

#### C2 — the execute-bit allowlists

**The x-bit allowlist stays an allowlist**, and this is not close: if a file loses
its execute bit, discovery simply does not find it and nothing fails. The
allowlist exists *because* it detects absence. Add the four missing `.py` files
while there.

**Add the missing half: a discovery-based completeness cross-check.** Every file
under `skills/` and `hooks/` that currently has an execute bit must appear in the
allowlist. One direction only — `brainstorming/scripts/{helper,server}.cjs` are
`require`d rather than invoked and correctly carry no bit, so "every script must
be executable" would fail today. This turns "someone added a script and forgot
the allowlist" from silent into failing, which is the addition procedure the brief
asks for, and it is the check that would have caught the four Python files.

**The two parse lists become discovery.** Walk for `.sh`/`.cjs`/`.mjs` plus
extensionless files whose shebang names bash or sh, skipping `examples/` via the
existing `walk(root, { skipExamples })` helper at `:41`. That reproduces the
current 15 entries exactly — 11 by extension, 4 by shebang
(`hooks/claude-judge-continuation` and
`skills/subagent-driven-development/scripts/{review-package,sdd-workspace,task-brief}`)
— so the swap is provably equivalent today and picks up future additions free.
`hooks/run-hook.cmd` is correctly excluded: no shebang, first line
`: << 'CMDBLOCK'`, which is the point of `:397-409`.

## Scope boundary

**In:** the `imported:`/`authored:` split; the assertion rewrites at `:109-116`,
`:153-191`, `:456-466`, `:468-472` and the merged `tierOf` at `:478`; the `from:`
value-set assertions around `:460`; the `:243` tightening; the x-bit
completeness cross-check plus the four missing `.py` paths; discovery for the two
parse lists; the `PARITY.md` **Authored here** section; the five
`README.md:99,112,141,155,715` prose sites the restructure makes wrong, plus
`README.md:716`'s hardcoded "all 27 skills".

**Out:** any actual new skill — `deterministic-task-dag` owns the first one and is
the test case for this design. Which skills sit in which tier, and the 13→14
move: DO-NOW-2 and `parallel-execution-option`. `ARCHITECTURE.md`'s stale skill
counts in §2 and §4: `moe-tone-and-branding` touches that file and owns them, and
I stay out so we do not conflict. Cross-package REQUIRED resolution:
`codegraph-context-layer`. Two-plugin generation from these maps: DO-NOW-3.
`python -m py_compile`: a named follow-on, not taken here.

**What the diff must not do.** Two failure modes, either of which makes the
refactor a net loss:

1. **Do not replace the upstream equality with a subset assertion.** `toEqual`
   over the pinned 27 must remain `toEqual`. `toContain`,
   `expect.arrayContaining`, a superset check and a length-only comparison all
   pass while `brainstorming` is missing. If the assertion cannot fail on a
   deletion, it is not the check.
2. **Do not make room by lowering the guarantee.** No net loss of pinned facts.
   The 27-name literal keeps its per-source grouping and snapshot SHAs, and the
   "Enumerated from the pinned snapshots at import time" comment stays — it is
   what tells a reviewer that a one-line deletion there is a fidelity decision.
   Deriving the pin from `skill-tiers.yaml` alone, with no independent literal, is
   the same failure wearing a manifest.
3. **Do not leave an assertion passing vacuously.** Every lookup re-pointed from
   `tiers.skills` to the two new maps must be proven to still resolve — `:478`'s
   `tierOf` is the one that would go silently empty (B3). A green suite where a
   loop body never executes is worse than a red one, because nobody looks again.

Corollary for review: the diff should *add* assertions and re-aim existing ones.
If it deletes an `expect` without an at-least-as-strong replacement on the same
fact, that is the finding.

## Open questions for Zak

1. **May a fork-authored skill take `tier: core`?** Not a schema question — the
   schema allows it either way — but a policy one, and it is the ERR SMALL
   trade-off applied to content the fork chose to create rather than inherited. A
   `tier: core` authored skill costs a description line in every session for ~20
   people who leave the lean plugin on permanently. `deterministic-task-dag`
   wants `everything` for `sequencing-plans`, so nothing is blocked on the answer
   today. If it is "everything-tier only for now," that is one extra assertion; if
   "decide per skill," the existing `why:` requirement already carries the argument.

2. **Does `PARITY.md` get the Authored here section?** It is your ledger and its
   shape is a statement about what the fork is. The alternative is to leave
   `PARITY.md` purely an import record and let `skill-tiers.yaml` be the only
   place authored content is recorded — cheaper, but an auditor reading only the
   ledger concludes core is entirely imported.

## Effort

| Step | Time | |
|---|---|---|
| Restructure `skill-tiers.yaml` into `imported:` / `authored:` | 30 min | mechanical reindent of 27 entries; drop the hardcoded 27 from the plugin description |
| Rewrite the four assertion blocks (Part A + B1/B2) | 1 h | the design work is in this doc; this is transcription |
| `from:` value-set assertions per map (A3) | 20 min | two literals and two loops |
| Merged `tierOf` + resolved-lookup assertion (B3) | 30 min | small, and the one place to be careful — see must-not 3 |
| Tighten `:243` to all-resolve | 10 min | one operator, passes immediately |
| x-bit completeness check + 4 missing `.py`; parse lists to discovery | 1 h | the shebang predicate is the only fiddly part |
| `PARITY.md` section + five `README.md` prose sites | 40 min | |
| `pnpm --filter @bubstack/moe-core test` plus the three sibling scripts | 20 min | |

**Total 4-5 h.** Slower if: DO-NOW-2's decision arrives *during* the work, so the
reindent conflicts and step 1 is redone — the argument for taking DO-NOW-2 first.
Add 20 min if open question 1 comes back "everything-tier only." Add 30 min and a
second parse if a reviewer wants `imported:` in a separate file after all.
**Faster** if the lean/full split is dropped: Part B disappears and the item is
Part A plus Part C, roughly 2.5-3 h.

## Verification

- `pnpm --filter @bubstack/moe-core test` green, with `test:python`,
  `test:brainstorm` and `test:shell` from `package.json:12-14` unaffected.
- `skill-tiers.yaml` has two top-level maps; `imported:` has 27 entries and
  `authored:` is present and empty. `grep -c "from: moe" packages/core/skill-tiers.yaml`
  returns 0 on this diff — the first non-zero belongs to `deterministic-task-dag`.
- **The pin still fails on a deletion or a rename.** Delete
  `skills/brainstorming/` and the upstream-pin assertion fails naming
  `brainstorming`; rename an `imported:` key without touching the literal and it
  fails; rename both and the on-disk completeness equality fails. Restore after
  each. This is the proof the refactor did not become a subset assertion, and the
  one to run by hand rather than trust by reading.
- **An addition passes only when registered.** Create a throwaway
  `skills/zz-scratch/SKILL.md`, confirm the completeness equality fails; add it to
  `authored:` with a `tier`, `from: moe` and a >40-character `why`; confirm green;
  delete both.
- `toEqual` over the 27-name literal is present in the diff, with no `toContain`,
  `arrayContaining` or length-only comparison in its place, and the per-source SHA
  comments and "Enumerated from the pinned snapshots at import time" line intact.
- `chmod -x skills/systematic-debugging/find-polluter.sh` fails the test, and
  `chmod +x` on any file not in the allowlist also fails it from the new
  completeness direction. Restore both. `grep -c '\.py' packages/core/test/metadata.test.ts`
  returns 4 or more.
- **The closure rule is not vacuous.** Point a `**REQUIRED SUB-SKILL:**` at an
  everything-tier skill from inside a core-tier skill and confirm `:474` fails
  naming both. Restore. This is the check that the merged `tierOf` actually
  resolves; without it a `tiers.skills` left in place returns `undefined`, every
  skill is skipped and the test passes green with an empty loop.
- **The `from:` vocabulary is closed.** Set an `imported:` entry to `from: moe`
  and the per-map value-set assertion fails; set an `authored:` entry to
  `from: superpowers` and it fails. Both restore. `from: ''` still fails `:460`.
- `PARITY.md` contains an **Authored here** section naming `skill-tiers.yaml` →
  `authored:`, and the Map at `:24-44` is byte-identical.
- `LEAN_TIER_BUDGET` appears once as a definition with the ERR SMALL comment
  beside it, and `git grep -n 'toBe(13)' packages/core/` returns nothing.
