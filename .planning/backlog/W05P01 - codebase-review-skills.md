---
slug: codebase-review-skills
title: Two Fork-Authored Skills For Repo-Wide Review And TDD Repair
idea: |
  - A codebase-wide adversarial review that writes CODEBASE-REVIEW.md, and a
    second skill that works the report off under TDD with atomic commits
status: done
base_sha: fcc87c5
base_branch: main
size: L
estimate: 10-13 h
depends_on: []
blocks: []
conflicts_with: []
touches:
  - packages/core/skills/reviewing-a-codebase/
  - packages/core/skills/fixing-a-code-review/
  - packages/core/agents/
  - packages/core/skill-tiers.yaml
  - packages/core/test/metadata.test.ts
decision_needed: no
---

# Two Fork-Authored Skills For Repo-Wide Review And TDD Repair

## Completion repair (2026-09-01)

The two skills and their agents were already present, but the completion audit
found that their scripts lacked direct behavioral regression coverage. The
"codebase review scripts behavior" suite now exercises all three CLIs: shallow
scope always retains credential-bearing paths, shard size is a positive safe
integer, merge fails on malformed findings while preserving deterministic
severity/IDs/nonfinding sections, and disposition stamping validates and
recomputes the report without duplicate mutation. Twenty-one cases pass against
temporary repositories and reports.
A live shallow review subsequently dispatched 19 shard agents against one
recorded base and opened all 407 selected files. The raw merge produced 100
findings. An explicit adequate-verification wave challenged the first eight
critical/high IDs and confirmed all eight; Zak deferred the remaining 28 until
after the current deployment march. That run exposed and repaired unsafe
symlink handling, generated-plugin duplication, missing shard provenance,
line-number citations, fieldless-heading omission, and a bare flag that could
claim `verified: true` without verdict evidence. The complete live challenger
set remains an acceptance event. See
`.planning/codebase-review-adequate-verification-2026-09-01.md`.

## The idea

> A codebase-wide adversarial review that writes `CODEBASE-REVIEW.md`, and a
> second skill that works the report off under TDD with atomic commits.

Two skills, both everything-only under D2:

- **`reviewing-a-codebase`** — takes `--depth shallow|medium|deep` (default
  `medium`) and `--verify`. Enumerates and shards the tree, dispatches reviewer
  subagents, merges shard reports into one `CODEBASE-REVIEW.md` in the project
  root, grouped by severity.
- **`fixing-a-code-review`** — no flags. Reads `CODEBASE-REVIEW.md`, buckets
  findings into waves, and repairs each one RED → GREEN → REFACTOR with one
  atomic commit per finding, stamping dispositions back into the report so
  re-runs are idempotent.

## Settled decisions

All *Decided 2026-09-01, Zak Keown.*

- **Repo naming convention wins over the `moe-` prefix.** The directories are
  `reviewing-a-codebase` and `fixing-a-code-review`. Every one of the 33 skills
  in this tree is unprefixed and verb-first, and `metadata.test.ts` asserts
  frontmatter `name` equals the directory name.
- **Read the prior art, then write fresh.** `~/.claude/moe-core/` — a different
  project, per the three-Moes rule — ships `workflows/full-codebase-review.md`
  (22 K), `workflows/fix-codebase-review.md` (18 K) and
  `~/.claude/agents/moe-codebase-tdd-fixer.md`. Mine the design; do not port the
  text. Porting would import a `moe-tools.cjs` launcher idiom this repo does not
  have and would owe `PARITY.md` a row for a new upstream. Authoring owes it
  nothing.
- **`--depth` varies both the file set and the review lenses.** Not one or the
  other.
- **`CODEBASE-REVIEW.md` lands in the root of the repo the skill is run in.**
  Not `.planning/`, which is where the prior art put it.
- **The flag stays `--depth`, disambiguated in prose.** See "The depth axis"
  below for the wording it owes and why no guard was added.
- **Two agents ship, and the lean-plugin leak is accepted.** See "The two
  agents, and the leak".
- **The severity ladder is critical / high / medium / low.** `--verify` covers
  critical and high.
- **Each skill owns its own `scripts/`.** Coupled only through the documented
  `CODEBASE-REVIEW.md` format, never through a shared module.

## What the prior art is worth taking

Design, not prose. Seven mechanisms that were already debugged there:

| Mechanism | Why it is worth keeping |
|---|---|
| Stable finding IDs assigned at merge, severity-ordered | The fix skill addresses findings by ID; shard-local IDs collide |
| `disposition` / `commit` / `resolved_at` stamped per finding | The only thing that makes a re-run idempotent instead of duplicative |
| "Confirm the defect is still real before fixing" | Code drifts between review and repair; a stale finding must skip, not fail |
| RED must fail *for the right reason* | A compile error is not a red test, and this is the most common way TDD gets faked |
| Revert both source and test when GREEN never arrives | Otherwise a failed repair leaves a dirty tree that poisons the next finding |
| One commit per finding, never bundled | A bundled commit is unreviewable and hides which fix caused a regression |
| Per-wave results written after *every* finding | A crashed wave still leaves a partial record to recover from |

Deliberately left behind: the `moe_run` shim, `config-get` knobs (this repo has
no config system), `.planning/reviews/` output paths, and the XML workflow
idiom. This repo ships skills, not workflows.

## Repo constraints the skills must satisfy

Discovered by reading the guards, not by guessing. Each one is a red test if
missed.

1. **Iron Law.** `writing-skills` binds new skills *and edits*: run the pressure
   scenario without the skill, record the rationalizations verbatim, then write.
   Baselines come first, and they are the reason this item is L not M.
2. **Descriptions carry triggers only.** A description that summarizes the
   workflow gets followed *instead of* the body — the documented failure is an
   agent doing one review where the skill specified two. So `--depth` and
   `--verify` appear nowhere in either description.
3. **The word `tier` is banned in new skill prose.** `metadata.test.ts`
   "does not name the workflow depth 'tier'" allowlists eight paths and flags
   `\btiers?\b` everywhere else. Neither new SKILL.md may say it, including
   about its own packaging.
4. **Parallel dispatch owes a sequential fallback.** Both skills dispatch in
   parallel, so both go into the `parallelDispatchers` array in
   `metadata.test.ts` and both must name the fallback or point at
   `_shared/parallel-adversarial-review.md`.
5. **Any shipped executable owes an `X_BIT_ALLOWLIST` entry.** Both directions
   are asserted — a lost bit and an unreviewed arrival.

Plus the routine ones: `${CLAUDE_PLUGIN_ROOT}/skills/<skill>/...` for every
owned path, bare backticked skill names in cross-references (no `plugin:skill`,
no `@`), every backticked token on a REQUIRED line must resolve, and
`/plugins/` is regenerated by `pnpm mint` and never hand-edited.

## The depth axis

| | files | lenses | model |
|---|---|---|---|
| `shallow` | entrypoints plus git-hot files | correctness, security | Sonnet |
| `medium` (default) | all tracked source after exclusions | plus tests, error handling, API contracts | Sonnet |
| `deep` | plus tests, config, scripts, infra | plus performance, coupling, dependency risk | **Opus** |

Only `deep` escalates. `shallow` is cheaper by scope, not by model — Haiku is
a retrieval model in this repo (both shipped agents), not a judgment one.

**This is the second meaning of "depth" in the library, and it ships anyway.**
`brainstorming` defines the workflow depth axis as patch / change / feature, and
`metadata.test.ts` "names all three depths in every depth-guarded skill" pins it
across four skills. Nothing bans a second sense of the word, and the flag name
the user asked for is worth more than a closed vocabulary here, because the two
axes never appear in the same sentence: one classifies a unit of work before
planning it, the other sizes a review after the work exists.

The mitigation is prose, not a guard. `reviewing-a-codebase` carries an explicit
line naming the other axis and saying this is not it. **No test was added**, and
that is a deliberate asymmetry with the `tier` ban — a guard here would have to
allowlist by file, which is what the `tier` guard does, and it earns that cost
only because `tier` had three live meanings before the fourth arrived. `depth`
has one.

The residual risk is real and worth writing down: prose discipline decays where
a test does not. If a third sense of `depth` ever appears, that is the moment to
add the guard, not now.

## The two agents, and the leak

`packages/core/agents/` gains two files:

| Agent | `model:` | `tools:` | Job |
|---|---|---|---|
| `review-shard` | `sonnet` | Read, Write, Grep, Glob, Bash | Reviews one shard's file list at the requested lenses, writes that shard's report |
| `verify-finding` | `sonnet` | Read, Grep, Glob, Bash | Tries to **refute** one critical or high finding, returns a verdict. Writes nothing |

`metadata.test.ts` "declares a model and a tools allowlist" makes both fields
mandatory, so `model:` is a **default, not a ceiling**. `--depth deep` overrides
it to Opus on the dispatch call; `shallow` and `medium` take the frontmatter
value. That is the whole escalation mechanism — a skill cannot select its own
model, only a dispatch can.

**The leak, accepted deliberately.** `agents/` is not filtered by skill tier:
`plugins/moe-core/agents/` and `plugins/moe-everything/agents/` hold identical
files today, and `pnpm mint` will put both new agents into the lean plugin too —
where neither owning skill exists. Roughly 150 resident tokens of orphan
description for every lean-plugin user, bought in exchange for a real tools
allowlist and a stable dispatch name.

This must be recorded where the next reader finds it. Two orphan agents in the
lean plugin read as a packaging bug to anyone who has not seen this decision,
and the correct response to finding them is *not* to delete them. Note it in
both agents' bodies and in the `skill-tiers.yaml` `why:` for both skills.

`metadata.test.ts` "emits every agent into the full plugin" compares
`plugins/moe-everything/agents` against `packages/core/agents` and stays green
on its own once `pnpm mint` runs. Nothing asserts the lean plugin's agent list,
which is exactly why the leak is invisible without this paragraph.

## `--verify`, and why it is a flag

`_shared/parallel-adversarial-review.md` already owns the adversarial pattern:
two blind reviewers, competitive wrapper, severity disagreement resolved to the
worse reading, mandatory single-agent fallback. `--verify` reuses it, adapted —
`verify-finding`'s job is to *refute* an existing critical or high finding, not
to re-review the file.

PAR says it is always-on with no opt-out. That rule is scoped to the
iterative-development cluster's gates, so a flag here is not a violation — but
the skill must say so in as many words, or the next reader will read it as one.

## The report format

Four severity groups, in this order, each finding carrying a stable ID assigned
at merge:

```
## Critical   ← --verify sends these to verify-finding
## High       ← --verify sends these to verify-finding
## Medium
## Low
```

`--verify` cuts cleanly at the top two, which is what picked this ladder over
the prior art's critical / warning / info: that one has no `high` at all, so the
flag would have had no boundary to name.

The format is the contract between the two skills, and the **only** coupling
between them. `reviewing-a-codebase` emits it; `fixing-a-code-review` parses it
and stamps `disposition`, `commit` and `resolved_at` back into each finding.
Both own their own `scripts/` and neither reads the other's — a shared module
across skill directories has a precedent (`scoping-the-simplest-core` reads a
template out of `running-an-iteration`'s directory) and `skill-tiers.yaml`
records what that precedent cost, in as many words: "the two cannot be split."
A duplicated parser is the cheaper failure.

## What the RED baselines actually showed

11 runs at `47f0733`-`fcc87c5`, four scenarios, recorded in
`red-baselines/NOTES.md`. **9 of 9 discipline runs chose the disciplined
option.** That is not a soft result — it replicated across two scenarios for the
fix skill and three runs for the review skill, and the method is explicit about
what it means: *if the control does not exhibit the failure, do not author the
guidance.*

### Do not write these

- **The TDD-discipline half of `fixing-a-code-review`.** B3 3/3 chose
  test-first under time, authority, sunk-cost and exhaustion pressure combined.
  All three read "don't gold-plate" as a limit on scope, not on verification.
  Two independently rejected `startsWith(TEMPLATE_ROOT)` for the sibling-
  directory hole neither the review nor the scenario mentioned.
- **The bundling and stale-finding prohibitions.** B4 3/3 verified each finding
  against current code before touching it, committed one finding per commit, and
  recorded the stale one rather than dropping it. Their arguments were better
  than the scenario's: *"a directory is a unit of filesystem layout, not a unit
  of change"*; option C *"reaches the right verdict by luck — a refactor can
  carry a bug to a new line just as easily as delete it."*
- **A coverage-honesty prohibition for `reviewing-a-codebase`.** B2 3/3 refused
  to write up findings the scenario stipulated but they had not made, on their
  own initiative. *"Honest about the denominator, fabricated in the numerator"*
  is the failure they named and declined.

A rationalization table against any of these would be inventing a failure to
counter. `writing-skills` warns that prohibitions actively backfire on
shaping problems, and every failure that DID reproduce is a shaping problem.

### Do write these — the format contract, and only it

Both B1 controls produced, unprompted and without guidance: severity labels, a
summary table, per-finding file and line, a suggested order of work, retracted
findings kept with their reasons, and a "checked and found sound" section
naming what was examined and clean. **None of that needs specifying.**

What neither control produced, 2 for 2:

| Element | Both controls | Consequence |
|---|---|---|
| Stable prefixed finding IDs | absent — `### 1.`, `## 2.` positional integers | the fix skill addresses findings by ID; renumbering breaks every reference. Run 2 also collapsed four findings into one `## 12-15. Smaller items` heading, making them unaddressable |
| Frontmatter | absent | nothing to parse counts, status or disposition from |
| Coverage statement inside the report | absent — both put it in a separate file | the report travels alone |
| A fixed severity ladder | invented per run — run 1 grouped under `## High`, run 2 suffixed `- High` per heading, neither had a Critical bucket while filing credential capture as High | two runs, two shapes |
| A defined denominator | invented per run — 874, 935, 943 source files across three runs, against the 903 in my own prompt | a coverage ratio with an undefined denominator is decorative |

And from B4, the same class of failure on the other side: three disciplined
agents wrote the disposition three different ways (`**Status:**`,
`**Resolution:**`, `**Status: STALE**`), one touched frontmatter and two did
not, and none emitted a per-finding `commit:` field. A second fix run over any
of those reports could not mechanically tell what had been done.

`writing-skills` "Match the Form to the Failure" names the instrument for all of
it: **"omits a required element from something they already produce ->
structural: REQUIRED field or slot in the template they fill in"**, and warns
that prose reminders near the template are the wrong form. So both skills are
now mostly a filled-in template plus a script, not a discipline document.

### Still untested

`--verify` was not exercised by any baseline. Its value is an open question, not
a settled one, and the GREEN phase should cover it.

## Work breakdown

Revised after the RED baselines. The prose halves came down; the mechanical
halves did not move.

| Step | Effort | Change |
|---|---|---|
| ~~RED baselines~~ | ~~2-3 h~~ **done** | 11 runs, results in the section above |
| `reviewing-a-codebase` SKILL.md plus enumerate/shard/merge script | 4-5 h | was 5-6 h; the body is a short format contract now, not a discipline document |
| `fixing-a-code-review` SKILL.md plus parse/bucket/stamp script | 3-4 h | was 4-5 h; same reason |
| `review-shard` and `verify-finding` agents | 1-1.5 h | unchanged |
| `skill-tiers.yaml` entries, `metadata.test.ts` edits, `pnpm mint` | 1.5 h | unchanged |
| GREEN verification against the same 4 scenarios | 1 h | was 2-3 h; only the format assertions need re-running, and they are checkable by script |

## Root changes needed

- `packages/core/agents/` — `review-shard.md` and `verify-finding.md`, each with
  `model:` and `tools:` frontmatter and a note recording the accepted leak.
- `packages/core/skill-tiers.yaml` — two `authored:` entries, `tier: everything`,
  `from: moe`, each with a `why:` that earns its place and names the leak.
  `LEAN_TIER_COUNT` stays at 13; D2 already makes fork-authored skills
  everything-only, so no policy conversation is owed.
- `packages/core/test/metadata.test.ts` — both skill names into
  `parallelDispatchers`, plus `X_BIT_ALLOWLIST` entries for both skills'
  scripts.
- `pnpm mint` then `pnpm mint:check`. Never hand-edit `/plugins/`.
- `PARITY.md` — **no change.** Authored, not imported; there is no upstream to
  name. This is what the write-fresh decision bought.

## Follow-ups

- **Tier-filtering `agents/` in mint** is the real fix for the leak this item
  accepts. Until it exists, every everything-only skill that ships an agent pays
  the lean plugin the same tax.
- If `--verify` proves valuable enough to be always-on, that is a PAR
  conversation, not a flag deletion.
- If a third sense of `depth` ever appears in skill prose, add the guard then.
- The baseline fixture's CR-001 names a payload that does not demonstrate the
  traversal (`../../secrets.env` throws ENOENT; `../secrets.env` is the one that
  leaks). Fix the text before any GREEN re-run, and keep the trap on purpose —
  three of three runs caught it only by running the test before the fix existed,
  which is the single best demonstration of RED-for-the-right-reason in the set.
