# @bubstack/moe-mint

Generate native plugin manifests for every harness from one config. Ten
adapters covering ten harnesses, from a single `moe-mint.yaml`: Claude Code,
Codex, Cursor, Copilot CLI, OpenCode, Pi, Kimi Code, Hermes, Devin CLI, and
Factory Droid.

Not a plugin. A CLI (`moe-mint`) and the monorepo's eventual plugin build step —
it is the thing that will read `packages/core` and `packages/backstory` as data
and write `/plugins/`. **That wiring is not done.** This import brings the tool
in working; adopting it across the content packages is separate work.

Usage and the full `moe-mint.yaml` reference: [docs/CONFIG.md](docs/CONFIG.md).
What it is and who it's for: [docs/BROCHURE.md](docs/BROCHURE.md).

**Status:** imported. The vitest suite passes on a bare checkout, with the
dogfood suite skipping unless the pinned `superpowers` reference snapshot in
`../.moe-references/` is present. Suite/test counts drift as adapters are
added or removed; run `pnpm --filter @bubstack/moe-mint test` for the live
number.

## Forked from

| Upstream repo | Pinned | License |
|---|---|---|
| `everyharness` | `4f7c5e2` | MIT |
| `everyharness-container` | `2467bd7` | MIT |

MIT, not the scaffold's stated Apache-2.0 — the inbound license governs, and
upstream's `LICENSE` (Copyright © 2026 Prime Radiant, Inc.) is retained
verbatim.

**`everyharness-container` is not in this package.** Its five files go to
[`infra/container/`](../../infra/container/) — a Dockerfile and a `bin/`
entrypoint, consumed by `moe-mint test` over the docker CLI, not by import. See
that directory's README.

## Layout

```
src/                 The CLI. 10 adapters + config, model, generate, validate,
                     manifest, bump, init, import, docs-emit, matrix, test.
src/adapters/        One per harness. Each emits a FileSet and its install doc.
schemas/             Three vendored third-party JSON Schemas (Claude Code's plugin
                     manifest, the agent-plugins 1.0 plugin + mcp schemas).
                     Untouched — not ours, and brand-free.
checks/run-checks.sh 732 lines of bash. The container-side install checks.
fixtures/kitchen-sink/  The synthetic plugin every adapter suite emits against.
test/                29 vitest suites (427 tests).
docs/CONFIG.md       Usage + config reference. Was upstream's README.md.
docs/BROCHURE.md     What it is and who it's for.
docs/history/        Upstream plans, specs, and its v1.0.0 landing page.
                     Inherited record — see below.
```

## What changed on import

**`tests/` → `test/`.** Matches `packages/glass` and the root biome config's
`**/packages/*/test/manual/**` glob. Nine comment references were re-pointed;
`test/dogfood.test.ts` keeps one `tests/` mention because it describes
*superpowers'* tree, not ours.

**One vitest project, not two.** Every suite here is CI-safe and offline: the
container command is exercised through a `docker` shim planted on `PATH` rather
than a real daemon, and no suite needs a browser or a network service. Upstream's
`globalSetup` (build `dist/` once before any suite, so the four CLI-spawning
suites don't race each other's `tsc`) is kept, switched from `npm` to `pnpm`.
It is redundant under `turbo run test`, which already has `dependsOn: ["build"]`,
but it keeps a bare `pnpm --filter @bubstack/moe-mint test` working.

**`TOOL_VERSION` 1.0.0 → 0.0.0.** It is written into every generation manifest
as `tool: moe-mint@<version>`, and `test/smoke.test.ts` asserts it equals
`package.json`'s version. The workspace is unreleased, so 0.0.0 is the honest
value and the invariant survives.

**Node 20 → Node 24** in `engines`, matching the workspace root.

**The dogfood suite was re-pointed and now runs.** Upstream defaulted it to
`/home/jesse/git/superpowers/superpowers` and read `git archive dev` — a live
branch tip, deliberately, as a drift tripwire. Here it defaults to the pinned
`superpowers` @ `b36e082` reference snapshot (`../.moe-references/`, resolved
relative to the repo root) and reads `git archive HEAD`, because a shallow
reference clone has one commit on `main`. That converts it from a drift tripwire
into a pinned regression test, which is what PARITY.md's "snapshots are the spec,
not upstream HEAD" asks for. All eight comparisons pass: `moe-mint` reproduces
every one of superpowers' hand-maintained manifests. `MOE_MINT_DOGFOOD_REPO`
overrides the location; the suite skips when the snapshot is absent, which is the
case in CI.

**Its target stays upstream superpowers, on purpose.** The invariant is
"`moe-mint` reproduces manifests a human maintained by hand". `packages/core` —
the rebranded superpowers — will have its manifests *generated* by `moe-mint`,
so pointing the suite there would make it compare mint's output against mint's
output. Upstream is the only place this claim is falsifiable.

**Two real dead-code findings, both fixed.** `src/generate.ts` imported `join`
from `node:path` and never used it (biome `noUnusedImports`). `src/docs-emit.ts`'s
`injectReadme` takes a `PluginModel` it never reads — that one is *documented* as
deliberate ("threaded through for parity with `emitDocs`'s signature"), so it
stays, and it is why the biome override this package needs sets
`noUnusedFunctionParameters` to `warn` rather than `error`.

**Ten strict-base errors in `src/`, all fixed properly.** No casts, no
per-package `compilerOptions` escape hatch. Six were `exactOptionalPropertyTypes`
telling the truth about code that assigns `T | undefined` into a `?: T` property
(`MintConfig`'s metadata fields, `CommandRef`/`AgentRef`'s frontmatter fields,
`GeneratedFile.executable`); those got an explicit `| undefined`, and
`MintConfig.marketplace`/`.release` now infer from their zod schemas instead of
restating them by hand. Four were `noUncheckedIndexedAccess` on indexed reads
the code could not prove: a regex capture group, two `segments[i]` walks in
`field-edit.ts`, `doc.errors[0]`, `plugins[0]`, and `part[0]` after a
`.filter(Boolean)`. None was a latent bug — unlike glass, which found one.

**The test suites are typechecked, which upstream never did.** Upstream's
`tsconfig.json` was `include: ["src"]`, so 6.5k lines of TypeScript test code
never met a compiler. A second project, `tsconfig.tests.json` (non-composite,
`noEmit`), now covers `test/**` under the same strict base. That surfaced 40
errors, all `noUncheckedIndexedAccess` on fixture lookups. The fix is a shared
`test/helpers.ts` with `byPathMap` and `mustGet`: ten adapter suites built the
same `Object.fromEntries` path→content map and indexed it directly, so a path
typo or a dropped emission surfaced as `JSON.parse(undefined)` — "Unexpected
token 'u'" — instead of naming the missing path. `mustGet` throws with the path
and the list of what *was* emitted.

Four `expect(x).toBeDefined()` lines went away with that change (hermes ×2, pi,
opencode). Each was a guard inside a test whose *subject* was something else
("has the marker as line 1"), and each is now enforced harder: `mustGet` at the
describe scope fails the whole file, not one case. Every `it` block, and every
assertion that was the point of one, is still there.

**Not imported:** `package-lock.json`, upstream's `.gitignore`, upstream's
`tsconfig.json` (the root base governs; its settings are recorded below), and
`.github/workflows/ci.yml` — one job: `npm ci && npm run build && npm test` on
Node 22. `everyharness-container`'s `.github/workflows/build.yml` (build and push
the image to GHCR) is likewise not ported. Both collapse into the root
`.gitlab-ci.yml`. There was no `.private-journal/` and no `.claude-plugin/` in
either repo.

## Rebrand, and what was deliberately left alone

744 substitutions in the bulk pass, plus a 37-substitution corrective pass on
fixture URLs and a handful of hand fix-ups. The interface-breaking ones:

| Kind | Upstream | Moe |
|---|---|---|
| bin | `everyharness` | `moe-mint` |
| config file | `everyharness.yaml` | `moe-mint.yaml` |
| state dir | `.everyharness/manifest.json` | `.moe-mint/manifest.json` |
| generated hooks dir | `hooks/everyharness/` | `hooks/moe-mint/` |
| README markers | `<!-- everyharness:install:{start,end} -->` | `<!-- moe-mint:install:{start,end} -->` |
| generated-file marker | `GENERATED by everyharness — edit everyharness.yaml instead` | `GENERATED by moe-mint — edit moe-mint.yaml instead` |
| manifest tool field | `everyharness@<version>` | `moe-mint@<version>` |
| env var | `EH_PLUGIN_NAME`, `EH_PLUGIN_ROOT` | `MOE_MINT_PLUGIN_NAME`, `MOE_MINT_PLUGIN_ROOT` |
| env var | `EH_SUPERPOWERS_REPO` | `MOE_MINT_DOGFOOD_REPO` |
| exported type | `EveryharnessConfig` | `MintConfig` |
| container image | `ghcr.io/prime-radiant-inc/everyharness-container` | `registry.gitlab.tcdevops.com/Zak/moe/moe-container` |

Every one of the first five is a **breaking change for any plugin already
generated by upstream**: the config file has to be renamed, the state directory
is not found so `validate` reports "no generation manifest", and the old
`hooks/everyharness/` tree becomes stale files `generate` will prune. Nothing in
Moe is in that position yet, which is exactly why the cut is taken now.

Also renamed: 132 test temp-directory prefixes from `eh-*` to `mint-*`, the
fixture author (`Prime Radiant` → `Bubstack`, `dev@prime-radiant.example` →
`dev@bubstack.example`), and upstream's planning-doc paths
(`docs/superpowers/{plans,specs}/` → `docs/history/`).

**The container image reference is still an assumption, though a narrower one.**
The project path `Zak/moe` is confirmed as of 2026-08-31 (ARCHITECTURE.md §8), so
that half of the ref is real. Nothing has been pushed to
`registry.gitlab.tcdevops.com`, and the registry hostname for a self-hosted
GitLab is a per-instance setting (`registry.<host>` vs `<host>:5050`), so the ref
as a whole remains a default to correct rather than a fact.
`moe-mint test --image <ref>` overrides it.

**The kitchen-sink fixture's `repository` is a placeholder, not self-reference.**
It is now `https://github.com/example/kitchen-sink`, matching the fixture's
existing `https://example.com/kitchen-sink` homepage. Pointing it at
`gitlab.tcdevops.com/Zak/moe` would claim the fixture is Moe, and it would
also move the fixture off the `github.com` branch of `githubOwnerRepo()` that
four adapters' install docs depend on — which is how the GitLab-slug gap below
was found in the first place. The four `github.com/obra/…` URLs in
`test/adapters/agents-marketplace.test.ts` are fixture data too, and became
`github.com/example/…`.

**Provenance statements in code comments stay.** Seven comments in `src/` explain
that an emitter's shape was reverse-engineered from superpowers' own
hand-written files — `.hermes-plugin/__init__.py`, `.opencode/plugins/
superpowers.js`, `.pi/extensions/superpowers.ts`. Rewriting those to say
"moe-core's own" would be false: `moe-core` has no such files, `moe-mint`
generates them. This is the same rule the URLs follow — provenance preserved,
self-reference rewritten — applied to prose. The one exception: two comments said
"Jesse's call" and "Jesse's ruling". The fact each records is kept; the first
name is now "the upstream author", because this fork has no reachable upstream
author for a reader to consult.

**`LICENSE` and `docs/history/` are untouched.** They describe a project that
*was* called everyharness. That includes the five history filenames that carry
the name (`2026-08-10-everyharness-design.md` and four others) — the bulk pass
renamed them and a fix-up pass put them back.

**`docs/index.html` was relocated, not rebranded.** It is upstream's v1.0.0
brochure site — a GitHub link, GHCR pull commands, npm-publication claims,
"claims verified @ 34526db". Rebranding it would produce a landing page for a
product Moe does not ship to anyone. It is now
`docs/history/UPSTREAM-BROCHURE-PAGE.html`, verbatim.

**Upstream's `README.md` became `docs/CONFIG.md`**, rebranded, because it was the
config reference of record and that is live behavior, not history. Its v1.0.0
release framing was dropped. This file records the import instead — same split
`packages/glass` uses, with a different starting shape.

**`checks/run-checks.sh` and the fixture keep their names.** `run-checks.sh`
describes what it is. So do `kitchen-sink`, the ten adapter names, and the
`.claude-plugin` / `.codex-plugin` / `.hermes-plugin` output paths — those last
are the harnesses' formats, not ours to rename.

## Toolchain

| Concern | Upstream | Here |
|---|---|---|
| Package manager | npm | pnpm 11 (workspace) |
| Test runner | vitest 3 | vitest 3 — unchanged |
| Build | `tsc` | `tsc -b` (composite, project references) |
| TypeScript | ^5.9.0 | ^5.9.0 — unchanged |
| Lint / format | none | biome 2, with the override below |

Upstream's `tsconfig.json` was `strict: true` and nothing more — no
`noUncheckedIndexedAccess`, no `exactOptionalPropertyTypes`, no
`verbatimModuleSyntax`, `target: ES2022`, `include: ["src"]`. It is not carried
over; `tsconfig.base.json` governs, and the ten errors that produced are listed
above.

Runtime dependencies, all upstream's: `commander` (CLI), `yaml`
(comment-preserving edits for `bump`), `zod` v4 (config schema), `ajv` (validates
generated manifests against the vendored schemas). None has a postinstall
script, so `pnpm-workspace.yaml`'s `allowBuilds` needs no entry.

## Root changes this package needs

Not made here — five agents are importing concurrently. See the structured
report; the load-bearing one is a `biome.json` override for
`**/packages/mint/**`, mirroring the `packages/glass` one: formatter off, assist
off, `linter.rules.recommended: false` plus the five rules glass keeps. Upstream
shipped no biome config at all, so it ran no formatter and no linter. With that
override the package is lint-clean (one deliberate warning, above). Without it,
`biome check packages/mint` reports 122 errors and 94 warnings — entirely
upstream's single-quote, no-semicolon style.

## Follow-ups

- **Install-doc URLs are wrong for GitLab.** `githubOwnerRepo()`
  (`src/adapters/shared.ts`) shortens a repository URL to an `owner/repo` slug
  only for `github.com`. Moe is on `gitlab.tcdevops.com`, so the claude-code,
  devin, hermes and pi install docs will emit a `<your-repo>` placeholder
  instead of a working command — and pi's template hardcodes
  `pi install git:github.com/${repo}`, which would be wrong even with a slug.
  The upstream behavior is deliberate (never fabricate a listing); the fix is to
  generalize the host, not to loosen it.
- **Nothing is wired to `/plugins/` yet.** No content package has a
  `moe-mint.yaml`, `pnpm mint` at the root is a scaffold script that would run
  `generate` with `packages/mint` as the working directory, and mint has no
  concept of reading N content packages into one plugin. ARCHITECTURE.md §2's
  "lean `moe-core` / full `moe-everything`" split is the design; this package
  currently generates one plugin per config file.
- **`checks/run-checks.sh` is 732 lines of untested-in-CI bash.** Seven suites
  exercise it locally against the fixture with no harness CLIs on `PATH`, where
  every deep check degrades to `skip`. The install checks that matter have only
  ever run inside the container image, which does not exist yet.
- **`init` writes a `getting-started` skill whose content is upstream's.**
  Not audited during this import; `src/init.ts` is the only place that authors
  prose a user will read.
