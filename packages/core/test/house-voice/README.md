# Does the house-voice pointer change the output?

Measure a skill edit instead of asserting it. `writing-skills/SKILL.md`'s Iron
Law binds EDITS to existing skills, not only new ones, and the edit under test is
three lines added to `writing-clearly-and-concisely/SKILL.md` pointing at
`house-voice.md`. This directory is that measurement: two arms, three runs each,
both arms' raw output committed, and a mechanical scorer.

**Status:** baseline arm run 2026-08-31, 3 runs, mean 2.33/5 on the
house-specific rubric. The with-pointer arm is NOT run yet, and
`house-voice.test.ts` deliberately carries no discrimination assertion in this
commit — writing the file against failures you have actually seen is the whole
point of doing this half first.

## What is being measured, and what is not

This measures whether the pointer changes the OUTPUT. It does not measure whether
`writing-clearly-and-concisely` FIRES in the first place — an agent that never
loads the skill is unaffected by anything written inside it. Firing rate is a
different question with a different owner: `verification-split-and-firing-rate`
Part C builds a per-session `Skill`-invocation counter, and that counter is the
instrument for the flip condition recorded in `house-voice.md`. Do not read a
green run here as evidence about firing.

`house-voice.test.ts` verifies two things and no more: that the scorer separates
the two hand-written fixtures, and that the committed arms still score what they
scored. The `.md` files in `baseline/` and `with-pointer/` are captured data, not
fixtures anyone tuned.

## Procedure

Each run is a fresh `claude -p` session whose working directory contains ONLY the
payload. That matters more than any instruction in the prompt: the scenario says
"you may not read any other package's README", and a directory with no other
package READMEs in it means the agent cannot, rather than being asked not to. The
single biggest way this experiment goes vacuous is an agent recovering the house
shape by copying a sibling file, and isolation is what rules that out. Between
runs the directory is reset, so run 2 cannot read run 1's output either.

The prompt is identical in both arms. Only the payload differs.

| | Arm A — baseline | Arm B — with pointer |
|---|---|---|
| `writing-clearly-and-concisely/SKILL.md` | as it stood before this item (2650 bytes) | with the `**The house voice.**` paragraph |
| `writing-clearly-and-concisely/elements-of-style.md` | present | present |
| `writing-clearly-and-concisely/house-voice.md` | absent | present |
| Runs | 3 (`baseline/01-03.md`) | 3 (`with-pointer/01-03.md`), pending |

`scenario.md` is the task: write `packages/relay/README.md` for a package that
does not exist, from a flat list of facts. The facts are deliberately given as
raw bullets — a package name, a bin, a transport, counts of passing and skipped
tests, an upstream repo and licence, a plugin-generation note, a schema version,
and one dependency edge the team assumed and got wrong. No bullet suggests a
document shape, so every structural move in the output came from the payload or
from the model's own habits.

## The rubric, and why it is split

`score.mjs` scores two groups separately, and only one of them is evidence.

**Strunk-reachable** (no hedging adverbs, no passive opening). Both arms hold
`elements-of-style.md`, so both should pass. The baseline arm did: 2/2 in all
three runs. Folding these into the comparison would credit the pointer with work
the 1918 text did.

**House-specific** (the five discriminators). These encode facts about this repo
in 2026 that Strunk cannot supply: a bare verb-phrase verdict as the opening
line, a `**Status:**` line carrying a number, an explicit plugin-or-not
declaration, a refutation or non-completion named out loud, and no newly coined
tavern measure.

Every detector is a proxy, and `verdict-opening` is the loosest — there is no
regex for "verb phrase", so it is scored as the absence of the noun-phrase and
copular openings generic technical writing reaches for, plus a 12-word ceiling.
`fixtures/house-shaped.md` and `fixtures/generic.md` exist to show each detector
firing in both directions (5/5 and 0/5). They verify the instrument, not the
voice, and a green fixture assertion says nothing about any agent.

## RED: the baseline, without the pointer

| Run | house-specific | verdict | counted status | plugin-or-not | refutation | closed vocab |
|---|---|---|---|---|---|---|
| `baseline/01.md` | **3/5** | pass | FAIL | FAIL | pass | pass |
| `baseline/02.md` | **1/5** | FAIL | FAIL | FAIL | FAIL | pass |
| `baseline/03.md` | **3/5** | pass | FAIL | FAIL | pass | pass |

Mean 2.33/5. The important column is not the mean but the unanimity: **two
detectors failed in 3 of 3 runs.**

**No baseline run produced a `**Status:**` line at all.** All three had the
numbers — the scenario hands them "214 passing across 19 suites" and "8 tests in
2 suites skip themselves" — and all three spent them in a prose `## Tests`
section near the bottom instead:

> `baseline/01.md`: "214 tests pass across 19 suites. A further 8 tests in 2
> suites skip themselves when no local `redis` is running; start redis to
> exercise them."

That is decent writing. It is also unfindable: a reader auditing nine packages
for what is done cannot scan for it, which is the entire job the `**Status:**`
convention exists to do.

**No baseline run made the plugin declaration a top-line claim.** Two buried it
under a `## Plugin generation` heading 22 lines down, in the category-description
form the house avoids:

> `baseline/01.md:24` and `baseline/03.md:27`: "This package ships as a plugin."

`baseline/02.md` was the weakest run and the most instructive, because it failed
in the ordinary way rather than an exotic one. It opened by naming its subject
and then describing it:

> "`@bubstack/moe-relay` forwards lifecycle events between coding-agent
> sessions. A controller session learns that a worker session finished the moment
> the relay delivers the event…"

and it dropped the refuted dependency edge entirely — the one fact in the
scenario explicitly flagged as something the team got wrong. A README that omits
the correction is the exact failure the house habit of naming refutations out
loud is there to prevent.

`closed-vocabulary` passed 3/3. It is a real house rule, but nothing in this
scenario pressures an agent to coin a fifth tavern measure, so it carries no
signal here. It is kept as a regression guard, not as evidence.

`house-voice.md` is written against these observed failures, in this order of
priority: the counted `**Status:**` line and the plugin-or-not declaration first,
because those are the two the baseline never reached.

## GREEN: with the pointer

Not run yet. `with-pointer/` is empty and `house-voice.test.ts` carries no
discrimination assertion, on purpose: this commit is the failing-test-first half.
The next commit adds `house-voice.md`, the SKILL.md pointer, the second arm and
the assertion that the arms differ.

If the arms turn out NOT to differ, the negative result stays committed and
`house-voice.md` records the pointer as unverified as an output change. That is a
real finding about Recommendation C, and loosening the rubric until it passes
would destroy it.
