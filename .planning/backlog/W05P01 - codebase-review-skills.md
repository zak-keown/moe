---
slug: codebase-review-skills
title: Two Fork-Authored Skills For Repo-Wide Review And TDD Repair
idea: |
  - A codebase-wide adversarial review that writes CODEBASE-REVIEW.md, and a
    second skill that works the report off under TDD with atomic commits
status: backlog
base_sha: aad2aee
base_branch: main
size: L
estimate: 16-19 h
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

## Work breakdown

| Step | Effort |
|---|---|
| RED baselines — pressure scenarios for both skills, without the skills | 2-3 h |
| `reviewing-a-codebase` SKILL.md plus enumerate/shard/merge script | 5-6 h |
| `fixing-a-code-review` SKILL.md plus parse/bucket/stamp script | 4-5 h |
| `review-shard` and `verify-finding` agents | 1-1.5 h |
| `skill-tiers.yaml` entries, `metadata.test.ts` edits, `pnpm mint` | 1.5 h |
| GREEN and REFACTOR rounds until both hold under pressure | 2-3 h |

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
