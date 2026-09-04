# Skill + house-voice doc truthing

Backlog: BL-5897265d07, BL-e9ed508308 — size **S**

Two doc-only edits under `packages/core/skills/`, both confirmed against current
`main` (HEAD `4478b72f`; backlog filed against `f27827aa`). Both change a
`SKILL.md`-adjacent file that mint mirrors into 7 `/plugins/` copies, so
**`pnpm mint` must re-run and `pnpm mint:check` must pass**. No source logic, no
test literal, and no plugin metadata (skill `name`/`description`) changes, so
`.claude-plugin/marketplace.json` and `docs/moe/generated/plugin-catalog.md`
stay byte-identical — only the mirrored skill files move.

Note the path drift: the backlog and the v0.2.1 plan both cite
`packages/core/skills/fixing-a-code-review/SKILL.md`, but commit `ccb9286f`
("rename 30 skills to short names") renamed that directory to `fix-review`. The
finding holds; the path is now `packages/core/skills/fix-review/SKILL.md`, and
there are **two** occurrences of the stale token, not one.

## Problem

### BL-5897265d07 — `fix-review/SKILL.md` still uses the `BL-####` placeholder

The canonical backlog id shape is `BL-<10 hex>`: `packages/jig/src/backlog.ts`
mints it as ``id = `BL-${randomBytes(5).toString("hex")}` `` (5 bytes → 10 hex
chars), and `packages/jig/test/backlog.test.ts` pins it with
`expect(a.id).toMatch(/^BL-[0-9a-f]{10}$/)`. The two backlog items in this very
spec — `BL-5897265d07`, `BL-e9ed508308` — are live examples of the format.

`packages/core/skills/fix-review/SKILL.md` still documents the old
placeholder in two places:

- In "The disposition contract", the sentence beginning "Record the returned":
  > Record the returned `BL-####` in the disposition `Note`.
- In "Red flags", the last bullet:
  > - A deferred or skipped finding with no BL-#### in its Note

`BL-####` reads as placeholder notation and no longer matches what
`moe jig backlog add` returns. Cosmetic only — `stamp-disposition.mjs` parses
ids by regex, not digit count — but this is the producer skill that tells an
agent what to paste into a disposition `Note`, so the shown shape should be the
real one.

### BL-e9ed508308 — the house voice has no "no-no words / patterns" section

The house-voice guidance lives at
`packages/core/skills/write-clearly/house-voice.md` (linked from
`write-clearly/SKILL.md` as "The house voice"). `moe-tone-and-branding` — cited
by the backlog and by `AGENTS.md` ("Voice and tone — see `moe-tone-and-branding`")
— is a **work-item / ownership name, not a surface on disk**; there is no
`moe-tone-and-branding` skill. `house-voice.md` is the file the ownership name
governs, so the content lands there.

`house-voice.md` today documents README shape, the closed tavern vocabulary, the
name policy, and scope boundaries, but it never enumerates the words and
constructions to cut. That list is not merely missing prose — the repo already
enforces one mechanically and the doc does not transcribe it:
`packages/core/test/house-voice/score.mjs` fails a README on a closed `HEDGES`
set (`probably, arguably, fairly, quite, somewhat, generally, basically,
essentially, simply, actually, really, very`), on `COPULAR` category-description
openers (`is a`, `provides`, `allows`, `enables`, `offers`, `serves as`,
`acts as`, `is designed to`, `is intended to`, `is responsible for`), and on the
`COINED_MEASURE` tavern-noun set. The doc's own premise is "a transcription, not
an invention"; the no-no list is exactly the untranscribed half of the
instrument.

## Change

### BL-5897265d07 — replace both `BL-####` tokens

In `packages/core/skills/fix-review/SKILL.md`, edit the two occurrences to the
`BL-<10hex>` shape and add a one-time concrete example so the reader sees the
real form.

1. "The disposition contract" sentence — change
   > Record the returned `BL-####` in the disposition `Note`.

   to
   > Record the returned `BL-<10hex>` id (e.g. `BL-5897265d07`) in the
   > disposition `Note`.

2. "Red flags" bullet — change
   > - A deferred or skipped finding with no BL-#### in its Note

   to
   > - A deferred or skipped finding with no `BL-<10hex>` id in its Note

Rationale for `BL-<10hex>` over a bare example: it names the format (matching how
`ARCHITECTURE.md`/AGENTS.md speak of the id shape) while the parenthetical shows
one instance. Do not write a bare `BL-` with a fixed fake number as the only
form — the notation should read as a format, not a specific item.

### BL-e9ed508308 — add a no-no section to `house-voice.md`

Append a new `##` section to `packages/core/skills/write-clearly/house-voice.md`
(recommended just after "The tavern vocabulary is closed", which it partly
cross-references). Transcribe the mechanized lists from `score.mjs` first; the
only invented part is the final "AI-tell filler" group, marked as such so a
reviewer can trim it.

Exact recommended content:

```markdown
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
```

Two guard-safety constraints on whatever wording lands (see Risks):
- Do not introduce any `<word>:<skillname>` colon token where `<skillname>` is a
  real skill (fails the "no plugin-qualified skill reference survives" test).
  `codebase-design` / `improve-architecture` are backticked bare — correct.
- Do not add any relative markdown link `](../…)` / `](./…)`; use backticked
  paths (fails "every relative markdown link inside skills/ resolves on disk"
  otherwise, and violates house-voice's own rule).

## Files touched

Source (hand-edit these two, then run `pnpm mint`):

- `packages/core/skills/fix-review/SKILL.md` (source) — two `BL-####` → `BL-<10hex>`
- `packages/core/skills/write-clearly/house-voice.md` (source) — new `## The no-no list` section

Generated — **do NOT hand-edit**; `pnpm mint` regenerates all 14. Both files are
mirrored into 7 harness projections each under `plugins/moe/`:

- `plugins/moe/skills/fix-review/SKILL.md`
- `plugins/moe/.claude-plugin/skills/fix-review/SKILL.md`
- `plugins/moe/.codex-plugin/skills/fix-review/SKILL.md`
- `plugins/moe/.cursor-plugin/skills/fix-review/SKILL.md`
- `plugins/moe/.kimi-plugin/skills/fix-review/SKILL.md`
- `plugins/moe/.opencode/skills/fix-review/SKILL.md`
- `plugins/moe/.pi/skills/fix-review/SKILL.md`
- the same 7 paths with `write-clearly/house-voice.md` in place of
  `fix-review/SKILL.md`

Both skills ship through `packages/core/mint/moe.yaml` (the `moe` plugin).
`.claude-plugin/marketplace.json` and `docs/moe/generated/plugin-catalog.md` are
in the `mint:check` diff set but MUST stay byte-identical — no skill `name`/
`description` changes here.

## Acceptance

- `packages/core/skills/fix-review/SKILL.md` contains zero occurrences of
  `BL-####` (`grep -c 'BL-####'` → 0) and at least one `BL-<10hex>`.
- `packages/core/skills/write-clearly/house-voice.md` contains a `## The no-no
  list` section that names the `HEDGES`, `COPULAR`, and `COINED_MEASURE` groups
  and the architecture-glossary exception.
- **`pnpm mint`** run; the 14 generated mirrors updated to match source.
- **`pnpm mint:check`** green — `/plugins/` reproducible from source, and
  `marketplace.json` / `plugin-catalog.md` unchanged (a diff on either means the
  edit accidentally touched metadata).
- **`pnpm check`** green — in particular:
  - `packages/core/test/metadata.test.ts` — "every relative markdown link inside
    skills/ resolves on disk", "no plugin-qualified skill reference survives",
    and "every REQUIRED marker names a skill that exists" all still pass over the
    edited `house-voice.md`.
  - `packages/core/test/house-voice.test.ts` — unaffected (its `score.mjs` reads
    fixtures and the baseline/with-pointer arms, never `house-voice.md`); the
    recorded score assertions stay green.
- `pnpm provenance` not implicated (no `NOTICE` / imported-work change) but stays
  green.
- No new test required. If a regression guard is wanted for BL-5897265d07, add
  one case to `packages/core/test/metadata.test.ts` under a new `it(...)`:
  read `fix-review/SKILL.md` and `expect(text).not.toMatch(/BL-####/)`. Optional,
  low value (the string is cosmetic); the spec does not require it.

## Test plan

- Existing gates are the test plan: `pnpm check` (runs `metadata.test.ts` and
  `house-voice.test.ts`) and `pnpm mint:check`. Run both locally before the MR.
- Manual grep verification:
  `grep -rn 'BL-####' packages/core/skills/fix-review/ plugins/` → no matches
  after mint.
- If the optional guard is added, it lives in `metadata.test.ts` as a new
  `it("fix-review documents the BL-<10hex> id shape, not the BL-#### placeholder")`
  and asserts `not.toMatch(/BL-####/)` plus `toMatch(/BL-<10hex>|BL-[0-9a-f]{10}/)`.

## Sequencing & dependencies

- **Independent of the packaging republish** (`BL-d932811282` /
  `release-execute`). This changes skill prose only; it does not touch the
  release manifest, tarball assembly, or license payloads. It can land before or
  after the packaging work with no ordering constraint — but because it
  regenerates `/plugins/`, land it before the tarballs are cut so the shipped
  plugin carries the corrected prose.
- **Both edits can be done in one MR** (one `pnpm mint`, one `mint:check`), or
  split; they touch disjoint files and share only the mint regen step.
- **Runs in parallel** with any non-`packages/core/skills` v0.2.1 item. Watch
  for collision only with another item that also edits `packages/core/skills/**`
  and re-mints (e.g. any other doc-truthing item in Track 3) — mint regen must
  run once over the combined edit, so serialize the `pnpm mint` step or rebase.
- No dependency on the jig backlog-hygiene spec
  (`jig-backlog-transition-hygiene.md`); different package, different files.

## Risks

- **Forgetting `pnpm mint`.** Hand-editing source without regenerating leaves
  `/plugins/` stale; `pnpm mint:check` catches it in CI (`plugins` job). Low.
- **Accidentally tripping a `house-voice.md` markdown guard.** Adding a relative
  link or a `foo:realskill` colon token turns `metadata.test.ts` red. Mitigated
  by the two constraints in "Change" — use backticked paths and bare backticked
  skill names. Low.
- **Banning `leverage` globally.** `leverage` is a mandated architecture-glossary
  term in `codebase-design` / `improve-architecture`; a no-no list that forbids
  it outright would contradict those skills. The proposed content carves this out
  explicitly. Do not drop that exception. Medium if ignored.
- **Scope creep on the AI-tell list.** The mechanized groups are objective; the
  AI-tell group is judgment. Keep it short and marked "not yet mechanized" so it
  reads as guidance, not as a claim the scorer enforces it. Low.
