# v0.2.1 execution index

v0.2.1 is a patch release led by packaging. Its one critical, user-facing fix is
**P1 — wire the release `--execute` paths** (`BL-d932811282`): the release
orchestrators exist and are unit-tested, but nothing in production calls them, so
today's published install ships incomplete tarballs (no top-level plugin
manifest, no LICENSE, so the `using-moe` bootstrap never registers). 0.2.1 wires
candidate/promote/certify, then cuts a `v0.2.1` that **republishes complete
plugin trees**. Every other item in this release — dead-code removal, doc
truthing, backlog hygiene, two new READMEs — rides that republish, so it must
land on the release branch *before* the tag is cut. The final act is version
reconciliation (bump every plugin whose generated tree changed), then tag.

## Spec table

| Item | Backlog id(s) | Size | still_valid | Summary | Spec |
|---|---|---|---|---|---|
| wire-release-execute-paths | BL-d932811282 | L | true | **P1 lead.** Wire the three `release … --execute` CLI handlers to the real orchestrators, add the missing preflight/artifact builders + the `npm publish` step, fix broken `publish.yml` steps; the republish everything else rides. | [wire-release-execute-paths.md](./wire-release-execute-paths.md) |
| jig-backlog-transition-hygiene | BL-2064cbd0a5, BL-9611e6525d | S | true | In `packages/jig/src/backlog.ts`: strip a stale `## Resume` block on decline, and clear state-scoped `reason`/`claimedBy` fields whose destination state made them meaningless. One helper, one call site in `persist`, route defer through it. | [jig-backlog-transition-hygiene.md](./jig-backlog-transition-hygiene.md) |
| skill-house-voice-doc-truthing | BL-5897265d07, BL-e9ed508308 | S | true | Two skill-file edits: replace `BL-####` placeholder with the real `BL-<10hex>` shape in `fix-review/SKILL.md` (two occurrences), and add a "no-no words/patterns" section to `write-clearly/house-voice.md` transcribing the mechanized `score.mjs` lists. Mint-mirrored → re-mint. | [skill-house-voice-doc-truthing.md](./skill-house-voice-doc-truthing.md) |
| mint-dead-code-false-green | BL-2ff666d13d, BL-3fdd56ee5a | S | true | Drop the unauthorable `rules`/`variables` columns from `ComponentSupport` + `matrix.ts` + all 10 adapters (CLI stdout only, no `/plugins/` change); annotate `adapters/mcp.ts` as a staged 0.3.0 (H1) seed rather than deleting it. | [mint-dead-code-false-green.md](./mint-dead-code-false-green.md) |
| dead-code-glass-jig-graph | BL-7394064152, BL-a959e92b57 | XS | true | Remove glass `browsing-compat/package.json`'s dead `chrome-ws` bin key (keep the file — it is a CommonJS test fixture); remove jig-graph's unused `traceCalls`/`CallResult` exports and their two test mocks. No mint input. | [dead-code-glass-jig-graph.md](./dead-code-glass-jig-graph.md) |
| arch-readme-truthing | BL-1723a7d901, BL-0f9d99223b | S | true | Fix contradictory package/namespace counts to **12 packages · 6 plugins · 8 namespaces** in `ARCHITECTURE.md` + `README.md`; add harness certify/preview tiering + MCP-degradation prose and two new `docs-emit.ts` `NOTES` bullets (generated → re-mint). | [arch-readme-truthing.md](./arch-readme-truthing.md) |
| memory-codex-doc-drift | BL-e6e0a743f3, BL-46935c8fc8, BL-0a9962f094 | M | true | MCP-TOOLS.md "seven"→"nine" tools (add `link_memories`/`trace_provenance`); rewrite `CODEX.md` + reframe codex-e2e tests so no green test presents Codex MCP as a shipped 0.2.1 capability; complete the codex `installDoc` caveat (agents + mcp). Mint-mirrored → re-mint. | [memory-codex-doc-drift.md](./memory-codex-doc-drift.md) |
| crew-flight-honesty-discoverability | BL-ab3955cad8, BL-248f2bf469, BL-221ed7d54c, BL-2997be20cc | S | true | De-stale crew pi-extension tsup comments + claude-centric stop docs (`/quit` for codex/pi); document `MOE_CREW_PI_PROVIDER` in USAGE + SKILL; drop invented flight `dashboard serve`; fix flight stale shutdown comment. Crew SKILL + USAGE are minted → re-mint. | [crew-flight-honesty-discoverability.md](./crew-flight-honesty-discoverability.md) |
| add-readmes-jig-and-jig-graph | none (plan Track 3) | S | true | Create `packages/jig/README.md` and `packages/jig-graph/README.md` (only two publishable packages missing one). Both declare "Not a plugin"; jig-graph names its `--manifest` non-completion. No mint input. | [add-readmes-jig-and-jig-graph.md](./add-readmes-jig-and-jig-graph.md) |
| version-reconciliation | none (plan A#10) | S | true | **Runs last.** Per-plugin "bump only what changed" to `0.2.1`; bump both authorities (package.json + mint yaml) together; re-mint; update three version-pinned tests. Keep the git tag as the sole umbrella version. | [version-reconciliation.md](./version-reconciliation.md) |

Ten specs, all `still_valid=true`. Backlog items covered: 15 distinct `BL-` ids
across 8 specs; the remaining 2 specs (add-readmes, version-reconciliation) trace
to plan items, not backlog ids.

## Sequencing

Priority 1 is packaging (`BL-d932811282`); **everything republishes with it.**
The hard rule: any item that changes a generated `/plugins/**` tree, a shipped
`dist`, or an npm-tarball file must be **merged to the release branch before
`release candidate --execute` cuts the v0.2.1 tag** — if it lands after, it
misses the tarballs and needs another republish. The three already-merged
reproducibility fixes (G4 umask #7, G5 EPIPE #6, B render-graphs #9) are on
`main` and just carry into the release.

### Group 1 — Packaging wiring (P1; the code lands early, the *cut* is last)

1. **wire-release-execute-paths** (`BL-d932811282`, L). The orchestration code
   (new `orchestrate.ts`, CLI wiring, `publish.yml` fixes, the missing
   `publishTarball('next')` step) can be built and merged in parallel with the
   content work — it only *reads* committed `plugins/**` trees, it does not edit
   them. **Escalation for the release owner:** `certify-claude --execute` needs a
   production `TargetLifecycleDriver` that does not exist; option (a) build it so
   `latest` can be promoted, or (b) ship candidate-to-`next` in 0.2.1 and defer
   driver-backed certify + `latest` promotion to the deferred e2e harness
   (`BL-3ce1956bb4`). This decides whether 0.2.1 reaches `latest` or only `next`.

### Group 2 — Source / behaviour fixes needing mint + tests (land before the cut)

These change generated output and/or carry test updates; each must re-mint and
pass `pnpm check` + `pnpm mint:check`. Parallel-safe except where they share
`matrix.ts` / `docs-emit.ts` (serialize the mint step or rebase):

2. **memory-codex-doc-drift** (M) — `MCP-TOOLS.md` + codex `installDoc` are
   mint-mirrored; re-mint fans out to `plugins/moe-memory/**` and five
   `docs/install/codex.md`. New tests + `mcp-startup`/`codex.test.ts` guards.
3. **arch-readme-truthing** (S) — `docs-emit.ts` `NOTES` regenerates all six
   `support-matrix.md`; updates `docs-emit.test.ts` + `generate.test.ts.snap`.
   (Its `ARCHITECTURE.md`/`README.md` prose half is Group 3.)
4. **skill-house-voice-doc-truthing** (S) — `fix-review/SKILL.md` +
   `house-voice.md` mirror into 14 generated copies; `marketplace.json` /
   `plugin-catalog.md` must stay byte-identical.
5. **crew-flight-honesty-discoverability** (S) — crew SKILL + `cli.ts` USAGE
   need `pnpm build` **then** `pnpm mint` (USAGE compiles into `dist`); flight
   half is not minted.
6. **mint-dead-code-false-green** (S) — mint source + tests only; **produces no
   `/plugins/` diff** (drops CLI-stdout-only columns), but `mint:check` must
   confirm zero diff. **Watch collision with arch-readme (D3):** both touch
   `matrix.ts`/`docs-emit.ts`/their tests — sequence or rebase.
7. **dead-code-glass-jig-graph** (XS) — removal-only; no mint input, but
   jig-graph `dist/moedex.*` rebuilds and republishes, so land before the tag.

### Group 3 — Pure doc truthing (independent; land before the cut for tarball inclusion)

8. **add-readmes-jig-and-jig-graph** (S) — two new package READMEs; npm
   auto-packs `README.md`, so no `files` edit and no mint. Fully independent.
9. **jig-backlog-transition-hygiene** (S) — one library file + tests; `moe-jig`
   ships no mint plugin, so no `/plugins/` impact and no ordering constraint at
   all. (Source+test, not prose, but has zero release-gate coupling.)
10. **ARCHITECTURE.md / README.md prose** (part of arch-readme-truthing) — repo
    docs only, not staged into any plugin; land any time in the window, ideally
    bundled with that spec's `docs-emit.ts` edit as one coherent MR.

### Group 4 — Release cut (last)

11. **version-reconciliation** (A#10, S) — runs **after every content edit is on
    the release branch.** Procedure: `pnpm mint` → the set of `plugins/<id>` with
    a diff is the set to bump → set both authorities to `0.2.1` for each → `pnpm
    mint` again → `pnpm mint:check` byte-clean → update the three version-pinned
    tests. Expected outcome under the current content set: **all six bump to
    0.2.1** (the matrix/D3 changes rewrite every tree's `support-matrix.md`).
    Precondition: the `0.2.0` floor must already exist on the branch (the v0.2.0
    baseline sync must have landed). Then tag `v0.2.1` → `candidate --execute`.

**Fully independent of the packaging republish (no ordering vs P1, though they
still ride the same release):** jig-backlog-transition-hygiene, add-readmes,
mint-dead-code-false-green, dead-code-glass-jig-graph. The doc/mint-mirrored
items are ordering-coupled only in that they must precede the tag cut.

## Gates

`pnpm check` (lint + typecheck + test) applies to every item. Beyond that:

| Item | pnpm mint re-run? | mint:check | provenance |
|---|---|---|---|
| wire-release-execute-paths | yes — the 0.2.1 version bump regenerates `plugins/**` + catalog (the actual artifact) | must pass | **must pass** — LICENSE/NOTICE payloads are the point of the fix |
| version-reconciliation | yes — bumps flow into plugin.json / marketplace.json / plugin-catalog.md | must pass (byte-clean) | must pass — regenerated trees' payloads validate |
| memory-codex-doc-drift | **yes** — MCP-TOOLS.md + codex `installDoc` mirrored | must pass | not implicated (runs as release gate) |
| arch-readme-truthing | **yes** — `docs-emit.ts` NOTES → 6 support-matrix.md | must pass | not implicated |
| skill-house-voice-doc-truthing | **yes** — 2 skill files → 14 mirrors | must pass; marketplace.json/catalog must stay byte-identical | not implicated |
| crew-flight-honesty-discoverability | **yes** — crew SKILL + USAGE (build then mint) | must pass | not implicated |
| mint-dead-code-false-green | no — CLI-stdout only | must pass **and report zero diff** (the scope proof) | not implicated |
| dead-code-glass-jig-graph | no — not a mint input | must pass (proves outside mint surface) | not implicated |
| jig-backlog-transition-hygiene | no — jig ships no mint plugin | unaffected | unaffected |
| add-readmes-jig-and-jig-graph | no — not a mint input | must stay unchanged (proves no regen triggered) | unaffected |

Six items trigger a `pnpm mint` regeneration (the four mint-mirrored content
items plus the two release-mechanics items). `pnpm provenance` is load-bearing
for exactly two: the packaging fix and version reconciliation; all others run it
only as the standard release-wide sweep.

## Discrepancies & already-merged

- **No spec is `still_valid=false`.** All ten hold against `main` @ `64304930`
  (or slightly later HEADs the specs cite).
- **Stale plan text — G5 is already merged.** `2026-09-04-v0.2.1-plan.md` Track 2
  lists **G5 (jig-worktree-guard EPIPE / PR #6)** as *open* work ("PR #6 is
  mergeable, one file … Review + merge; re-mint"). It is **merged**: commits
  `31a24c97` (drain-stdin fix), `0f314245` (plugins regen), `ffbf1bf6` (merge of
  PR #6). The roadmap doc (`2026-09-04-release-roadmap-0.2.1-0.3.0.md`) correctly
  records it as merged. The plan's G5 paragraph should be demoted to "carried in
  the release," matching B and G4 above it. (Sequencing item 2 of the plan
  already says the reproducibility items "are already merged" — the G5 body
  contradicts that same doc.)
- **Path drift the plan never updated: `fixing-a-code-review` → `fix-review`.**
  The plan (BL-5897265d07 line, and the version-reconciliation §2 example) still
  cites `packages/core/skills/fixing-a-code-review/SKILL.md`; commit `ccb9286f`
  ("rename 30 skills to short names") renamed it to `fix-review`, and there are
  **two** `BL-####` occurrences, not one. The skill spec already corrects this;
  the plan text is stale.
- **`publish.yml` "seven `@bubstack/moe-*` packages" comment is wrong.** The
  registry is **six** (`REGISTRY_PLUGIN_COUNT = 6`); the "seven" counts the
  non-registry `moe-mint` tool package. Flagged in both wire-release
  (§problem #5 context) and version-reconciliation §5; correct it to six.
- **Backlog-vs-plan wording corrected by the specs (findings still valid):**
  - mint-dead-code corrects the plan's claim that `rules`/`variables` render
    "into support-matrix.md" — they surface only in `renderSupportMatrix` CLI
    stdout, never in the generated file (`renderMatrix`). Dropping them yields
    **zero** `/plugins/` diff.
  - crew-flight corrects the plan/backlog premise that `MOE_CREW_PI_PROVIDER` is
    "absent from the README" — the crew README documents no env vars at all, so
    there is no sibling row; document it only in USAGE + SKILL.
  - memory-codex notes `packages/memory/docs/CODEX.md` is **not** mint-mirrored
    (only `MCP-TOOLS.md` and codex `installDoc` are), so CODEX.md does not gate
    `mint:check`.
- **Count guidance the plan half-states:** the plan's D1 line says "nine source
  packages / seven namespaces … 11 dirs exist"; the arch-readme spec resolves
  this to the authoritative **12 packages · 6 plugins · 8 namespaces** (11 dirs
  under `packages/` + `py/proof`).

## Out of scope (→ 0.3.0)

Deliberately excluded from 0.2.1 (per the plan's "Out of scope" and the roadmap):

- **Codex MCP emission (H1 / `BL-f4dac1becd`).** `emitCodexMcp` stays a staged,
  annotated seed in 0.2.1 (mint-dead-code); wiring it into `adapters/codex.ts`,
  flipping CODEX.md's "Planned for v0.3.0" section to present tense, and reverting
  the reframed codex-e2e test names are all H1.
- **End-to-end "after install the bootstrap fires" test** for the non-memory
  plugins (`BL-3ce1956bb4`) — the packaging spec ships presence/reachability
  checks only; the live post-install e2e is the 0.3.0 residual.
- **jig-graph `plan validate --manifest`** (`BL-b96fd965e2`) — advertised but its
  handler errors and exits 1; the new README names it as a non-completion, the
  implementation is 0.3.0.
- Any **new capability**: the skill pairs, robust e2e harness testing, the PM
  module, wiring review/fix skills to the backlog, the hardener skill, glass
  console auto-capture, memory tool-result capture, flight video.
- **Architecture track (0.3.x+, needs a spec first):** shared CDP
  transport/launcher/session package (glass ⇄ flight fork), shared harness-paths
  and usage/cost models, porting core's `latte:evals` into `proof`.
- **A committed umbrella/root version** — explicitly recommended against
  (version-reconciliation §4); the git tag remains the sole platform version. A
  guard that consumes it would be a prerequisite before ever adding the field.
