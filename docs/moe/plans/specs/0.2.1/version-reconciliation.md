# Version reconciliation for the 0.2.1 patch

Backlog ids: none (0.2.1 plan item **A#10**, `docs/moe/plans/2026-09-04-v0.2.1-plan.md` "Release mechanics") · Size: **S**

> Scope: this is a *policy + procedure* spec for how 0.2.1 assigns versions. It
> defines which packages bump, how the generated catalog stays coherent, and
> whether an umbrella version is wanted. It does **not** re-spec the packaging
> fix (`BL-d932811282`) — that item republishes complete trees; this item says
> what version each republished tree carries.

## Problem

Moe has **four** version surfaces per public plugin, split into two committed
*authorities* and two *generated* projections. Confirmed against `main`
@ `64304930`:

**Authorities (hand-edited, source):**

1. `packages/<pkg>/package.json` `version` — the npm-tarball version.
2. `packages/<pkg>/mint/<plugin>.yaml` `version` — the plugin-policy version.

These two are held equal by a hard gate. `packages/mint/src/platform/load.ts`
raises `PACKAGE_VERSION_MISMATCH` when they diverge:

> `packageMismatch('PACKAGE_VERSION_MISMATCH', config.name, 'version', config.version, sourceManifest.version, source)`

with the action `"Make the package-local Mint policy and source package.json
agree."` Platform resolution runs inside `pnpm mint`, so a divergence fails
`pnpm mint` / `pnpm mint:check`.

**Generated (never hand-edit — `pnpm mint` owns them):**

3. `/plugins/<id>/.claude-plugin/plugin.json` `version` — set from the mint-yaml
   value in `packages/mint/src/generate.ts` (`version: config.version`).
4. `.claude-plugin/marketplace.json` per-plugin `version` and
   `docs/moe/generated/plugin-catalog.md` — emitted by
   `packages/mint/src/platform/projections.ts` `renderMarketplace`
   (`version: record.plugin.version`) and `renderPluginCatalog`
   (`version: plugin.version`). Both are in the `mint:check` diff set (root
   `package.json` script `mint:check` diffs
   `plugins .claude-plugin/marketplace.json docs/moe/generated/plugin-catalog.md`).

**Current versions observed on `main` (the six registry plugins declared in
`moe-platform.yaml`):**

| plugin | package | package.json | mint yaml | marketplace.json / plugin.json |
|---|---|---|---|---|
| moe | @bubstack/moe-core | 0.1.6 | 0.1.6 | 0.1.6 |
| moe-backstory | @bubstack/moe-backstory | 0.1.6 | 0.1.6 | 0.1.6 |
| moe-memory | @bubstack/moe-memory | 0.2.0 | 0.2.0 | 0.2.0 |
| moe-glass | @bubstack/moe-glass | 0.1.6 | 0.1.6 | 0.1.6 |
| moe-crew | @bubstack/moe-crew | 0.1.6 | 0.1.6 | 0.1.6 |
| moe-statusline | @bubstack/moe-statusline | 0.1.2 | 0.1.2 | 0.1.2 |

Non-registry packages (published to npm but not plugins, not in
`moe-platform.yaml`/marketplace): `@bubstack/moe-jig` **0.1.4**,
`@bubstack/moe-jig-graph` **0.1.0**. Private (`"private": true`, unpublished):
`@bubstack/moe-flight` **0.0.0**, `@bubstack/moe-mint` **0.0.0**. Root
`package.json` is `"private": true` with **no `version` field**. `moe-platform.yaml`
has **no version field**. Repo tags run `v0.1.0`…`v0.1.4` (per the roadmap).

Two facts make reconciliation non-trivial:

- **The four surfaces are internally coherent per plugin, but the six plugins
  are incoherent with each other** (0.1.6 / 0.2.0 / 0.1.2). The v0.2.0 baseline
  plan (`docs/moe/plans/2026-09-04-v0.2.0-release-01-baseline.md`, Task 1
  "Synchronize six source version authorities") reconciles all six to `0.2.0`.
  **That sync has NOT landed on `main` yet** — it is the v0.2.0 release's job,
  not 0.2.1's. 0.2.1 assumes the `0.2.0` floor as its baseline
  (`2026-09-04-v0.2.1-plan.md`: "Baseline: `main` … assumes `v0.2.0` has shipped
  (six public packages at `0.2.0`)").

- **The release enforces "bump on change."**
  `packages/mint/src/release/catalog.ts` `requireVersionChangeForArtifactChange`
  throws `CATALOG_VERSION_UNCHANGED` ("plugin … artifact changed without a
  version change", action "Bump the plugin version when artifact bytes change")
  when a plugin's generated tree/manifest sha differs from the previous
  published catalog but its version did not move. So 0.2.1 **must** bump every
  plugin whose generated tree changes, and may leave the rest at `0.2.0`.

A#10 asks: which packages does 0.2.1 bump, how does the catalog stay coherent,
and is a root/umbrella version wanted (none exists today)?

## Change

### 1. Bump policy — per-plugin, "bump only what changed"

0.2.1 keeps per-plugin independent versions (the deliberate design: the baseline
plan states "Package manifests and package-local Mint YAML remain the version
authorities"). A plugin bumps to `0.2.1` **iff its generated tree
(`/plugins/<id>`) changes** relative to the `0.2.0` release; unchanged plugins
stay at `0.2.0`. When a plugin bumps, set **both** authorities together
(`packages/<pkg>/package.json` `version` **and**
`packages/<pkg>/mint/<plugin>.yaml` `version`) to `0.2.1` — the
`PACKAGE_VERSION_MISMATCH` gate forbids setting one without the other. Then
`pnpm mint` regenerates plugin.json, marketplace.json, and plugin-catalog.md.

There is no single-file bump for this monorepo: the standalone `moe-mint bump`
CLI (`packages/mint/src/bump.ts`) keys off a `moe-mint.yaml` config, which is not
how the six per-plugin yamls are named (`moe.yaml`, `moe-crew.yaml`, …), and no
root `bump` script is wired. Edit the two authorities directly (or with a
scripted per-package sed), then `pnpm mint`.

### 2. The change set — deterministic procedure, not a guess

Run this **after** all non-version 0.2.1 content edits (doc-truthing, dead-code,
the mint matrix change) have landed on the release branch:

1. `pnpm mint` — regenerate `/plugins/`, `marketplace.json`, `plugin-catalog.md`.
2. `git status --porcelain -- plugins/` — the set of `plugins/<id>` directories
   with a diff **is** the set of plugins to bump.
3. For each changed plugin, set `packages/<pkg>/package.json` and
   `packages/<pkg>/mint/<plugin>.yaml` `version` to `0.2.1`.
4. `pnpm mint` again — the version now flows into that plugin's plugin.json,
   its marketplace.json row, and plugin-catalog.md.
5. `pnpm mint:check` must be byte-clean.

**Expected result given the 0.2.1 plan's content: all six bump to `0.2.1`.**
Every plugin tree carries its own generated `docs/support-matrix.md`
(confirmed: `plugins/{moe,moe-backstory,moe-crew,moe-glass,moe-memory,moe-statusline}/docs/support-matrix.md`).
Two 0.2.1 items rewrite that file for **every** tree:

- **A#2/A#9** — dropping the `ComponentSupport.rules`/`variables` columns from
  `packages/mint/src/adapters/types.ts`, rendered by `matrix.ts`
  `renderSupportMatrix` into each `support-matrix.md`.
- **D3** — adding the certify/preview tiering + MCP-degradation warning to the
  generated `support-matrix.md` Notes.

Either one changes all six trees, so all six bump. Plugin-specific edits
(e.g. `BL-5897265d07` rewrites `packages/core/skills/fixing-a-code-review/SKILL.md`
→ `plugins/moe`; D2 rewrites memory docs → `plugins/moe-memory`) only reinforce
that. If the matrix/D3 items are cut from 0.2.1, re-run step 2 to recompute the
smaller set — the procedure is the contract, not the "all six" outcome.

Note: `docs/moe/generated/plugin-catalog.md` is a single top-level file listing
every plugin's version; it changes on **any** plugin bump. `git diff` on it is
not a per-plugin change signal — use `plugins/<id>` (step 2).

Note: repo-root prose edited by **D1** (`ARCHITECTURE.md`, `README.md`) is **not**
inside any plugin tree, so D1 alone forces **no** bump.

### 3. Catalog coherence

`marketplace.json`, each `plugin.json`, and `plugin-catalog.md` are 100%
generated from the two authorities via `pnpm mint`; coherence is therefore
mechanical, not manual — **never hand-edit them** (repo law #1). `pnpm mint:check`
proves they are byte-reproducible from source. At release time the platform
catalog (`packages/mint/src/release/catalog.ts` `platformCatalogSchema`, pinned
to exactly six plugins via `plugins: z.array(...).length(6)` and
`REGISTRY_PLUGIN_COUNT = 6`) records each plugin's version + artifact shas;
`requireVersionChangeForArtifactChange` and the candidate preflight
(`release/candidate.ts` `CANDIDATE_VERSION_MISMATCH`) are the runtime gates that
catch any plugin whose bytes moved without a version bump.

### 4. Umbrella / root version — recommendation: **do not add one**

There is already a de-facto umbrella version: the **git tag**. `v0.2.1` is parsed
by `packages/mint/src/release/tag-policy.ts` `parsePlatformTag` into
`PlatformTag.platformVersion`, which becomes `platform_version` on every release
catalog, preflight, and candidate lock. It lives only in release artifacts
injected from the tag — not on disk.

Recommend keeping it that way. A committed umbrella field (in root
`package.json` or `moe-platform.yaml`) would be a **fifth** version surface with
a new drift class and **no gate that consumes it** — nothing on disk reads a
platform version. It would also fight the per-plugin "bump only what changed"
model, implying lockstep bumps that `CATALOG_VERSION_UNCHANGED` is designed to
avoid. The per-plugin tag→`platform_version` binding via the preflight
`proposed_version` (compared against each plugin's own version, never against the
tag) means a plugin may sit at `0.2.0` under a `v0.2.1` platform tag — which is
exactly what "bump only what changed" needs.

The **only** action here is documentation: make the tag-as-umbrella convention
explicit. Add one paragraph to `ARCHITECTURE.md` (release section) stating that
`v<X.Y.Z>` is the platform/umbrella version, that per-plugin versions float
beneath it, and that no committed umbrella authority exists by design. This can
ride the D1 doc-truthing edit (same file) rather than being a separate change.

### 5. Related doc catch (optional, in-scope for release mechanics)

`.github/workflows/publish.yml`'s header comment says it publishes "the **seven**
`@bubstack/moe-*` packages" — the registry (`moe-platform.yaml`) and CLAUDE.md
both say **six**, and the workflow carries no literal package list (it resolves
the six from the registry). Correct the comment to "six". One-line prose fix,
no gate impact; fold into D-cluster doc-truthing if convenient.

## Files touched

Authorities (source) — only the plugins the change set (§2) identifies; expected
all six under the current 0.2.1 content:

- `packages/core/package.json` (source) + `packages/core/mint/moe.yaml` (source)
- `packages/backstory/package.json` + `packages/backstory/mint/moe-backstory.yaml` (source)
- `packages/memory/package.json` + `packages/memory/mint/moe-memory.yaml` (source)
- `packages/glass/package.json` + `packages/glass/mint/moe-glass.yaml` (source)
- `packages/crew/package.json` + `packages/crew/mint/moe-crew.yaml` (source)
- `packages/statusline/package.json` + `packages/statusline/mint/moe-statusline.yaml` (source)

Tests (source) — the three that pin real registry versions:

- `packages/mint/test/cli.test.ts` (source) — case "prints the ephemeral
  registry publish matrix as canonical JSON without writing a matrix file"
- `packages/mint/test/publish-matrix.test.ts` (source) — case "resolves one
  deterministic publish entry for every registry plugin"
- `packages/mint/test/public-registry.test.ts` (source) — case "resolves each
  public package with its canonical metadata and target policy"

Docs (source, optional per §4/§5):

- `ARCHITECTURE.md` (source) — tag-as-umbrella note (ride D1)
- `.github/workflows/publish.yml` (source) — "seven" → "six" comment

Generated (regenerated by `pnpm mint` — **do not hand-edit**; **`pnpm mint` must
re-run and `/plugins/` is regenerated**):

- `/plugins/<id>/.claude-plugin/plugin.json` for each bumped plugin (generated)
- `.claude-plugin/marketplace.json` (generated)
- `docs/moe/generated/plugin-catalog.md` (generated)
- `/plugins/<id>/docs/support-matrix.md` for each tree the content items touch (generated)

Not touched: `release-catalog.test.ts`, `release-candidate.test.ts`,
`bump.test.ts`, `platform-resolution.test.ts` — all use synthetic fixtures
(`0.1.5`/`0.1.1`/`0.1.0`/`1.0.0`/`9.0.0`), not real repo versions.
`packages/core/test/metadata.test.ts` (guarded) carries no version literal —
stays green.

## Acceptance

- Every plugin whose `/plugins/<id>` tree changed vs `0.2.0` reads `0.2.1` in
  both authorities and in all generated projections; unchanged plugins stay at
  `0.2.0`. No plugin has a mismatched authority pair.
- `pnpm check` green (runs the three updated tests via turbo).
- `pnpm mint:check` green — `/plugins/`, `marketplace.json`, and
  `plugin-catalog.md` are byte-reproducible from the bumped authorities (proves
  no hand-edit and no drift).
- `pnpm provenance` green — LICENSE/NOTICE payloads in the regenerated trees
  validate (packaging item `BL-d932811282` also gates on this).
- Release-time (CI `publish.yml`, not local): the candidate build for `v0.2.1`
  passes `CANDIDATE_VERSION_MISMATCH` and `CATALOG_VERSION_UNCHANGED` — i.e.
  every plugin whose artifact bytes changed carries a bumped version.
- Grep guard: `grep -rn "version" packages/mint/test/{cli,publish-matrix,public-registry}.test.ts`
  shows the new per-plugin versions and no stale `0.1.6`/`0.1.2`.

## Test plan

1. Update the three version-pinned expectations to the post-bump versions:
   - `packages/mint/test/cli.test.ts` — the six-row `expect(JSON.parse(result.stdout)).toEqual([...])` block in "prints the ephemeral registry publish matrix …".
   - `packages/mint/test/publish-matrix.test.ts` — the six-row `expect(matrix).toEqual([...])` block in "resolves one deterministic publish entry for every registry plugin".
   - `packages/mint/test/public-registry.test.ts` — the six per-plugin `version:` literals in "resolves each public package with its canonical metadata and target policy".
   Each row's `version` becomes `0.2.1` for a bumped plugin (all six under the
   expected change set), `0.2.0` otherwise.
2. `pnpm --filter @bubstack/moe-mint test` — the three cases pass against the
   bumped authorities.
3. `pnpm mint:check` — generated projections match.
4. No new test file is required; the reconciliation is asserted by the existing
   three cases plus the release-time catalog gates.

## Sequencing & dependencies

1. **Precondition (blocking): the `0.2.0` floor must exist on the release
   branch.** `main` @ `64304930` still shows 0.1.6/0.2.0/0.1.2. The v0.2.0
   baseline sync (`2026-09-04-v0.2.0-release-01-baseline.md` Task 1) must land
   first. If 0.2.1 is branched before `v0.2.0` ships, that sync is a prerequisite
   commit, not part of A#10.
2. **This item runs LAST within 0.2.1**, after every content change (packaging
   `BL-d932811282`, dead-code A#2/A#9/A#17/A#18, doc-truthing D1–D5, honesty
   A#14/A#15/A#20). Bumping first and editing after would leave `mint:check`
   dirty or force a re-bump. The bump is the final commit before tagging `v0.2.1`.
3. Runs **serially after** the mint-package matrix change (A#2/A#9) because that
   change alters `renderSupportMatrix` output in every tree — it defines the
   change set. Do not compute the set (§2 step 2) until it has landed.
4. The umbrella-doc note (§4) and the publish.yml comment fix (§5) are
   independent and can land any time in the release; ideally folded into D1/D-cluster.
5. Whether a *previous published `0.2.0` catalog* exists governs the
   `CATALOG_VERSION_UNCHANGED` baseline: if 0.2.0's `--execute` paths threw
   `*_EXECUTE_NOT_WIRED` (they do on `main`, per `BL-d932811282`), no `0.2.0`
   platform catalog was published, so `detectChangedPlugins` sees
   `previous === undefined` and marks all six changed (and
   `requireVersionChangeForArtifactChange` no-ops). Either way the §2 procedure
   is correct; this only affects whether the release *forces* the bump or the
   spec does.

## Risks

- **R1 — bumping before content settles.** Editing a plugin's tree after its
  version bump leaves `mint:check` dirty and needs a re-bump. Mitigation:
  strict sequencing (§ Sequencing 2–3); run the §2 procedure once, at the end.
- **R2 — partial bump / authority skew.** Setting `package.json` without the
  matching mint yaml (or vice versa) fails `pnpm mint` with
  `PACKAGE_VERSION_MISMATCH`. Mitigation: always edit the pair together; the
  gate catches it before merge.
- **R3 — stale test pins.** The three version-pinned tests fail loudly if not
  updated, and pass silently if a plugin is bumped but its row is left at
  `0.2.0` and that plugin genuinely didn't change. Mitigation: derive the new
  expected rows from the §2 change set, not from memory; the acceptance grep
  guard catches leftover `0.1.x`.
- **R4 — under-bump escapes local gates.** `CATALOG_VERSION_UNCHANGED` fires at
  release time (CI), not in `pnpm check`, so a changed-but-unbumped plugin can
  pass locally and fail the tag build. Mitigation: run the §2 `git status`
  check as the authoritative signal; treat a non-empty `plugins/<id>` diff as a
  mandatory bump.
- **R5 — scope creep toward an umbrella version.** Adding a committed platform
  version later would create a drift surface no gate reads. Recommendation:
  keep the tag as the sole umbrella; if revisited, add a *gate* that consumes it
  before adding the field.
