# The House Voice

Strunk tells you how to write a clear sentence. This file records the moves this
repo already makes, so the tenth document does not regress to the mean — a
transcription, not an invention: the nine package READMEs were consistent before
anyone wrote this down. Cite cross-package examples as backticked paths, never as
markdown links; a relative link out of this directory is dead inside the
generated plugin.

## The README shape

Five moves. The first two are the ones a subagent skips unless told — measured,
not guessed: `packages/core/test/house-voice/README.md`.

1. **A counted `**Status:**` line**, saying what is done and what is NOT.
   `packages/crew/README.md:12` — "397 tests passing across 38 suites; 12 more
   in 3 suites skip themselves without a local `tmux`."
   `packages/flight/README.md:9` — "**Status:** half imported." The same numbers
   spent in prose at the bottom do not count; a reader auditing nine packages
   scans for this line.
2. **A plugin-or-not declaration, near the top.**
   `packages/glass/README.md:6` — "Ships as the **`moe-glass`** plugin… Never
   hand-edit the generated manifest." Or `packages/mint/README.md:8` — "Not a
   plugin." Say which; nobody should have to infer it.
3. **A bare verb-phrase verdict as the opening line.**
   `packages/tab/README.md:3` — "Price an agent transcript. What the run cost
   you." Not "This package is a tool for…". What it does to what, in under a
   dozen words.
4. **Refutations named out loud.** `ARCHITECTURE.md` §5 logs three, as
   "**`proof → tab` is REFUTED.**" A belief the work disproved is a finding;
   delete it and the next reader re-derives it.
5. **Attribution reconciled out loud**, not resolved silently — see
   `py/proof/README.md:24`: two true attribution facts, stated as two facts.

Lineage sections and "Status: imported" are import-ledger moves, aimed at one
reader auditing one import, and they become historical furniture once it is done.
Transcribe the register; do not mistake it for a persona.

## The tavern vocabulary is closed

`ARCHITECTURE.md` §7 names exactly four measures: `tab`, `flight`, `proof`,
`glass`. `core`, `backstory`, `memory`, `mint` and `crew` are plain descriptions,
not measures. **No new measure gets coined.** The list is closed because `moe
flight`, `moe tab`, `moe proof`, `moe glass` reads as ordering at a bar, which
turns "Just ask Moe." from decoration into a literal description of the CLI; a
fifth half-metaphor costs that and buys a synonym.

## The no-no list — words and patterns to cut

Part of this list is already mechanized, and this section transcribes it rather
than inventing it. `packages/core/test/house-voice/score.mjs` scores package
READMEs and FAILS the ones below; when the prose here and that scorer disagree,
the scorer wins and this section is wrong — fix it. The scorer runs on READMEs,
but the same cuts apply to every doc a human reads. Cite examples as backticked
paths, never as markdown links (a relative link is dead inside the generated
plugin).

**Hedging adverbs — cut, do not soften.** The `HEDGES` set: *probably, arguably,
fairly, quite, somewhat, generally, basically, essentially, simply, actually,
really, very.* A hedge is a claim you have not measured; measure it or drop it.
This is Strunk Rule 11 (positive form) and Rule 13 (omit needless words) made
concrete.

**Category-description openers — say what it does, not what it is.** The
`verdict-opening` detector fails an opening line that leads with a noun-phrase
opener (*This, That, A, An, The, It, There*) or a copular / permission-granting
construction — the `COPULAR` set: *is a, are a, provides, allows, enables,
offers, serves as, acts as, is designed to, is intended to, is responsible for.*
Open on a bare verb-phrase verdict instead: `packages/tab/README.md` — "Price an
agent transcript."

**No coined tavern measure.** Enforced by the `closed-vocabulary` detector; the
`COINED_MEASURE` set is the ban list. See "The tavern vocabulary is closed"
above — the four measures are `tab`, `flight`, `proof`, `glass`, and nothing
else is one.

**AI-tell filler — not yet mechanized, cut on sight.** *delve, seamless,
seamlessly, robust, powerful, cutting-edge, in the realm of, it is worth noting,
needless to say, at the end of the day*; *in order to* (write "to"); *utilize*
(write "use"). They pad without adding a fact.

**One deliberate exception — the architecture glossary.** `codebase-design` and
`improve-architecture` MANDATE a fixed vocabulary in architecture prose —
*module, interface, depth, seam, adapter, leverage, locality* — and use those
terms exactly. `leverage` there is a required term, not filler; do not cut it in
that context. This no-no list governs general product prose, and the
architecture glossary overrides it inside architecture writing.

## The name policy

This repo is `@bubstack/moe` and owns the bare `moe` binary. `moe <thing>` is the
dispatcher; `moe-<thing>` binaries stay as aliases. The collision with askmoe and
`~/.claude/moe-core` was an accident rather than a policy, both are abandoned,
and moedex's main bin returns to `moedex`. That is the policy and all of it —
building the dispatcher and amending `ARCHITECTURE.md` §7's Binaries paragraph
belong to `moe-bare-binary-dispatcher`.

## Keep legal provenance out of product voice

`NOTICE` is the repository's canonical attribution surface.
Product documentation should describe Moe as it exists today; do not duplicate
lineage tables or source-repository narratives in package prose.

## No 28th tone skill. A decision, not a constraint

New skills are permitted. A `writing-in-moe-voice` skill would be discoverable
and would fire on its own trigger, and was still declined, because **it adds a
trigger, not content.** This text is identical either way, and
`write-clearly` already fires on all prose humans read, so a
28th description costs every session forever and buys nothing.
`skill-set-fidelity-refactor` removes the fixed-count assertion that used to
imply this, so this paragraph is the only place it now lives.

**The condition that reverses it:** if `write-clearly` measurably
under-fires on README and merge-request-description work, a second trigger earns
its keep. The instrument is the per-session `Skill`-invocation counter in
`verification-split-and-firing-rate` Part C, which already names this question.
The line: fewer than one in four sessions producing a README or a merge-request
description invoke it. That number is chosen, not derived; revise it once there
is data behind it. Firing is a different question from whether this file changes
the OUTPUT, which was measured separately — cited above.

## Out of scope: agent-facing skill prose

Skill BODIES keep the upstream enforcement register. The 46 "your human partner"s
across 15 files stay, as do the `<EXTREMELY-IMPORTANT>` block at
`packages/core/skills/using-moe/SKILL.md:16-22` and the twelve-row Red Flags
table at `:39-56`. Those are not tone: the "Bulletproofing Skills Against
Rationalization" section of `write-skill/SKILL.md` documents them as
behavioural devices tested against subagents, so softening them for style would
change agent behaviour. House voice governs prose HUMANS read.
