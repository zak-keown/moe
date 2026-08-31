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
status: done
size: M
estimate: 5-6 h
depends_on: [DO-NOW-1, DO-NOW-2]  # both landed as of main a9f981d — satisfied
blocks: [deterministic-task-dag]
conflicts_with: [parallel-execution-option, gsd-core-skill-import, tiered-workflow-naming, native-renderers, deterministic-task-dag, runtime-pruning, verification-split-and-firing-rate]
touches:
  - packages/core/skill-tiers.yaml
  - packages/core/test/metadata.test.ts
  - packages/core/README.md
  - scripts/mint-plugins.mjs
  - PARITY.md
decision_needed: no
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

## Debate-review decisions (2026-08-31)

- **The `imported:` `from:` value set stays at five names.** PARITY.md is frozen
  at its current upstreams, so the sixth and seventh values this doc anticipates
  — from `gsd-core-skill-import` and `tc-governance-integration` — are not
  arriving as drift-tracked upstreams. Attribution rows may still be added under
  the freeze's carve-out; they do not become `from:` values without a decision.
- **A3's recommendation is unaffected and gets easier**, since the asserted value
  set is now stable rather than a moving target.
- **`authored:` stays `{}` for the moment.** The one new item this review created
  (`verification-split-and-firing-rate`) adds a hook and a section to an existing
  core skill — no new skill directory.
- Both items rewrite parts of `metadata.test.ts`, so they cannot share a wave.

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

**Re-based on `main` @ `a9f981d`.** DO-NOW-1 and DO-NOW-2 have both landed, and
DO-NOW-3 substantially has: `packages/core` is on `main`, `metadata.test.ts` is
690 lines (was 652 on the import branch), `plugins/` exists with six generated
plugins, and `moe-mint.yaml` has split into `mint/moe-core.yaml` +
`mint/moe-everything.yaml`. Every line number below is verified against `main`,
not the worktree. **The six assertions this item exists to change are all
unmodified** — the file grew below `:500` — so the problem is untouched even
though its surroundings moved.

One convention, taken from Zak's own commit `a9f981d` ("PARITY: cite the closure
test by name, because the refactor moves its line"): that commit de-referenced
`PARITY.md:89` from `metadata.test.ts:475` to the test's *name*, on the explicit
grounds that this branch moves it. **The diff should follow suit** — any prose
citing this file should name the `it(...)` rather than the line, since this item
is precisely the change that invalidates line numbers.

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

**`skill-tiers.yaml` now has three consumers, not one — corrected after the
re-base.** When I first wrote this, `metadata.test.ts:452` was the only code that
parsed it and DO-NOW-3 had not been built against the schema, which made the
restructure nearly free. That is no longer true. It is now read by
`metadata.test.ts:452` (used at `:457`, `:458`, `:469`, `:478` and the new `:511`),
by **`scripts/mint-plugins.mjs:123-135`**, which stages the two plugins by
filtering `Object.entries(parsed.skills ?? {})` on tier, and it is declared as a
turbo input at `turbo.json:26`. `mint/moe-core.yaml:25` and
`mint/moe-everything.yaml:5` name it in comments; `README.md:103,116,134,149,174`
describe it in prose. **The schema change therefore has a build script to update,
not just a test** — `scripts/mint-plugins.mjs` joins `touches`, and the "cheapest
moment" argument is spent. The `?? {}` at `:132` degrades to an empty map rather
than throwing, but `:135` (`if (names.size === 0) fail(...)`) catches it loudly.

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
(`writing-skills/SKILL.md:393` is correct on `main`. `moe-tone-and-branding`'s
unmerged branch inserts a section above it and shifts it to `:399`; whichever
merges second re-checks this line, which is the cost of citing a line number in a
file two items edit.)

**Provenance cannot live in frontmatter.** `:145` allows exactly `name`,
`description`, `allowed-tools`, `argument-hint` — the keys Claude Code recognises
on a skill. An `origin:` key fails that test *and* ships a non-standard key into
every generated plugin.

## Prerequisites

**Both are satisfied. This item is unblocked and is scheduled W01P01.**

**DO-NOW-1 — landed.** `packages/core` is on `main`; the merge conflict this
dependency existed to avoid cannot happen now.

**DO-NOW-2 — landed, and it vindicated the dependency.** I argued this dependency
was real for one specific reason: my recommendation pins an explicit lean-tier
count, and `skill-tiers.yaml`'s header called the split "a PROPOSAL awaiting human
review," so landing first would have meant pinning an undecided 13. That was
right, and for a sharper reason than I knew — the review did not merely ratify the
split, it **deleted ERR SMALL**, the rule my B1 recommendation cited as its
justification (see B1). Had this item landed first it would have shipped an
assertion whose stated rationale was deleted a day later. The split itself stands
(`skill-tiers.yaml:7-8`), the counts are still 13 and 14, and `LEAN_TIER_COUNT` now
pins a decision rather than a proposal.

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
`LEAN_TIER_COUNT`*. Same file, so `conflicts_with` either way.

**`moe-tone-and-branding` — does not block.** Explicit at `:145`: "Not
`skill-set-fidelity-refactor`, because this item adds no skill." Recommendation C
(`:171-180`) is a `house-voice.md` reference file, not a 28th skill. Its
`:148-150` correctly predicts the one consequence — it cited `:115` as the
automatic guard on "no 28th skill," which becomes "documented, not enforced."
Worth telling that doc: an unregistered skill still fails the completeness
equality and a registered one is an explicit two-line manifest diff, so the guard
is narrower than `toBe(27)` but better aimed.

One correction to that item's `touches`, found when its branch reported a red
suite. `house-voice.md` names the upstream project once, so it needs a
`["skills/writing-clearly-and-concisely/house-voice.md", ["superpowers"]]` row in
the provenance map at `metadata.test.ts:565-571` — verified: `superpowers` is the
only banned token in the file, and for a `.md` path `commentish()` at `:575`
returns true unconditionally, so one row exempts the whole file. **That row belongs
in that item's own branch, not this one.** A branch that turns the suite red fixes
it in the same branch; deferring it here would leave that branch red until this
unrelated refactor ships, and the entry has nothing to do with the two-list model.
So `moe-tone-and-branding` should add `packages/core/test/metadata.test.ts` to its
`touches` — which also makes its `conflicts_with` correct, since that is the file
this item rewrites.

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

**Part B was contingent on a pending decision. That decision has landed and Part B
survives.** The premise of the lean/full split was questioned — the resident cost
of all 27 name+description pairs is ~1,480 tokens against ~57,600 tokens of
on-demand bodies — and DO-NOW-2 resolved it on 2026-08-31: **the split stands, and
the ERR SMALL tiebreak was deleted** (`skill-tiers.yaml:7-8,24-42`). So `:457`,
`:460`, `:470` and `:474` all still exist and Part B is live work, with B1
re-derived on a justification that does not cite the deleted rule.

The separability is worth keeping anyway, because it is what let this doc absorb
that decision by editing one subsection instead of being rewritten.
`skill-tiers.yaml` is two files in one: a provenance registry (`from:` on all 27
entries) and a tiering table (`tier:` plus the `plugins:` block). Part A uses only
the first. If the split is ever revisited, Part B is deleted rather than rewritten
and `imported:`/`authored:`/`from:` stay exactly as Part A leaves them.

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
literal. And provenance is a named value, not a boolean, so admitting a new kind
of it later is one test edit plus a `PARITY.md` row rather than a schema change.
On that last point the debate review went further than I did and it improves the
recommendation: with PARITY.md frozen at its current upstreams, the value set is
**stable at five**, not a moving target, so the assertion is a pin rather than a
maintenance burden. A sixth value would now require a deliberate decision to
unfreeze — which is the right bar. `from: moe` is also what
`deterministic-task-dag:211` already assumes.

#### A4 — what else a Moe-original skill needs

**Frontmatter: nothing.** `:145` forbids it and Claude Code would not read it, so
provenance lives in the registry (A3), never in `SKILL.md`.

**`licenses/` entry: no.** `:662-673` is "one LICENSE per inbound license, as
NOTICE promises" — *inbound*. Fork-authored content has no inbound license and
does not change `package.json`'s `"MIT AND Apache-2.0"` (`:688`), which is a
statement about imported material, so the `licenses/` equality at `:668-673`
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

**My original argument here is void and I am replacing it, not patching it.** I
justified keeping `toBe(13)` as the enforcement arm of `skill-tiers.yaml`'s ERR
SMALL rule. **ERR SMALL was deleted on 2026-08-31** when DO-NOW-2 settled, and
deleted for exactly the reason it should have been: the premise was measured and
false. The file now says so at `skill-tiers.yaml:24-33` — the resident cost is
~1,480 tokens against ~57,600 tokens of on-demand bodies, "not a budget worth
curating against, and a rule that cites a cost it does not have will keep
producing demotions nobody can defend." Citing a deleted rule to justify an
assertion would be the same error one layer up.

**The replacement tiebreak points the other way.** TRIGGER COLLISION
(`skill-tiers.yaml:35-42`) sends the tie to `everything` only when a skill's
description claims a trigger a core-tier skill already claims; "absent a collision
the tie goes to `core`." So settled policy now expects the lean tier to *grow*,
and an exact count is a speed bump against the direction policy pushes.

**Recommendation, re-derived: keep the explicit number, on a different
justification, and rename it.** What the lean set is, now, is *an interface* — the
plugin ~20 people have permanently installed. Its membership should not change
without someone saying so. That argument survives ERR SMALL's deletion because it
never depended on token cost. So: one named constant `LEAN_TIER_COUNT` — not
`LEAN_TIER_BUDGET`, since "budget" is the cost framing that just proved false —
asserted with equality against `core.length` across both maps, with a comment
recording that it is expected to be bumped and why that is fine. Drop `:471`'s
proportional bound: it was cost-based too, and `authored:` growth would only
loosen it.

Note what already does the heavier work. The new `it("emits exactly the core tier
into the lean plugin, plus _shared")` at `:507-516` asserts `plugins/moe-core/skills`
equals the core-tier set plus `_shared`, and `:518-528` asserts the superset. Those
pin the *contents* of the installed set, which is strictly stronger than pinning
its cardinality. `LEAN_TIER_COUNT` is the review signal on top of them, not the
guard.

**This settles `parallel-execution-option` in its favour, and the file says so.**
`skill-tiers.yaml:32-33` records that "exactly one skill was demoted on this rule
alone; see `dispatching-parallel-agents`" — the very skill that slug wants
promoted to lean. Its 13 → 14 is now argued by the deletion of the rule that
demoted it, and under this shape the edit is one constant.

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
the five in-test readers of `tiers.skills`, this is the only one that fails
silently: `:457`/`:458` throw on `undefined`; `:469`'s filter yields an empty array
so `:470` fails loudly; and the new `:511` filter yields an empty array so `:515`
fails loudly with `expected` collapsed to `["_shared"]`. Outside the test,
`scripts/mint-plugins.mjs:132` has the same shape (`parsed.skills ?? {}`) and is
also loud, at `:135`. One silent failure out of six readers is exactly the one to
write a test for.

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
`README.md:103,116,134,149,174` prose sites the restructure makes wrong; and the
tier filter in `scripts/mint-plugins.mjs:123-135`, which must read both maps or
the plugin staging breaks.

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

**Both were already answered, and this item shipped on those answers.** Recorded here
because the questions below were written before the answers arrived and read as open.

1. **May a fork-authored skill take `tier: core`?** **No — decision D2: authored skills
   start at `everything` for now, regardless of how the lean/full review resolves the 27
   imported ones.** So the extra assertion offered below is the branch taken. It is
   recorded in `skill-tiers.yaml` and enforced in practice by the lean-count assertion
   (`LEAN_TIER_BUDGET`), which is worth knowing because the failure message names the
   lean tier rather than D2, and reversal is a one-constant edit.
2. **Does `PARITY.md` get the "Authored here" section?** **No — decision D3: leave
   `PARITY.md` a pure import record.** `skill-tiers.yaml`'s `authored:` map is therefore
   the only place fork-authored content is registered. The cost D3 accepts is real and
   worth restating: an auditor reading only the ledger concludes core is entirely
   imported. `authored:` being load-bearing for that is the mitigation.

**Merged to main 2026-08-31** as a `--no-ff` merge after a clean trial merge and a full
gate run. Its own best find was unasked-for: the execute-bit allowlist had drifted by
four `.py` files and structurally could not notice, being checked in one direction only.

*The original questions, kept as written:*

1. **May a fork-authored skill take `tier: core`? — largely answered already;
   confirm and I will drop it.** I asked this as the ERR SMALL trade-off applied to
   authored content. DO-NOW-2 has since deleted ERR SMALL and replaced it with
   TRIGGER COLLISION, whose stated default is "absent a collision the tie goes to
   `core`" (`skill-tiers.yaml:35-42`). Read straight, that answers it: a
   fork-authored skill is eligible for `core` and is judged by the same trigger
   test as an imported one, with no provenance-based penalty. The only thing left
   for you is whether you *intended* that rule to govern content the fork authored
   as well as content it inherited. If yes, no assertion is needed and the `why:`
   requirement carries the argument. If authored skills should start in
   `everything` regardless, that is one extra assertion and I will add it.

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
| Two-map read in `scripts/mint-plugins.mjs:123-135` | 20 min | added after the re-base; `?? {}` must not become the fallback |
| `PARITY.md` section + five `README.md` prose sites | 40 min | |
| `pnpm --filter @bubstack/moe-core test`, the three sibling scripts, and `pnpm mint` | 30 min | `plugins/` must regenerate identically |

**Total 5-6 h**, up from 4-5 after the re-base added the staging-script change and
the `pnpm mint` regeneration check. Slower if: `moe-tone-and-branding` merges first
and `writing-skills/SKILL.md`'s REQUIRED line has to be re-found (minutes, but
it is a re-verification of the all-resolve claim). Add 20 min if open question 1
comes back "authored skills start in `everything`." Add 30 min and a second parse
if a reviewer wants `imported:` in a separate file after all.

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
- `LEAN_TIER_COUNT` appears once as a definition, and
  `git grep -n 'toBe(13)' packages/core/` returns nothing. `git grep -n 'ERR SMALL'`
  finds it only in `skill-tiers.yaml`'s record of its own deletion — the diff must
  not reintroduce the phrase as a live rationale.
- `pnpm mint` regenerates `plugins/moe-core` and `plugins/moe-everything`
  byte-identically, and `it("emits exactly the core tier into the lean plugin, plus
  _shared")` passes — proof the staging script was updated for the two-map schema
  rather than silently falling back to `?? {}`.
