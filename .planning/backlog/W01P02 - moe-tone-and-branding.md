---
slug: moe-tone-and-branding
title: House Voice, Written Down Once
idea: |
  - Branding with Moe identity/tone through docs (add tone to skills?)
status: backlog
size: M
estimate: 4-5 h
depends_on: [DO-NOW-1, DO-NOW-2]
blocks: []
conflicts_with: [native-renderers, contributing-flow-docs, installer-hq-dx, tc-standards-conformance, moe-bare-binary-dispatcher]
touches:
  - packages/core/skills/writing-clearly-and-concisely/
  - packages/core/skills/writing-skills/SKILL.md
  - packages/core/mint/moe-everything.yaml
  - plugins/moe-everything/
  - .claude-plugin/marketplace.json
  - .gitlab-ci.yml
decision_needed: no
---

# House Voice, Written Down Once

## The idea

> Branding with Moe identity/tone through docs (add tone to skills?)

The rebrand so far is token replacement: PARITY.md:108 counts 1632 of 2964 files
carrying a brand token. That work renames things. It does not decide how Moe
*sounds*. This item is the voice layer — and the finding that shapes it is that
**the voice already exists and is already consistent; it has just never been
written down.** So this is a transcription job plus one guard, not an authoring
job. (Repo under discussion: `~/Code/moe`, the Superpowers fork — not
`~/Code/tools/moe` and not `~/.claude/moe-core`.)

## Debate-review decisions (2026-08-31)

- **The flip condition is now measurable without a purpose-built test.** This
  doc names one: *if `writing-clearly-and-concisely` measurably under-fires on
  README and MR-description work, discoverability is a real gap and a second
  trigger earns its keep.* `verification-split-and-firing-rate` Part C counts
  `Skill` invocations per session from the transcript, so the counter answers it
  directly.
- **Step 5's subagent test is still owed.** The Iron Law binds the edit
  regardless; the counter measures *firing*, the subagent test measures whether
  the pointer changes the output. Different questions.
- **Recommendation C stands.** Nothing here reopens the no-28th-skill decision —
  and ARCHITECTURE.md §2's firing-rate rule now gives it a second, independent
  argument: a description that never fires is dead weight, and adding one is a
  bet you cannot yet price.

## Why it matters

Twenty people will read these docs and none of them wrote them. The nine package
READMEs currently teach a strong, repeatable habit — verdict first, evidence
counted, refutations named out loud — and nothing records that habit, so the
tenth document regresses to the mean. Writing it down costs one file. The second
half matters more: mechanical rebranding is actively damaging attribution right
now (see Current state), and that is a legal exposure, not a style preference.

## Current state

**Four things exist and only one of them is a voice.**

1. **A name system, complete.** ARCHITECTURE.md §7 — "a tavern and its measures:
   you run a `tab`, you order a `flight`, you check the `proof`, you look through
   the `glass`." The word "tavern" appears in exactly one line of the whole repo.
   It is never explained to a user, and no package README references it.

2. **A tagline, barely deployed.** "Just ask Moe." is in README.md:5 and
   ARCHITECTURE.md:3 and nowhere else — not in
   `.claude-plugin/marketplace.json`, not in any of the nine package READMEs, not
   in a skill, not in a CLI usage string.

3. **A mascot and a stated premise — new, and it changes this item's job.**
   `0e6a5f7` added `assets/moe.png` (a green many-armed alien in a headset
   driving eight control surfaces, unimpressed) and, at README.md:9-10, the
   thesis: "Eight arms, eight control surfaces, one bored expression. That is the
   whole premise: one operator driving every harness at once, from one place."
   That is the first real identity statement in the repo, and it is better than
   anything this item would have invented. **So `house-voice.md` records that
   premise; it does not author one.** The alt text is also the house voice working
   correctly under constraint — concrete, specific, no adjectives spent on mood.

3. **A prose voice, already consistent 9/9.** All nine package READMEs follow
   the same shape and register — `crew`, `mint`, `tab`, `proof`, `backstory`,
   `glass` on main; `core`, `memory`, `flight` in the worktrees. The shape:

   - bare verb-phrase verdict as the opening line — `packages/tab/README.md:3`
     "Price an agent transcript. What the run cost you."
   - a plugin-or-not declaration — `packages/glass/README.md:6` "Ships as the
     **`moe-glass`** plugin… Never hand-edit the generated manifest." vs
     `packages/mint/README.md:8` "Not a plugin."
   - `**Status:**` with counted evidence, including what is *not* done —
     `packages/crew/README.md:12` "397 tests passing across 38 suites; 12 more in
     3 suites skip themselves without a local `tmux`."; flight's "**Status:** half
     imported… `superpowers-evals` (quorum) is **not** imported except for one
     deliberate bridgehead" (worktree README:9-12).
   - a `## Forked from` table, then a licence reconciliation stated out loud
     rather than resolved silently — `py/proof/README.md:22` "Two attribution
     facts, both true, and they are not the same fact."
   - refutations named — ARCHITECTURE.md:158 "**`proof → tab` is REFUTED.**"

   **Is that the Moe voice?** It is *a* house voice, and a good one — generic
   competent technical writing does not log refutations, date its decisions, or
   count its own skipped tests. But it is the **fork ledger's** voice, aimed at
   one reader doing one job: auditing an import. Half its moves (`## Forked
   from`, "Status: imported", statements of change) become historical furniture
   once the import is done. Transcribe it; do not mistake it for a persona.

**Agent-facing skill prose is in a different voice that nobody chose.**
`packages/core/skills/` (worktree `wf_238bb49d-362-13`) carries 48 occurrences of
"your human partner" across 15 files — 9 in `receiving-code-review/SKILL.md`, 8
in `finishing-a-development-branch/SKILL.md`; `packages/backstory/skills/` has
zero. Plus the ALL-CAPS block at `using-moe/SKILL.md:16-22` and the "Red Flags"
rationalization table at `:39-56`. That is the upstream author's idiom, and it is
**load-bearing**: `writing-skills/SKILL.md:476` ("Bulletproofing Skills Against
Rationalization") documents those caps and tables as behavioural devices tested
against subagents. Softening them for tone would change agent behaviour.

**A house style for authoring skills already exists** — `writing-skills/SKILL.md`
§3 (209-212), §4 "Token Efficiency (Critical)" (213-267), §5 (278-289). It
governs structure, naming and discoverability. It says nothing about voice.

**The provenance-vs-self-reference rule has already been violated once by a
rebrand sweep, and a human caught it, not a check.** ARCHITECTURE.md:266-267
states the rule; the flight import hit it and records the correction at
`.claude/worktrees/wf_238bb49d-362-15/packages/flight/README.md:330-332`: "The
sweep rewrote `gauntlet` in prose that names the *upstream repo*… Restored:
provenance is preserved, self-reference is rewritten." The tree is correct today
— that README's `## Forked from` table (lines 14-18) names `gauntlet`, and
PARITY.md:35 agrees. **Note for later readers:** `moe-flight` does appear in that
file at lines 294, 305 and 310, but those are rows of the rebrand **mapping
table**, whose four columns are (kind, upstream token, Moe token, count).
`moe-flight` in the third column is correct and required. Do not read a mapping
row as an attribution row.

So the rule is enforced by attention. It survived one 257-occurrence sweep
because someone was watching; the next sweep may not be. That is a prevention
argument for a check, not a remediation one.

**The front-door fixes this item used to own are already done.** `0e6a5f7`
replaced README.md's "Target-shape only. No code imported yet."; ARCHITECTURE.md's
status line now reads "written as a target-shape document, and the target is hit";
and `grep -rnE "28[- ]skills?" ARCHITECTURE.md .claude-plugin/marketplace.json`
returns nothing — every 28 became 27. Scope drops accordingly.

**One count survives, in ten files, and the fix is to delete the number rather
than correct it.** `packages/core/mint/moe-everything.yaml:19` says "all 27
skills", which mint byte-copies into nine generated manifests — `plugins/
moe-everything/{plugin.json,package.json,gemini-extension.json,moe-mint.yaml}`
plus the `.claude-plugin`, `.cursor-plugin`, `.devin-plugin`, `.kimi-plugin` and
`.hermes-plugin` variants — and `marketplace.json:23` carries the same sentence
by hand. 27 is correct *today*: it is the imported count that
`skill-set-fidelity-refactor` now pins with `it("pins the IMPORTED skill set at
exactly 27")`. But that item introduces a two-list model where authored skills sit
alongside imported ones, so a description promising "all 27 skills" goes wrong the
first time anyone authors one — and `gsd-core-skill-import` intends to.
`skill-set-fidelity-refactor` already set the pattern by *dropping* the count from
`packages/core/README.md:102` rather than updating it. Do the same here: a
marketing description should not carry a number a test has to keep true.

## Prerequisites

- **DO-NOW-1.** `packages/core` is a stub on main; the artifact lands in the
  worktree copy, so it cannot be written until the three `import/*` branches
  merge.
- **DO-NOW-2.** Determines whether `writing-clearly-and-concisely` stays
  `tier: core`. `skill-tiers.yaml:139-149` flags it as "THE MOST ARGUABLE CALL IN
  THIS PROPOSAL". If it moves to `everything`, the house-voice file ships only in
  `moe-everything` and reaches far fewer sessions. Do not write the file before
  that call is made.
- Not DO-NOW-3. `moe-mint.yaml:46-49` emits `skills/`, `commands/`, `agents/`,
  `hooks/hooks.json`, `.mcp.json` — and **not** `docs/`. That decides the
  artifact's location on its own (below).
- **Not `skill-set-fidelity-refactor`, deliberately — keep it that way.** It is
  the other Wave 1 item (WAVES.md:16), and its decision D4 pre-added
  `["skills/writing-clearly-and-concisely/house-voice.md", ["superpowers"]]` to
  the `provenance` map at `packages/core/test/metadata.test.ts:530-534`
  precisely so the two run in parallel without an edge; adding one would waste
  that. The entry is inert until the file exists (`provenance.get(rel) ?? []`,
  :550), so nothing needs activating, and because `commentish()` returns true for
  `.md` (:538-543) the exemption covers the whole file rather than comment lines.
  If that item ever slips out of Wave 1, this file drops the word rather than
  gaining a dependency.
- **Not `moe-bare-binary-dispatcher`**, but a file conflict: it amends
  ARCHITECTURE.md:252-253 and this item edits ARCHITECTURE.md too (status line,
  skill count). Not the same wave.

## Proposed approach

New skills are permitted as of 2026-08-31, and `skill-set-fidelity-refactor` is
removing `metadata.test.ts`'s fixed-count assertions. So the question is decided
on merit, not on whether a wall exists.

**Option A — a 28th skill, `writing-in-moe-voice`.** Discoverable, fires on its
own trigger. But it competes with `writing-clearly-and-concisely/SKILL.md:3`
("ANY prose humans will read"), which `writing-skills` §SDO warns against, and it
costs a description in every session forever.

**Option B — a `docs/VOICE.md` at the root or in `packages/core/docs/`.** Cheap
and human-readable, but invisible to the agent: `docs/` is not in mint's
component list, so a skill pointing at it is a dead link inside the plugin.

**Option C — a reference file inside the existing prose skill.**
`packages/core/skills/writing-clearly-and-concisely/house-voice.md`, sitting
beside `elements-of-style.md`, plus a three-line pointer in that skill's
`SKILL.md` body. Zero session cost (the frontmatter description is untouched, so
nothing new loads at startup — descriptions are the only level pre-loaded;
bodies and reference files load on demand¹). No new trigger. Travels with the
plugin because it is under `skills/`. And it *extends* the 1918 Strunk text with
the house's own 2026 specifics rather than competing with it.

**Recommendation: C — still no 28th skill, and the new permission does not
rescue Option A.** The reason is not that a skill is forbidden or untestable.
It is that **Option A adds a trigger, not content.** The text is identical under
either option, so any subagent test you could write for A passes under C too —
and C's trigger already covers the case, because
`writing-clearly-and-concisely` fires on all prose humans read. A adds one
description to every session, forever, and buys nothing the existing trigger does
not already deliver. Cost of that nothing: the 27 descriptions total 6,034
characters (~1,500 tokens), so a 28th is ~50-60 tokens per session.

**What the Iron Law does and does not settle.** `writing-skills/SKILL.md:374`
does not rule out a tone skill on the grounds that voice is unobservable — the
sub-rules *are* observable (verb-phrase opening, counted `**Status:**`, no
invented tavern noun), so a subagent test is writable either way. And it binds
**both** options: :380 and :387 extend it to "EDITS to existing skills" and "Not
for 'just adding a section'", which is exactly what C is. So it does not
discriminate; it just means C owes a subagent test too. That is now in Effort.

**The single condition that would flip this:** if
`writing-clearly-and-concisely` measurably under-fires on README and
MR-description work — i.e. agents write prose without it triggering — then
discoverability is a real gap and a second trigger earns its keep. That is now
measurable rather than rhetorical: `verification-split-and-firing-rate` Part C
builds the firing-rate counter and names this exact condition at its line 182.
Revisit Option A when that counter has data, not before.

Steps:

1. Write `house-voice.md` (~70 lines): the README shape above with its real
   examples; the tavern vocabulary as a **closed** list (`tab`, `flight`,
   `proof`, `glass` — no new measures get coined); the name policy as settled on
   2026-08-31 (**this repo owns "Moe"**; `moe <thing>` is the dispatcher and
   `moe-<thing>` the aliases — see `moe-bare-binary-dispatcher`); the
   provenance-vs-self-reference rule from ARCHITECTURE.md:266-269 restated as a
   hard rule; the record that "no 28th tone skill" is a decision, since
   `skill-set-fidelity-refactor` removes the test that used to imply it; and an
   explicit **out of scope** clause naming agent-facing skill prose and why
   (`writing-skills/SKILL.md:476`).

   Worth stating rather than leaving implicit: `moe flight`, `moe tab`, `moe
   proof`, `moe glass` reads as ordering at a bar, which turns "Just ask Moe."
   from decoration into a literal description of the CLI — the strongest argument
   yet for keeping the tavern vocabulary closed.

   **Four literals none of the three files in `packages/core` may contain** —
   `house-voice.md` and both `SKILL.md` pointers are all scanned. The Wave 1
   exemption buys the bare word `superpowers` and nothing else; three tests in
   `packages/core/test/metadata.test.ts` have no exemption mechanism, and a
   fourth hazard is broader than it looks. None is needed in a style guide, so
   **request no loosening** — these are among the sharpest assertions in the file.

   Cited by test name, not line: the assertions live in
   `skill-set-fidelity-refactor`'s branch, whose numbering has already moved once
   (the exemption entry went from :530 to :805 between reports).

   | Forbidden | Test | Say instead |
   |---|---|---|
   | `.superpowers/`, `docs/superpowers/` | "keeps the upstream state and output paths renamed everywhere" | "the old state directory", or cite `.moe/sdd` |
   | `using-superpowers`, `superpowers:brainstorm*`, `testing-anti-patterns`, `superpowers:code-reviewer` | "no reference to a retired upstream skill name survives" | "the bootstrap skill, renamed to `using-moe`" |
   | `superpowers:<skill>` | "no plugin-qualified skill reference survives" | a bare backticked skill name |

   Two sharp edges in that table. **The retired-names test matches substrings**,
   so `superpowers:brainstorming` trips it via the `superpowers:brainstorm`
   literal — and it trips the plugin-qualified test too, so one phrase fails two
   assertions. And **the plugin-qualified test is not `superpowers`-specific**: it
   matches `/([a-z0-9][a-z0-9-]*):([a-z0-9][a-z0-9-]*)/g` and fails on **any**
   `word:skillname` pair where the suffix is a real skill name and no space
   follows the colon. A file about writing that names skills constantly is the
   likeliest place in the repo to trip that — `note:brainstorming` and
   `SUB-SKILL:test-driven-development` both fail, with no upstream token present.
   Keep a space after every colon that precedes a skill name. `SKILL.md:476`-style
   citations are safe: the suffix is digits, and digits are not skill names.
2. Add a three-line "House voice" pointer to
   `writing-clearly-and-concisely/SKILL.md`. Frontmatter untouched.
3. Add a two-line note in `writing-skills/SKILL.md` near §5: skill *bodies* keep
   upstream's enforcement register; house voice governs prose humans read.
4. Provenance check (prevention): a ~40-line node script asserting every package
   README's `## Forked from` upstream column names a row from PARITY.md's
   upstream table. Scope it to that one table per README — nothing else — so it
   cannot misfire on the rebrand mapping tables. Wire as a `provenance` job in
   `.gitlab-ci.yml`; there is no root vitest project (no root
   `vitest.config.ts`; root `test` is `turbo run test`), so a CI job is cheaper
   than adding one. Passes on the tree as it stands — this locks in a rule that
   currently survives on attention alone.
5. Subagent test for the edit, per the Iron Law: baseline a subagent writing a
   package README without the pointer, then with it, scoring the observable
   sub-rules (verb-phrase opening, counted `**Status:**`, no invented tavern
   noun). `writing-skills/testing-skills-with-subagents.md` is the procedure.
6. Two marketplace-facing strings, both in the same sentence. Drop the count
   from `packages/core/mint/moe-everything.yaml:19` and from
   `marketplace.json:23`, then run `pnpm mint` so the nine generated copies under
   `plugins/moe-everything/` follow, and commit source and generated output
   together. `/plugins/` is committed and the `plugins` CI job
   (`.gitlab-ci.yml:67-70`, `pnpm mint:check`) asserts byte-identical
   regeneration, so hand-editing a manifest fails and skipping the regen fails.
   Same step adds "Just ask Moe." to `marketplace.json:8`'s
   `metadata.description` — decision #26, that one place only.

¹ https://docs.claude.com/en/docs/agents-and-tools/agent-skills/overview and
https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills

## Scope boundary

**In:** one `house-voice.md`; two small pointers; a subagent test for the edit;
the provenance check + CI job; the stale front-door facts; the tagline into
`marketplace.json:8`.

**Out:**
- **Agent-facing skill instruction prose** — all 48 "your human partner"s and
  every ALL-CAPS block stay. Settled 2026-08-31 (decision #27).
- **Output format** — tables vs prose, renderers, artifacts. `native-renderers`.
- **What to run when and why** — `contributing-flow-docs`.
- **MR-description and branch-name conventions** — `tc-standards-conformance`
  owns those; it should *cite* `house-voice.md`, not restate it.
- **Skill renaming and the lean/full split** — `tiered-workflow-naming` and
  DO-NOW-2.
- **The bare-`moe` dispatcher and the ARCHITECTURE.md:252-253 amendment it
  needs** — `moe-bare-binary-dispatcher`. This item records the naming *policy*;
  that one builds the bin.
- Any new logo, colour, ASCII banner or persona. Nobody asked.

## Open questions for Zak

**None.** All four were answered on 2026-08-31; recorded here because
`house-voice.md` has to state them and the wave plan depends on them.

1. **No 28th tone skill** — recommendation, not a constraint. New skills are now
   permitted and `skill-set-fidelity-refactor` is removing the count assertions,
   so this is a merit call and it survives the change: Option A adds a trigger,
   not content. A reviewer can override it; the falsifiable condition that should
   make them is in Proposed approach. After `skill-set-fidelity-refactor` lands
   nothing enforces this, so `house-voice.md` records it.
2. **"Just ask Moe." goes into `marketplace.json:8` and nowhere else.** Not the
   nine package READMEs — each already opens with a better, more specific line.
3. **The 48 "your human partner"s stay.**
4. **The name collision was an accident, not a policy, and this repo wins.**
   askmoe and `~/.claude/moe-core` are both abandoned — the latter's
   `bin/lib/package-identity.cjs:6-11` still declares `packageName =
   "@bubstack/moe"` and `binName = "moe"`, which is why the collision looked
   live. moedex's main bin returns to `moedex`, freeing the bare name that
   `/Users/ZKeown/.local/bin/moe` holds today. **This repo is `@bubstack/moe`**
   and claims bare `moe` as a dispatcher (`moe flight`, `moe tab`, `moe mint`),
   with `moe-<thing>` kept as aliases — amending ARCHITECTURE.md:252-253, which
   `moe-bare-binary-dispatcher` owns. Only the policy sentence lands here.

## Effort

| Step | Time | |
|---|---|---|
| Write `house-voice.md` with real cited examples | 1.5 h | the bulk; getting it short is the work |
| Two skill pointers | 15 min | |
| Subagent test for the edit (Iron Law) | 45 min | not optional; see the Iron Law note above |
| Provenance check script + CI job | 45 min | small; it passes on day one |
| Front-door fixes (8 places) | 25 min | |
| `pnpm lint && pnpm test` | 20 min | |

**Total 4-5 h**, up from 3-4 h because the Iron Law obliges a subagent test for
an edit, not just for a new skill. What makes it slower: if DO-NOW-2 demotes
`writing-clearly-and-concisely` to `everything`, step 1 needs a rethink of where
the file lives (add ~1 h). If the provenance check surfaces a hit in a package
nobody has audited, deciding whether a token is provenance or self-reference is a
judgment call — budget 10 minutes per hit.

## Verification

- `packages/core/skills/writing-clearly-and-concisely/house-voice.md` exists and
  is under 100 lines.
- `packages/core/test/metadata.test.ts:251` ("every relative markdown link inside
  `skills/` resolves on disk") already covers the two new pointers — it passes,
  or the pointers are broken. No new test needed for step 2.
- The subagent test from step 5 fails on the baseline (no pointer) and passes with
  it, scored on the observable sub-rules. Iron Law obligation.
- **The four forbidden literals are absent.** `metadata.test.ts` tests :195, :212
  and :569 pass with no exemption added to any of them — that is the real
  assertion for step 1, and adding an exemption instead of rewording is a failure,
  not a fix.
- **No test guards "no 28th skill."** `metadata.test.ts:115`
  (`expect(skills.length).toBe(27)`) implied it; `skill-set-fidelity-refactor`
  replaces it with `it("pins the IMPORTED skill set at exactly 27")`, counting
  `imported:` in `skill-tiers.yaml`, which a reference file cannot disturb. So the
  count stays 27 and green — but nothing enforces the decision. It lives in
  `house-voice.md`. Said plainly so nobody later reads a green build as
  ratification.
- The `provenance` CI job passes on the tree as merged, and fails against a
  fixture README whose `## Forked from` upstream column names a Moe package
  instead of an upstream repo. Red on a synthetic case, since there is no live
  defect to fail on.
- `grep -rn "Target-shape only" README.md` returns nothing.
- `grep -rnE "28[- ]skills?" .claude-plugin/marketplace.json ARCHITECTURE.md`
  returns nothing. Five hits today: `marketplace.json:23`, ARCHITECTURE.md:44,
  :53, :70, :98.
- `jq -r '.metadata.description' .claude-plugin/marketplace.json` contains "Just
  ask Moe."
- `pnpm lint && pnpm typecheck && pnpm test` green.
