# Does the house-voice pointer change the output?

Measure a skill edit instead of asserting it. `writing-skills/SKILL.md`'s Iron
Law binds EDITS to existing skills, not only new ones, and the edit under test is
three lines added to `writing-clearly-and-concisely/SKILL.md` pointing at
`house-voice.md`. This directory is that measurement: two arms, three runs each,
both arms' raw output committed, and a mechanical scorer.

**Status:** both arms run 2026-08-31, 3 runs each. Baseline mean 2.33/5 on the
house-specific rubric, with-pointer mean 5.00/5. The two detectors that failed in
3/3 baseline runs pass in 3/3 with-pointer runs. `house-voice.test.ts` pins those
numbers, and the discrimination assertion was falsified once by hand to prove it
can go red.

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
| Runs | 3 (`baseline/01-03.md`) | 3 (`with-pointer/01-03.md`) |

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
`elements-of-style.md`, so both should pass. Both did: 2/2 in all six runs.
Folding these into the comparison would credit the pointer with work the 1918 text
did, so the discrimination assertion excludes them.

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

`closed-vocabulary` passed 3/3 in both arms. It is a real house rule, but nothing
in this scenario pressures an agent to coin a fifth tavern measure, so it carries
no signal. It is kept as a regression guard, not as evidence.

`house-voice.md` was then written against these observed failures, and its list of
README moves is ordered by them: the counted `**Status:**` line first, the
plugin-or-not declaration second, because those are the two the baseline never
reached. The SKILL.md pointer names those same two explicitly rather than saying
"see also".

## GREEN: with the pointer

| Run | house-specific | verdict | counted status | plugin-or-not | refutation | closed vocab |
|---|---|---|---|---|---|---|
| `with-pointer/01.md` | **5/5** | pass | pass | pass | pass | pass |
| `with-pointer/02.md` | **5/5** | pass | pass | pass | pass | pass |
| `with-pointer/03.md` | **5/5** | pass | pass | pass | pass | pass |

Mean 5.00/5 against the baseline's 2.33/5. Both detectors that failed 3/3 in the
baseline pass 3/3 here:

> `with-pointer/02.md`: "**Status:** imported, complete. 214 tests passing across
> 19 suites; 8 more in 2 suites skip themselves without a local `redis`. Nothing
> was left out."

> `with-pointer/01.md`: "Ships as the **`moe-relay`** plugin. `@bubstack/moe-mint`
> generates it into `/plugins/moe-relay`… never hand-edit the generated manifest."

All three also promoted the refuted edge from a fact in a list to a named
finding, which the weakest baseline run dropped entirely:

> `with-pointer/01.md:25`: "**`relay → tab` is REFUTED.** … We were wrong going
> in, and this line exists so the next reader stops where we did."

`with-pointer/02.md` went further and gave it its own heading,
`## `relay → tab` is REFUTED`.

Strunk-reachable stayed 2/2 in all three, as designed.

### The assertion was falsified once, on purpose

A discrimination test that cannot fail is the vacuous case. `with-pointer/01.md`
was temporarily replaced with `baseline/02.md` and the suite went from 1 failure
to 4: the strict-inequality assertion, the 4/5 floor, and the
two-moves assertion all went red together. Then it was restored. The one
remaining failure is unrelated and expected — see below.

## Honest limits

- **n=3 per arm.** Enough to show that a 0/3-to-3/3 flip on two detectors is not
  one lucky sample; not enough for a confidence interval. Nobody should quote
  5.00 as a precision figure.
- **`house-voice.md` contains exemplar lines whose shape is close to this
  scenario's facts** — its `**Status:**` example is crew's "397 tests passing
  across 38 suites; 12 more in 3 suites skip themselves without a local `tmux`",
  and the scenario supplies 214/19 and 8/2. So part of the measured effect is an
  agent copying a worked example, which is what a style guide is FOR, but it is
  not the same as internalising a principle. A scenario whose facts did not fit
  the exemplar would be a stronger test and is not what was run.
- **One scenario, one document type.** The skill's description claims "ANY prose
  humans will read". Merge-request descriptions and commit messages are untested.
- **The scorer rewards form.** A `**Status:**` line with a number in it that says
  nothing useful would pass. It measures whether the moves were made, not whether
  they were made well — the prose quotes are here so a reader can judge that.
- **`with-pointer/03.md` wrapped its answer** in a preamble ("Written to
  `packages/relay/README.md` (374 words). Here is the content:") and a closing
  note about declining to invent CLI flags. Committed verbatim as captured; the
  scorer anchors on the first `#` heading, so the wrapper does not affect the
  score.
- **`verdict-opening` is the loosest detector** and the baseline reached it 2/3.
  It is the weakest column in the table. The strong result is the two columns that
  went 0/3 to 3/3.

## A note on the one failing assertion

`packages/core/test/metadata.test.ts` sweeps every file under `skills/` for
upstream brand tokens, and `house-voice.md` names the upstream project once, in
its provenance section, because a file whose rule is "provenance names survive a
rebrand" cannot credibly dodge the one name that proves it. That file's
per-file exemption map is owned by `skill-set-fidelity-refactor`, which adds the
entry pre-emptively. Until those branches meet, this package's suite shows exactly
one failure:

```
FAIL test/metadata.test.ts > the rebrand > carries no upstream brand token
  offenders: ["skills/writing-clearly-and-concisely/house-voice.md: superpowers"]
```

Not worked around here. Weakening that assertion to make a suite green would cost
more than the red line does.

## Re-running

`score.mjs` is standalone:

```
node packages/core/test/house-voice/score.mjs packages/core/test/house-voice/baseline/01.md
node packages/core/test/house-voice/score.mjs --json <file.md>
```

To re-run an arm, build a directory holding only `scenario.md` and the payload
copy of `writing-clearly-and-concisely/`, then run a fresh session with its cwd
there, resetting the directory between runs. If the numbers move, change the
recorded values in `house-voice.test.ts` in the same commit and say what changed —
a stale pinned number is worse than no number.
