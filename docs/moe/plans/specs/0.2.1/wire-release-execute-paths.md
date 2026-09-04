# Wire release `--execute` paths so published tarballs carry the manifest + LICENSE

Backlog: BL-d932811282 (CRITICAL, 0.2.1 priority 1) · Size: **L**

Lead item for the 0.2.1 patch: everything else republishes with it.

## Problem

The release orchestration functions are implemented and unit-tested, but **nothing in
production calls them**. All three `release … --execute` CLI handlers throw a
`*_NOT_WIRED` `MintError` instead of invoking the real code, so a tagged publish run
produces no complete tarballs.

Verified against main @ `64304930`.

**`release candidate --execute`** — `packages/mint/src/cli.ts`, the `.command('candidate')`
action:

```ts
if (!opts.execute) { console.log(`candidate: would prepare candidate ${opts.tag} …`); return }
throw new MintError({ …, code: 'CANDIDATE_EXECUTE_NOT_WIRED',
  message: 'release candidate --execute is not wired to candidate preparation yet',
  action: '… See prepareCandidate in packages/mint/src/release/candidate.ts.' })
```

**`release certify-claude --execute`** throws `CERTIFY_CLAUDE_EXECUTE_NOT_WIRED` (after
validating the ten producer-identity flags); **`release promote --execute`** throws
`PROMOTE_EXECUTE_NOT_WIRED`. Same file, same shape.

The three orchestrators they name all exist with stable signatures and full fake-backed
test suites (`packages/mint/test/release-candidate.test.ts`,
`release-promotion.test.ts`, `release-claude-maintenance.test.ts`):

- `prepareCandidate(input: CandidateInput, deps: CandidatePreparationDeps)` —
  `packages/mint/src/release/candidate.ts`. Packs each `artifact.artifactRoot`, uploads
  tarballs + lock + catalog + checksums + bundle inventories to a GitHub **draft**
  release, returns `{ lock, catalogContent, release }`. It does **not** publish to npm.
- `promoteToStable(input: PromotionInput, deps: PromotionDeps)` —
  `packages/mint/src/release/promotion.ts`. Validates certification evidence for all six
  plugins (`validateEvidenceForPromotion`), inspects npm registry state, computes
  dist-tag actions, mirrors tarballs to a stable release, and moves each package's
  `latest` dist-tag (`deps.npmRegistry.setDistTag(pkg, version, 'latest')`).
- `runClaudeMaintenance(input: ClaudeMaintenanceInput, driver: TargetLifecycleDriver)` —
  `packages/mint/src/release/claude-maintenance.ts`. Runs install/discover/update/
  invoke/uninstall per plugin through a `TargetLifecycleDriver` and writes
  `CertificationEvidenceV1` reports.

The design the backlog credits is real: `checkArtifactSet` in
`packages/mint/src/artifact/check.ts` sets `artifactRoot = join(platform.repositoryRoot,
'plugins', plugin.id)` — the **committed generated tree**. On disk that tree is already
complete: `plugins/moe/` carries `.claude-plugin/plugin.json`, `LICENSE`, `NOTICE`,
`package.json`, `.moe-mint/manifest.json`, and every harness dir (`.claude-plugin`,
`.codex-plugin`, `.cursor-plugin`, `.kimi-plugin`, `.opencode`, `.pi`, `.agents` for
agent-plugins-1.0; copilot reuses claude-code per `moe-platform.yaml`
`copilot … requires: [claude-code]`). So packing `plugins/<id>` yields a complete
artifact — the wiring just has to pack it and publish it.

**The gap is larger than three one-line calls.** No production code assembles the inputs
these orchestrators require, and no production code performs the npm publish:

1. **No `ReleasePreflightV1` builder.** `prepareCandidate` and `runClaudeMaintenance`
   both consume a preflight (proposed + predecessor npm state per plugin), but
   `release preflight` in `cli.ts` only `console.log`s — it produces nothing.
2. **No `CandidateArtifactInput[]` builder.** Needs, per plugin: `plugin`
   (`ResolvedPlugin`), `artifactRoot`, `expected` (`ExpectedArtifactContext`),
   `bundleInventory`, `treeSha256`, `manifestSha256`.
3. **No npm publish call.** `ProductionNpmRegistry.publishTarball(path, 'next')`
   (`packages/mint/src/release/npm-registry.ts`) has **zero callers** — confirmed by
   grep. `prepareCandidate` only uploads to the GitHub mirror. Without this step nothing
   reaches npm, which is where the marketplace (`.claude-plugin/marketplace.json`,
   `"source": "npm"`) installs from.
4. **No production `TargetLifecycleDriver`.** Only the interface exists
   (`claude-maintenance.ts`), so `certify-claude --execute` has nothing real to run, and
   `promoteToStable` hard-requires the evidence that certification produces
   (`validateEvidenceForPromotion` demands a `certified`/`preview` tuple for all six).
5. **`publish.yml` references commands/scripts that do not exist.** The candidate job
   runs `pnpm memory:artifact:test` (not a root script — only `memory:runtime:smoke` and
   `memory:recovery:check` exist) and `release verify-memory-evidence` (not a registered
   CLI subcommand — the registered set is init/import/generate/validate/matrix/assemble/
   publish-matrix/check-artifacts/test/bump and release {candidate,preflight,
   certify-claude,promote,verify}). Both steps fail before `candidate --execute` runs.

Publishable plugins (exactly six, `REGISTRY_PLUGIN_COUNT = 6`, from `moe-platform.yaml`):
`moe`, `moe-backstory`, `moe-memory`, `moe-glass`, `moe-crew`, `moe-statusline`.
(The "seven `@bubstack/moe-*` packages" in `publish.yml`'s header counts the `moe-mint`
tool package, which is not a registry plugin and is not carried in the catalog.)

## Change

Add one production orchestration module and wire the CLI to it. Do **not** change the
three orchestrator signatures — they are guarded by passing test suites.

### New module: `packages/mint/src/release/orchestrate.ts` (source)

Exports the input-assembly helpers and the three high-level runners the CLI calls.

**`buildPreflight(platform, tag, npmRegistry): Promise<ReleasePreflightV1>`**
For each of the six plugins: `proposed_version` = the plugin's resolved version;
`proposed` and `predecessor` from `npmRegistry.inspectVersion(pkg, version)` /
`inspectDistTags(pkg)`. `platform_version` = `tag.platformVersion`,
`source_sha` = the release source SHA. This is the single preflight object threaded into
both `prepareCandidate` and `runClaudeMaintenance`, satisfying their
`CANDIDATE_PREFLIGHT_MISMATCH` / `MAINTENANCE_PREFLIGHT_MISSING` guards.

**`buildCandidateArtifacts(platform): Promise<readonly CandidateArtifactInput[]>`**
Mirror `resolveExpectedContext` from `artifact/check.ts`. For each plugin:
- `artifactRoot = join(platform.repositoryRoot, 'plugins', plugin.id)` (the committed
  tree — identical to `check.ts`).
- `expected` via the same `currentProjectionRecords(platform)` → per-target
  `emitted_capabilities` construction `check.ts` already uses.
- `treeSha256` / `manifestSha256`: read `plugins/<id>/.moe-mint/manifest.json`;
  `treeSha256 = readArtifactManifest(artifactRoot).tree_sha256`,
  `manifestSha256 = sha256(<raw manifest.json bytes>)`.
- `bundleInventory`: the same inventory `assemble.ts` records, via
  `packages/mint/src/artifact/bundle-inventory.ts`.

**`runCandidate({ repo, tag, sourceSha, env }): Promise<void>`** — backs
`candidate --execute`:
1. `platform = await resolvePlatform(repo)`; `tag = parsePlatformTag(rawTag)`; assert
   `tag.channel === 'prerelease'`.
2. `npmRegistry = new ProductionNpmRegistry(buildNpmCommandRunner())`;
   `releases = new GitHubReleaseAdapter({ owner, repo, token })` (owner/repo from
   `GITHUB_REPOSITORY`, token from `GITHUB_TOKEN`/`GH_TOKEN`).
3. `preflight = await buildPreflight(...)`; `artifacts = await buildCandidateArtifacts(platform)`.
4. `publishMatrix = resolvePublishMatrix(platform, currentProjectionRecords(platform))`.
5. `lockfileSha256 = sha256(pnpm-lock.yaml)`; `registrySha256 = sha256(moe-platform.yaml)`;
   `mintVersion = TOOL_VERSION`; `previous` = prior stable catalog if the prior release
   exists (else `undefined` for genesis).
6. `deps = { pack: packArtifactOnce-adapter, verify: verifyPackedArtifact-adapter, releases }`
   — adapt the `deps.pack(artifactRoot, outputDir, expected)` /
   `deps.verify(tarballPath, expected)` shapes to `pack.ts`'s `packArtifactOnce` /
   `verifyPackedArtifact`.
7. `const { lock } = await prepareCandidate(input, deps)`.
8. **npm publish** (the missing step): for each changed plugin, resolve its packed
   `.tgz` path (`<outputDir>/tarballs/<id>/<mirror.asset>`) and call
   `npmRegistry.publishTarball(path, 'next')`. Use `computeResumeActions(lock, snapshots)`
   + `publishableActions` from `packages/mint/src/release/recovery.ts` so re-runs are
   idempotent (`accept-existing` when npm already has the exact integrity; `block` on
   mismatch) rather than double-publishing.

**`runPromote({ repo, tag, env })`** — backs `promote --execute`: load the candidate
catalog + lock from the prior prerelease release, build `evidenceReports` /
`evidenceExpectations` (from the certification evidence assets), download candidate
tarballs, then call `promoteToStable`. Moves `latest` to the new version for all six
packages.

**`runCertifyClaude({ candidate, repo, producer })`** — backs `certify-claude --execute`:
build preflight + catalog, download candidate tarballs, then call
`runClaudeMaintenance(input, driver)`. **Requires a production `TargetLifecycleDriver`**
(see Sequencing) — until that lands, certify cannot produce real evidence.

### CLI edits: `packages/mint/src/cli.ts` (source)

Replace each `throw new MintError({ … *_NOT_WIRED … })` body with `await
run{Candidate,Promote,CertifyClaude}(...)`. Keep the non-`--execute` plan/verify branch
and (for certify) the producer-identity flag validation exactly as they are.

### `.github/workflows/publish.yml` (source)

- Remove or replace the two broken candidate-job steps (`pnpm memory:artifact:test`,
  `release verify-memory-evidence`) so the pipeline reaches `candidate --execute`. Keep
  `memory:runtime:smoke` only if its script chain resolves; otherwise gate it behind a
  real, existing script.
- Ensure `GITHUB_TOKEN` (or a release PAT) and npm OIDC are in scope for the
  candidate/promote jobs (candidate now hits both GitHub releases and `npm publish`).

## Files touched

- `packages/mint/src/release/orchestrate.ts` — **new** (source). Input assembly + the
  three runners + the npm-publish step.
- `packages/mint/src/cli.ts` — (source). Wire the three `--execute` handlers.
- `packages/mint/src/release/claude-maintenance-driver.ts` — **new** (source), *if the
  production `TargetLifecycleDriver` is in scope for 0.2.1* (see Sequencing). Likely
  built on the container harness behind `packages/mint/src/test-command.ts` (`runTest`,
  `MOE_MINT_DEEP=1` deep-install tier).
- `.github/workflows/publish.yml` — (source). Fix broken steps; confirm token/OIDC scope.
- `packages/mint/test/release-orchestrate.test.ts` — **new** (source). See Test plan.
- No `SKILL.md` / hook / manifest / generated file changes. `plugins/**` is **not**
  edited; `candidate --execute` only reads the committed trees. `pnpm mint` /
  `pnpm mint:check` are unaffected by the code change, but a **version bump to 0.2.1**
  (`pnpm mint` after `moe-mint bump`) regenerates `plugins/**` and the catalog — that
  regeneration is the actual v0.2.1 artifact and must be committed.

## Acceptance

- **`pnpm check`** green (biome + typecheck + the new `release-orchestrate` tests +
  existing candidate/promotion/maintenance suites unchanged and passing).
- **`pnpm mint:check`** green after the 0.2.1 bump — `plugins/**`,
  `.claude-plugin/marketplace.json`, and `docs/moe/generated/plugin-catalog.md`
  reproducible from source and committed.
- **`pnpm provenance`** green (`scripts/check-provenance.mjs`): every distributed
  `LICENSE`/`NOTICE` matches the canonical rendered payload.
- **`moe-mint check-artifacts --repo .`** reports 0 problems for all six plugins — this
  is the standing proof that each `plugins/<id>` (LICENSE, NOTICE, manifest, references,
  pack/extract round-trip) is a valid artifact across every harness manifest set.
- **Release proof (the backlog's "Done"):** a `v0.2.1-rc.*` candidate run publishes six
  complete tarballs to npm `next`; for each, `npm pack`-style extraction contains
  `.claude-plugin/plugin.json`, the SessionStart bootstrap script reachable from the
  claude/kimi manifests, `LICENSE`, and `NOTICE`. A `v0.2.1` stable run moves `latest`
  for all six (gated on evidence — see Sequencing).
- **New/updated tests by name:** add `release-orchestrate.test.ts` cases
  `buildCandidateArtifacts points artifactRoot at plugins/<id> for all six plugins` and
  `runCandidate publishes each changed tarball to next exactly once (idempotent on
  re-run)`; keep the guarded suites `release-candidate.test.ts` /
  `release-promotion.test.ts` / `release-claude-maintenance.test.ts` passing unchanged.

**`check.ts` cross-check (confirmed).** `check.ts` asserts LICENSE/NOTICE presence and
canonical-payload equality directly; `.claude-plugin/plugin.json` and the reachable
SessionStart bootstrap are asserted transitively through `validateArtifact` →
`validateArtifactReferences` (`packages/mint/src/artifact/references.ts`): every hook
`command` matching `${CLAUDE_PLUGIN_ROOT}/…`/`./…` must resolve to a staged file
(`ARTIFACT_REFERENCE_MISSING`), and the kimi `sessionStart.skill` must resolve to
`<skills>/<skill>/SKILL.md`. This runs over every generated harness manifest present in
the tree. Note it is a **presence/reachability** check, not a runtime "the bootstrap
fires after install" check — that live e2e is the explicit 0.3.0 residual (BL-3ce1956bb4).

## Test plan

`packages/mint/test/release-orchestrate.test.ts` (new):
- `buildCandidateArtifacts` against a fixture platform root → six inputs, each
  `artifactRoot` = `plugins/<id>`, `treeSha256` == that tree's manifest `tree_sha256`,
  `expected.targets` matching `currentProjectionRecords`.
- `buildPreflight` with a fake `NpmRegistryPort` → correct proposed/predecessor states
  for absent and present packages.
- `runCandidate` with fake `NpmRegistryPort` + fake `ReleaseStorePort`
  (`test/helpers/fake-release-store.ts`) → six tarballs packed and uploaded, and
  `publishTarball(path, 'next')` invoked once per changed plugin; a second `runCandidate`
  with the same integrity present on npm publishes **zero** (idempotency via
  `computeResumeActions`).
- Reuse the existing fake-backed suites as-is to prove the orchestrators are unchanged.

Full-pipeline confidence: `moe-mint check-artifacts --repo . --json` in CI (proves the
committed trees pack complete before any tag), plus the `v0.2.1-rc.*` dry candidate.

## Sequencing & dependencies

1. **Land first (unblocks the worst gap):** `candidate --execute` wiring + the
   `publishTarball('next')` step + the `publish.yml` broken-step fix. This alone puts six
   complete tarballs on npm `next` and lets the marketplace install a complete plugin.
2. **`promote --execute`** wiring can land in parallel but **cannot succeed at run time
   without certification evidence** (`validateEvidenceForPromotion` requires a
   `certified`/`preview` tuple for all six). End users install from `latest`, so the fix
   only fully reaches them once `latest` is promoted.
3. **`certify-claude --execute`** depends on a production `TargetLifecycleDriver`, which
   does not exist. Two options for 0.2.1:
   - (a) Build the driver on the container harness (`test-command.ts` `runTest`,
     `MOE_MINT_DEEP=1`) so certify emits genuine `pass` evidence and promotion can move
     `latest`. Larger, environment-dependent.
   - (b) Ship the candidate wiring (complete tarballs on `next`) in 0.2.1 and treat the
     driver-backed certify + `latest` promotion as fast-follow, tracked against the
     deferred e2e harness (BL-3ce1956bb4).
   Escalate this choice to the release owner — it decides whether 0.2.1's fix lands on
   `next` only or reaches `latest`.
4. This is the lead item; the other 0.2.1 items republish with the v0.2.1 bump. The
   version bump + `pnpm mint` regeneration of `plugins/**` must be the same commit that
   the release tag points at, so the packed trees match the catalog SHAs.

## Risks

- **Silent no-op today:** the current stubs mean any tag push either fails loudly
  (`*_NOT_WIRED`) or, via the broken `publish.yml` memory steps, fails before candidate.
  A half-wired candidate that uploads to the GitHub mirror but skips `npm publish` would
  look green while leaving npm empty — the idempotency test must assert `publishTarball`
  is actually called.
- **Evidence chain:** wiring `promote` without a real certify driver yields a runtime
  `PROMOTION_MISSING_EVIDENCE` on the stable tag. Decide option (a)/(b) before tagging.
- **Token/OIDC scope:** candidate now needs both a GitHub release token and npm publish
  auth in the same job; a missing scope surfaces only at tag time.
- **`previous` catalog / change detection:** genesis vs. incremental differ; a wrong
  `previous` makes `detectChangedPlugins` skip a changed plugin
  (`requireVersionChangeForArtifactChange` guards the inverse). Test both.
- **Not editing `plugins/**` by hand:** the fix reads committed trees; the only
  `plugins/**` change is the mint regeneration from the 0.2.1 bump. Hand-editing would
  fail `pnpm mint:check`.
