# Moe Release Catalog and Promotion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the exact pretested plugin tarballs under `next`, bind all six immutable artifacts into a versioned platform catalog, collect authenticated Claude/macOS evidence, and promote those same npm versions to `latest` without repacking or republishing.

**Architecture:** Release policy lives in testable Mint TypeScript modules behind injected npm and GitHub ports; workflow YAML only supplies protected identity and invokes the compiled CLI. Candidate preparation packs changed artifacts once and reuses verified prior bytes for unchanged artifacts, producing a self-contained six-tarball draft plus a durable release lock. Candidate publication is resumable from those assets. Stable promotion downloads the candidate bytes, validates evidence and registry integrity, changes only dist-tags, and emits a stable catalog whose artifact records are identical to the candidate.

**Tech Stack:** Node.js 24, TypeScript, Zod, semver, npm OIDC/provenance CLI, GitHub Releases REST API, GitHub Actions protected environments, Vitest, pnpm

**Spec:** `docs/moe/specs/2026-09-02-moe-artifact-registry-foundation-design.md`

## Global Constraints

- Plans 1–3 must be complete and all local gates must pass before release work begins.
- npm is the origin; GitHub releases mirror exact bytes. Never publish from `packages/<pkg>` and never pack after verification.
- The Git tag `v<semver>` is platform-version authority. Prerelease tags use npm `next`; stable tags use `latest` by dist-tag promotion only.
- Candidate plugin versions are final immutable SemVer values even when the platform tag is a prerelease. Any artifact-byte change requires a new plugin version and candidate.
- Every candidate/stable GitHub release is self-contained with all six tarballs. Changed artifacts are packed exactly once; unchanged tarballs are downloaded from the verified base and revalidated.
- `SHA256SUMS` and `SHA512SUMS` cover the six tarballs only, in registry order. Bundle inventories, catalogs, evidence, and other auxiliary release assets are individually SHA-256-bound by the release lock or catalog; they never appear in the tarball checksum files.
- Upload the release lock and all six verified tarballs before the first npm publish. Once any version publishes, retries must use draft assets and may never rebuild.
- Stable promotion performs zero pack calls and zero npm publish calls. It downloads the highest verified same-core/same-source-SHA prerelease and only mutates `latest` dist-tags after all evidence passes.
- Keep `next` on the accepted version after stable promotion; do not remove it. Reject a promotion that would downgrade an existing newer `latest`.
- Release commands default to plan/verify mode. Mutation requires `--execute` plus GitHub Actions/tag/repository/source-SHA/protected-environment/OIDC guards.
- Tests inject fake ports and install a process-spawn tripwire. No test may call `npm publish`, `npm dist-tag`, GitHub mutation APIs, or live registries.
- Maintenance certification requires a real predecessor update. Snapshot current `latest` versions in the candidate lock and run legacy-to-candidate update. When that immutable snapshot proves a registry-confirmed first publication, emit `update: skipped` with reason `NO_PREDECESSOR`, require every other lifecycle/capability result to pass, and keep that tuple at `preview`; never substitute install or a synthetic package for update evidence.
- At `0.1.x`, only passing Claude Code/macOS tuples become certified. Every other emitted tuple remains preview unless it has its own accepted report.
- Resolve Claude automation through the protected `claude-maintenance` GitHub environment: a GitHub-hosted macOS job receives only its environment-scoped `ANTHROPIC_API_KEY`, installs the pinned Claude Code version, and must pass `claude auth status` before touching a candidate. This follows Claude Code's documented [CI/API-key authentication](https://code.claude.com/docs/en/iam) and [authentication-status command](https://code.claude.com/docs/en/cli-usage); no subscription token or pre-authenticated personal runner is used.

## Open Decisions

None. `OD-R1` is resolved: a registry-confirmed first-publish `NO_PREDECESSOR` result keeps the affected tuple at `preview`, while predecessor-backed plugins may certify. For genesis this applies only to Statusline; all six candidate artifacts remain changed and the exact versions below remain fixed.

## Not Yet Specified

- Full eight-target and four-OS Core certification belongs to the later `0.2.0` program.

## Out of Scope

- Building the common `moe` lifecycle CLI.
- Advertising non-Claude structural output as certified.
- Repacking, editing, or republishing candidate package versions during stable promotion.
- Automatic rollback of immutable npm publication; recovery is resumable and catalog publication is withheld until complete.

---

## File Structure

| Path | Responsibility |
| --- | --- |
| `packages/mint/src/release/tag-policy.ts` | Strict platform tag parsing and verified baseline selection. |
| `packages/mint/src/release/catalog.ts` | Platform catalog schema, canonical serialization, candidate/stable builders. |
| `packages/mint/src/release/assets.ts` | Release-lock schema, tarball checksum files, and exact lock-bound asset verification. |
| `packages/mint/src/release/candidate.ts` | Changed detection, pack-once preparation, draft assembly, candidate orchestration. |
| `packages/mint/src/release/recovery.ts` | Pure resumable-state reducer. |
| `packages/mint/src/release/npm-registry.ts` | npm inspection/preflight/publish/dist-tag port and production adapter. |
| `packages/mint/src/release/github-release.ts` | GitHub release/asset port and Node `fetch` adapter. |
| `packages/mint/src/release/evidence.ts` | Strict evidence schema, redaction validation, certification acceptance. |
| `packages/mint/src/release/claude-maintenance.ts` | Isolated Claude lifecycle driver and evidence producer. |
| `packages/mint/src/release/promotion.ts` | Candidate revalidation, evidence gate, idempotent stable promotion. |
| `packages/mint/src/cli.ts` | Internal `moe-mint release` command group. |
| `.github/workflows/publish.yml` | Protected candidate/stable release dispatcher with global concurrency. |
| `.github/workflows/certify-claude-macos.yml` | Authenticated manual Claude/macOS evidence workflow. |
| Mint release test files named in Tasks 1–7 | Pure-domain, fake-port, CLI guard, and workflow contract tests. |

## Task 1: Implement strict platform tags, release locks, and catalog schemas

**Files:**

- Create: `packages/mint/src/release/tag-policy.ts`
- Create: `packages/mint/src/release/catalog.ts`
- Create: `packages/mint/src/release/assets.ts`
- Create: `packages/mint/test/release-tag-policy.test.ts`
- Create: `packages/mint/test/release-catalog.test.ts`
- Create: `packages/mint/test/release-assets.test.ts`
- Modify: `packages/mint/package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**

- Consumes: `v<semver>` Git ref; Plan 1 publish matrix/registry; Plan 3 artifact and pack records; optional verified prior catalogs.
- Produces: `PlatformTag`, `CandidateLockV1`, `PlatformCatalogV1`, canonical JSON/checksum serialization, baseline selectors.

- [ ] Add `semver` as a direct Mint runtime dependency. Write failing table tests for exact `v<valid-semver>` parsing, stable/prerelease channel selection, npm tag mapping, malformed refs, build metadata policy, SemVer ordering, same-core/same-source-SHA stable selection, and genesis with no base.

```ts
export interface PlatformTag {
  raw: string;
  platformVersion: string;
  semverCore: string;
  channel: "prerelease" | "stable";
  npmTag: "next" | "latest";
}

export function parsePlatformTag(ref: string): PlatformTag;
```

- [ ] Add strict schema tests for the release lock and platform catalog. Require exactly the six registry plugins in registry order, unique package/version/asset identities, complete artifact/tarball/legal/capability/status records, and no unknown keys.

```ts
export interface PlatformCatalogV1 {
  schema: 1;
  platform_version: string;
  channel: "prerelease" | "stable";
  source: {
    git_sha: string;
    lockfile_sha256: string;
    platform_registry_schema: number;
    platform_registry_sha256: string;
    mint_version: string;
  };
  plugins: readonly PluginCatalogRecordV1[];
}

export interface PluginCatalogRecordV1 {
  plugin: string;
  package: string;
  version: string;
  artifact: PluginArtifactRecordV1;
  certification: readonly CertificationTupleV1[];
}

export interface PluginArtifactRecordV1 {
  artifact_tree_sha256: string;
  artifact_manifest_sha256: string;
  tarball: { integrity: `sha512-${string}`; bytes: number };
  mirror: { asset: string; sha256: string };
  legal: { files: Readonly<Record<string, string>>; bundle_inventory_sha256: string };
  emitted_capabilities: Readonly<Record<string, readonly CapabilityId[]>>;
}

export interface CertificationTupleV1 {
  target: TargetId;
  os?: OperatingSystemId;
  arch?: string;
  status: "certified" | "preview" | "unsupported";
  evidence?: { asset: string; sha256: string; result_id: string };
}

export interface CandidateLockV1 {
  schema: 1;
  platform_version: string;
  source_sha: string;
  publish_matrix: readonly PublishMatrixEntry[];
  preflight: ReleasePreflightV1;
  plugins: readonly (PluginCatalogRecordV1 & { changed: boolean })[];
  release_assets: readonly {
    name: string;
    bytes: number;
    sha256: string;
    kind: "tarball" | "bundle-inventory" | "checksums" | "catalog";
  }[];
}

export interface ReleasePreflightV1 {
  schema: 1;
  platform_version: string;
  source_sha: string;
  plugins: readonly {
    plugin: string;
    package: string;
    proposed_version: string;
    proposed:
      | { state: "absent" }
      | { state: "present"; integrity: string; dist_tags: readonly string[] };
    predecessor:
      | { state: "absent" }
      | { state: "present"; version: string; integrity: string };
  }[];
}
```

- [ ] Run the three focused tests; expect module-not-found failures.
- [ ] Implement canonical two-space JSON plus newline, lowercase SHA-256, npm `sha512-<base64>` integrity validation, and deterministic checksum files. `SHA256SUMS`/`SHA512SUMS` contain exactly six tarball rows; reject auxiliary rows, missing rows, duplicates, or non-registry order. Store the mirror asset name/digest; resolve it in the GitHub release named by the containing catalog's platform version, avoiding a redundant per-plugin release pointer.
- [ ] Make the lock individually bind every release asset other than the lock itself: six tarballs, six canonical bundle inventories, both checksum files, and the planned prerelease catalog. Add tamper tests for each asset class and prove the checksum files remain tarball-only.
- [ ] Reject an artifact whose bytes/tree/manifest changed without a plugin version change. For genesis, classify all six as changed and require unpublished immutable versions.
- [ ] Make `buildStableCatalog()` copy each candidate `PluginArtifactRecordV1` without field reconstruction; only platform version/channel and the sibling certification tuples may differ.
- [ ] Run focused tests and Mint typecheck; expect pass.
- [ ] Commit:

```sh
git add packages/mint/src/release/tag-policy.ts packages/mint/src/release/catalog.ts packages/mint/src/release/assets.ts packages/mint/test/release-tag-policy.test.ts packages/mint/test/release-catalog.test.ts packages/mint/test/release-assets.test.ts packages/mint/package.json pnpm-lock.yaml
git commit -m "feat(mint): model platform release catalogs"
```

## Task 2: Prepare one self-contained candidate draft from exact tarball bytes

**Files:**

- Create: `packages/mint/src/release/github-release.ts`
- Create: `packages/mint/src/release/candidate.ts`
- Create: `packages/mint/test/release-github-store.test.ts`
- Create: `packages/mint/test/release-candidate.test.ts`
- Create fixtures: `packages/mint/test/fixtures/releases/`

**Interfaces:**

- Consumes: parsed prerelease tag; source SHA; immutable `ReleasePreflightV1`; ephemeral publish matrix; previous verified catalog; six Plan 3 artifact records; `packArtifactOnce()`/`verifyPackedArtifact()`.
- Produces: a draft release containing all six exact tarballs, checksum files, canonical per-plugin bundle inventories, and `moe-release-lock-v<platform-version>.json` before publication.

- [ ] Define the candidate preparation input/result before orchestration code.

```ts
export interface CandidateInput {
  tag: PlatformTag;
  sourceSha: string;
  preflight: ReleasePreflightV1;
  publishMatrix: readonly PublishMatrixEntry[];
  artifacts: readonly CandidateArtifactInput[];
  previous?: PlatformCatalogV1;
  outputDir: string;
}

export interface CandidateArtifactInput {
  plugin: ResolvedPlugin;
  artifactRoot: string;
  expected: ExpectedArtifactContext;
  bundleInventory: readonly BundledPackage[];
}

export interface CandidatePreparationDeps {
  pack: typeof packArtifactOnce;
  verify: typeof verifyPackedArtifact;
  releases: ReleaseStorePort;
}

export async function prepareCandidate(
  input: CandidateInput,
  deps: CandidatePreparationDeps,
): Promise<CandidateLockV1>;
```

- [ ] Define the injected release-store port and fake it in tests.

```ts
export interface ReleaseStorePort {
  findByTag(tag: string): Promise<ReleaseRef | undefined>;
  createDraft(input: DraftReleaseInput): Promise<ReleaseRef>;
  listAssets(release: ReleaseRef): Promise<readonly ReleaseAsset[]>;
  uploadExact(release: ReleaseRef, file: string, sha256: string): Promise<void>;
  download(release: ReleaseRef, asset: string, destination: string): Promise<void>;
  finalize(release: ReleaseRef, channel: "prerelease" | "stable"): Promise<void>;
  createStable(input: StableReleaseInput): Promise<ReleaseRef>;
}

export interface ReleaseRef {
  id: number;
  tag: string;
  draft: boolean;
  prerelease: boolean;
}

export interface ReleaseAsset {
  name: string;
  bytes: number;
  apiUrl: string;
  sha256?: string;
}

export interface DraftReleaseInput {
  tag: string;
  sourceSha: string;
  title: string;
}

export interface StableReleaseInput extends DraftReleaseInput {
  candidateTag: string;
}
```

- [ ] Add failing tests for preflight/publish-matrix/artifact tag-SHA-plugin-version set mismatch, exact immutable snapshot preservation in the lock, changed detection, one pack call per changed plugin, zero pack calls for unchanged plugins, prior-tarball download/revalidation, six unique final tarballs, tarball-only checksum/lock ordering, individually hashed auxiliary assets, corrupt/missing/duplicate asset rejection, and self-contained draft recovery.
- [ ] Run `pnpm --filter @bubstack/moe-mint exec vitest run test/release-github-store.test.ts test/release-candidate.test.ts`; expect failure.
- [ ] Implement the GitHub adapter with Node 24 `fetch` against the Releases API; do not assume `gh` exists in the container. Inject token lookup and redact headers/errors.
- [ ] Implement `prepareCandidate()`: verify the immutable preflight tag/SHA/proposed versions against the input and preserve that exact snapshot in the lock; resolve the six registry records; pack each changed artifact exactly once into a run output directory; download unchanged tarballs from their catalog-recorded release; re-run Plan 3 offline verification; serialize/hash the verified Plan 3 bundle inventories; render the planned catalog; write tarball-only checksums and the release lock; create/reuse draft; upload all exact assets.
- [ ] Make draft reuse compare asset digest and size. An unequal existing asset blocks; never overwrite a release asset whose bytes may already back an npm publication.
- [ ] Add a packer spy and test invariant `packCalls === changedPlugins.length` across preparation and retry.
- [ ] Run focused tests; expect pass with no network.
- [ ] Commit:

```sh
git add packages/mint/src/release/github-release.ts packages/mint/src/release/candidate.ts packages/mint/test/release-github-store.test.ts packages/mint/test/release-candidate.test.ts packages/mint/test/fixtures/releases
git commit -m "feat(mint): prepare exact candidate release assets"
```

## Task 3: Publish candidates under `next` with resumable partial-publication recovery

**Files:**

- Create: `packages/mint/src/release/npm-registry.ts`
- Create: `packages/mint/src/release/recovery.ts`
- Modify: `packages/mint/src/release/candidate.ts`
- Create: `packages/mint/test/release-npm-registry.test.ts`
- Create: `packages/mint/test/release-recovery.test.ts`
- Modify: `packages/mint/test/release-candidate.test.ts`

**Interfaces:**

- Consumes: verified draft release lock/assets; npm auth/version/dist-tag observations.
- Produces: immutable `ReleasePreflightV1`; pure `ResumeAction[]`; exact tarball publication under `next`; verified prerelease catalog/finalized release.

- [ ] Define the npm port and production adapter behind argv-array execution.

```ts
export interface NpmRegistryPort {
  preflight(packageName: string): Promise<void>;
  inspectVersion(packageName: string, version: string): Promise<
    | { state: "absent" }
    | { state: "present"; integrity: string; distTags: readonly string[] }
  >;
  publishTarball(path: string, tag: "next"): Promise<void>;
  setDistTag(packageName: string, version: string, tag: "latest"): Promise<void>;
  inspectDistTags(packageName: string): Promise<Readonly<Record<string, string>>>;
}

export async function inspectReleasePreflight(input: {
  tag: PlatformTag;
  sourceSha: string;
  proposedVersions: Readonly<Record<string, string>>;
  platform: ResolvedPlatform;
}, registry: NpmRegistryPort): Promise<ReleasePreflightV1>;
```

- [ ] Table-drive the pure recovery reducer for zero/partial/full publication, exact existing integrity, mismatched integrity, absent/mismatched draft asset after partial publication, and retry from verified draft bytes.

```ts
export type ResumeAction =
  | { kind: "publish"; plugin: string; tarball: string }
  | { kind: "accept-existing"; plugin: string }
  | { kind: "block"; plugin?: string; code: string; message: string };
```

- [ ] Run focused tests; expect failure.
- [ ] Implement `inspectReleasePreflight()` as the sole read-only npm snapshot producer: capture each proposed version's absence/presence and the exact current `latest` predecessor version/integrity in registry order, then serialize it canonically for direct use by `CandidateInput`. Implement mutation preflight for auth, intended `next` tag, and every local/draft asset before the first publish. Do not print OIDC tokens or exchanged credentials.
- [ ] `publishCandidate()` must load/reverify the draft lock, execute resume actions in registry order, publish exact `.tgz` paths under `next`, and inspect registry integrity after each success. It must never call pack.
- [ ] Withhold the platform catalog and `ReleaseStorePort.finalize(release, "prerelease")` until all changed npm versions publish, all six npm versions (changed and reused) match their catalog-recorded integrity, and every lock-bound release asset verifies. Treat exact already-published versions as complete; stop permanently on any integrity mismatch.
- [ ] Install a test process-runner tripwire that throws if argv starts `npm publish` or `npm dist-tag`; production command construction is asserted as data but never spawned in tests.
- [ ] Run focused tests; expect pass and zero publication/network effects.
- [ ] Commit:

```sh
git add packages/mint/src/release/npm-registry.ts packages/mint/src/release/recovery.ts packages/mint/src/release/candidate.ts packages/mint/test/release-npm-registry.test.ts packages/mint/test/release-recovery.test.ts packages/mint/test/release-candidate.test.ts
git commit -m "feat(mint): resume exact candidate publication"
```

## Task 4: Validate certification evidence as a strict artifact binding

**Files:**

- Create: `packages/mint/src/release/evidence.ts`
- Create: `packages/mint/test/release-evidence.test.ts`
- Create fixtures: `packages/mint/test/fixtures/evidence/`

**Interfaces:**

- Consumes: raw evidence JSON; candidate plugin record; expected capabilities/lifecycle; the plugin's immutable `ReleasePreflightV1` row; protected workflow/checkpoint identity.
- Produces: `CertificationEvidenceV1`, `EvidenceExpectation`, `EvidenceDisposition`, `validateEvidenceSchema()`, `evaluateEvidence()`, external asset SHA-256 binding.

- [ ] Add strict positive/negative schema fixtures with the complete subject, environment, lifecycle, capability, log, producer, and overall fields. Schema parsing may represent pass/fail/skipped; acceptance applies policy.

```ts
export interface CertificationEvidenceV1 {
  schema: 1;
  result_id: string;
  subject: {
    plugin: string;
    package: string;
    version: string;
    artifact_tree_sha256: string;
    artifact_manifest_sha256: string;
    tarball_integrity: string;
  };
  environment: EvidenceEnvironment;
  lifecycle: Record<"install" | "discovery" | "update" | "uninstall", EvidenceCheck>;
  capabilities: readonly EvidenceCheck[];
  log: { asset: string; sha256: string; redacted: true };
  producer: EvidenceProducer;
  overall: "pass" | "fail";
}

export interface EvidenceCheck {
  id: string;
  outcome: "pass" | "fail" | "skipped";
  started_at: string;
  completed_at: string;
  log_sha256?: string;
  reason?: string;
}

export interface EvidenceEnvironment {
  target: TargetId;
  target_version?: string;
  contract_revision?: string;
  os?: OperatingSystemId;
  arch?: string;
  runtimes: Readonly<Record<string, string>>;
}

export interface EvidenceProducer {
  kind: "protected-ci";
  repository: string;
  workflow: string;
  workflow_sha: string;
  run_id: string;
  job_id: string;
  trigger_actor: string;
  runner_image: string;
  checkpoint: {
    environment: "claude-maintenance";
    deployment_id: string;
    approval_actor: string;
    approved_at: string;
  };
}

export type EvidenceDisposition =
  | { status: "certified"; evidence: CertificationEvidenceV1 }
  | {
      status: "preview";
      reason: "NO_PREDECESSOR";
      evidence: CertificationEvidenceV1;
    };

export interface EvidenceExpectation {
  plugin: PluginCatalogRecordV1;
  preflight: ReleasePreflightV1["plugins"][number];
  target: TargetId;
  os?: OperatingSystemId;
  arch?: string;
  expectedCapabilities: readonly CapabilityId[];
  producer: {
    repository: string;
    workflow: string;
    workflowSha: string;
    environment: "claude-maintenance";
  };
}

export function validateEvidenceSchema(raw: unknown): CertificationEvidenceV1;
export function evaluateEvidence(
  evidence: CertificationEvidenceV1,
  expected: EvidenceExpectation,
): EvidenceDisposition;
```

- [ ] Add rejection tests for subject digest/integrity mismatch, target/OS/arch mismatch, missing/duplicate capability result, any required fail or non-exempt skipped lifecycle result, forged `NO_PREDECESSOR`, any other skipped result, absent/wrong protected environment, missing deployment approval identity, trigger/approval identity substitution, wrong workflow SHA/run/job, invalid filename, unknown fields, token-like content, home-directory paths, and unredacted logs.
- [ ] Run `pnpm --filter @bubstack/moe-mint exec vitest run test/release-evidence.test.ts`; expect failure.
- [ ] Implement the single protected-CI producer schema so each report binds both workflow run identity and its protected-environment deployment approval. Keep command transcript outside JSON as a redacted log asset and digest; the report asset's checksum remains external to avoid self-reference.
- [ ] Require exact expected-capability coverage. Return `preview/NO_PREDECESSOR` only when the lock's immutable npm snapshot records `predecessor.state === "absent"`, the report's overall outcome is `pass`, the update result is `skipped` for that exact reason, and every install/discovery/uninstall/capability result passes. It is accepted release evidence but not certification. All other skipped required results fail; one macOS report never copies to Linux/WSL2/Windows.
- [ ] Run the focused test; expect pass.
- [ ] Commit:

```sh
git add packages/mint/src/release/evidence.ts packages/mint/test/release-evidence.test.ts packages/mint/test/fixtures/evidence
git commit -m "feat(mint): bind certification evidence to artifacts"
```

## Task 5: Produce authenticated Claude Code/macOS maintenance evidence

**Files:**

- Create: `packages/mint/src/release/claude-maintenance.ts`
- Create: `packages/mint/test/release-claude-maintenance.test.ts`
- Create fixtures: `packages/mint/test/fixtures/claude-maintenance/`
- Create: `.github/workflows/certify-claude-macos.yml`
- Create: `docs/moe/runbooks/claude-macos-certification.md`
- Modify: `packages/mint/src/cli.ts`
- Modify: `packages/mint/test/cli.test.ts`

**Interfaces:**

- Consumes: candidate platform tag/catalog/tarballs; snapshot of predecessor `latest`; isolated Claude config/project; authenticated protected-environment approval identity.
- Produces: six `moe-evidence-<plugin>-claude-code-macos-<arch>.json` reports plus redacted logs: five predecessor-backed `certified` dispositions and one Statusline `preview/NO_PREDECESSOR` disposition.

- [ ] Define the target lifecycle driver and add fake-driver tests for exact call order, isolation, cleanup, predecessor-backed update, declared capability coverage, fail/skip propagation, and one report per plugin. Assert the driver receives no update call when the locked predecessor is absent; the orchestrator writes the exact skipped update result itself.

```ts
export interface PluginSmokeContext {
  plugin: PluginCatalogRecordV1;
  predecessorVersion: string | null;
  candidateTarball: string;
  configDir: string;
  projectDir: string;
}

export interface CheckResult {
  outcome: "pass" | "fail" | "skipped";
  startedAt: string;
  completedAt: string;
  redactedLog: string;
  reason?: string;
}

export interface TargetLifecycleDriver {
  install(ctx: PluginSmokeContext): Promise<CheckResult>;
  discover(ctx: PluginSmokeContext): Promise<CheckResult>;
  update(ctx: PluginSmokeContext): Promise<CheckResult>;
  invokeCapability(capability: CapabilityId, ctx: PluginSmokeContext): Promise<CheckResult>;
  uninstall(ctx: PluginSmokeContext): Promise<CheckResult>;
}
```

- [ ] Run `pnpm --filter @bubstack/moe-mint exec vitest run test/release-claude-maintenance.test.ts test/cli.test.ts`; expect failure.
- [ ] Document and implement the fixed authentication path: protected environment `claude-maintenance`, environment-scoped `ANTHROPIC_API_KEY`, GitHub-hosted macOS, pinned Claude Code version, `claude auth status` preflight, and one minimal `claude -p --output-format json` connectivity probe whose output is redacted/discarded. Never accept a token as workflow input or use a personal runner/keychain.
- [ ] Implement isolated config/project roots per plugin and a temporary Claude marketplace projection that pins the exact candidate npm version under `next`. Never modify the operator's normal Claude home.
- [ ] Exercise install, discovery, every capability in the exact Plan 1 Claude `expected_capabilities` set, and uninstall for all six plugins. Exercise legacy-to-candidate update only when the locked preflight names a predecessor. Do not add skill invocation, command invocation, MCP startup, or executable invocation unless that plugin's locked capability set actually declares it; a later capability change requires a reviewed config/test update first.
- [ ] If a named predecessor cannot install or genuinely update, emit failing evidence and stop. If and only if the lock records no predecessor, emit `update: { outcome: "skipped", reason: "NO_PREDECESSOR" }`; require every other result to pass and preserve preview status. Do not downgrade a failed update, manufacture a predecessor, or count install as update.
- [ ] Create a protected `workflow_dispatch` workflow whose only release input is candidate platform tag. It downloads/revalidates the catalog and six tarballs before invoking the driver. The workflow serializes and uploads evidence; operators cannot supply digests or verdicts.
- [ ] Fetch protected-environment deployment/reviewer identity through the Actions/Deployments API; do not equate `github.actor` with approval actor. Use the workflow's run/job/SHA identity in every report.
- [ ] Add log redaction/scanning before upload and always attempt isolated uninstall/cleanup after a probe failure while preserving the primary failure.
- [ ] Run fake-driver and workflow-shape tests locally; run no real Claude auth during ordinary CI.
- [ ] Commit:

```sh
git add packages/mint/src/release/claude-maintenance.ts packages/mint/test/release-claude-maintenance.test.ts packages/mint/test/fixtures/claude-maintenance .github/workflows/certify-claude-macos.yml docs/moe/runbooks/claude-macos-certification.md packages/mint/src/cli.ts packages/mint/test/cli.test.ts
git commit -m "feat(mint): add protected Claude maintenance gate"
```

## Task 6: Promote stable catalogs by dist-tag only, with resumable recovery

**Files:**

- Create: `packages/mint/src/release/promotion.ts`
- Create: `packages/mint/test/release-promotion.test.ts`
- Modify: `packages/mint/src/release/catalog.ts`
- Modify: `packages/mint/src/cli.ts`
- Modify: `packages/mint/test/cli.test.ts`

**Interfaces:**

- Consumes: stable tag; highest verified same-core/same-SHA candidate; all six candidate tarballs; npm observations; five certified Claude/macOS dispositions plus Statusline's accepted `preview/NO_PREDECESSOR` disposition.
- Produces: idempotent `latest` action plan and stable catalog/release with unchanged artifact records.

- [ ] Add fake-port tests for exact promotion, already promoted, partially promoted, registry-integrity mismatch, missing `next`, newer existing `latest`, missing/mismatched evidence, source-SHA mismatch, changed candidate asset, and incomplete six-plugin set. Assert the stable release receives all six downloaded candidate tarballs, canonical bundle inventories, and both tarball-only checksum files with byte-identical digests before its catalog is finalized through `ReleaseStorePort.finalize(release, "stable")`.
- [ ] Add call-trace assertions that stable promotion executes zero `packArtifactOnce`, zero `publishTarball`, and no public-plugin package build command. Compiling only the Mint release CLI before orchestration is permitted and is outside the promotion trace.
- [ ] Run `pnpm --filter @bubstack/moe-mint exec vitest run test/release-promotion.test.ts test/release-catalog.test.ts`; expect failure.
- [ ] Implement promotion preflight: download catalog/checksums/tarballs/evidence; verify all bytes offline; inspect each registry version/integrity and current tags; validate all six Claude/macOS reports against exact candidate subjects. Require five `certified` dispositions and exactly one Statusline `preview/NO_PREDECESSOR` disposition backed by the candidate lock.
- [ ] Move only exact versions to `latest` in registry order. Exact already-moved tags are complete. A newer current `latest` is a hard block, not a downgrade. Do not remove `next`.
- [ ] Create/reuse the stable draft, upload the six already-downloaded candidate tarballs and canonical bundle inventories, plus regenerated tarball-only checksum files with byte-identical digests, and verify all mirror assets. Do not call pack or reconstruct archives.
- [ ] Withhold stable catalog and `ReleaseStorePort.finalize(release, "stable")` until all six intended `latest` tags and every stable release asset verify. On retry, resume solely from candidate catalog/assets, the stable draft, and current registry state.
- [ ] Build the stable catalog by preserving each candidate `artifact` object byte-for-byte and changing only sibling certification tuples to bind accepted evidence checksums/statuses. Assert every non-Claude row remains unchanged/preview.
- [ ] Run focused tests; expect pass.
- [ ] Commit:

```sh
git add packages/mint/src/release/promotion.ts packages/mint/test/release-promotion.test.ts packages/mint/src/release/catalog.ts packages/mint/src/cli.ts packages/mint/test/cli.test.ts
git commit -m "feat(mint): promote verified candidate dist-tags"
```

## Task 7: Cut release workflows over to the guarded Mint CLI

**Files:**

- Modify: `.github/workflows/publish.yml`
- Create: `packages/mint/test/release-workflows.test.ts`
- Modify: `packages/mint/src/cli.ts`
- Modify: `packages/mint/test/cli.test.ts`
- Modify: `package.json`
- Delete after replacement is verified: `scripts/diagnose-oidc.sh`

**Interfaces:**

- Consumes: protected tag-triggered GitHub context, OIDC endpoint/token, candidate or stable CLI mode.
- Produces: globally serialized release workflow with no literal package list and no source-directory publication path.

- [ ] Add a workflow contract test that parses YAML and asserts `contents: write`, `id-token: write`, a single non-cancelling global release concurrency group, exact tag guard, protected environments, candidate/stable branch separation before candidate-only gates, and compiled Mint release CLI invocation.
- [ ] Add negative text assertions prohibiting `npm publish packages/`, a hard-coded six-package loop, `npm pack` after candidate verification, stable `npm publish`, and direct use of the stale diagnostic script.
- [ ] Run `pnpm --filter @bubstack/moe-mint exec vitest run test/release-workflows.test.ts test/cli.test.ts`; expect failure on the current workflow.
- [ ] Implement CLI subcommands:

```text
moe-mint release candidate --tag <tag> --repo <root> [--execute]
moe-mint release preflight --tag <tag> --plugin-version <id=version>... --repo <root>
moe-mint release certify-claude --candidate <tag> --repo <root> --execute
moe-mint release promote --tag <stable-tag> --repo <root> [--execute]
moe-mint release verify --catalog-tag <tag> [--require-evidence <target:os>] --repo <root>
```

The default prints a deterministic action plan. `--execute` requires Actions, exact repository/ref/SHA, expected protected environment, and OIDC endpoint assertions before constructing any mutation adapter.

- [ ] Replace `.github/workflows/publish.yml` with this explicit branch shape: both channels check out, perform a frozen install, and compile only `@bubstack/moe-mint`; the candidate branch then runs `pnpm check`, `pnpm build`, `pnpm mint:check`, `pnpm artifact:check`, and `pnpm provenance` before candidate execution; the stable branch skips every public-plugin/root build, Mint generation, artifact packing/check, and provenance build gate and invokes promotion directly against downloaded candidate assets. Stable uses promotion only and calls no six-plugin build/pack path. Do not retain a second plugin matrix in YAML.
- [ ] Remove `scripts/diagnose-oidc.sh` only after every useful non-secret diagnostic has an equivalent redacted CLI diagnostic and workflow test.
- [ ] Run the Plan 4 implementation gate locally with fake ports:

```sh
pnpm --filter @bubstack/moe-mint typecheck
pnpm --filter @bubstack/moe-mint test
pnpm mint:check
pnpm artifact:check
pnpm provenance
pnpm check
```

Expected: all commands exit 0; release workflow tests prove ordinary tests cannot publish; CLI plan mode produces deterministic candidate/promote actions without network mutation.

- [ ] Commit:

```sh
git add .github/workflows/publish.yml packages/mint/test/release-workflows.test.ts packages/mint/src/cli.ts packages/mint/test/cli.test.ts package.json scripts/diagnose-oidc.sh
git commit -m "ci: publish verified artifact tarballs"
```

## Task 8: Commit the exact genesis versions and verify the candidate plan

**Files:**

- Modify: `packages/core/package.json`
- Modify: `packages/backstory/package.json`
- Modify: `packages/memory/package.json`
- Modify: `packages/glass/package.json`
- Modify: `packages/crew/package.json`
- Modify: `packages/statusline/package.json`
- Modify: `packages/core/mint/moe.yaml`
- Modify: `packages/backstory/mint/moe-backstory.yaml`
- Modify: `packages/memory/mint/moe-memory.yaml`
- Modify: `packages/glass/mint/moe-glass.yaml`
- Modify: `packages/crew/mint/moe-crew.yaml`
- Modify: `packages/statusline/mint/moe-statusline.yaml`
- Regenerate: `.claude-plugin/marketplace.json`
- Regenerate: `docs/moe/generated/plugin-catalog.md`
- Regenerate directory: `plugins/`

**Interfaces:**

- Consumes: current repository versions (`0.1.4` for Core/Backstory/Memory/Glass/Crew and source-only Statusline `0.1.0`), genesis policy, and read-only npm observations.
- Produces: Core/Backstory/Memory/Glass/Crew `0.1.5`, Statusline `0.1.1`, candidate tag plan `v0.1.5-rc.1`, stable tag plan `v0.1.5`, and one release-ready source commit.

- [ ] Run the read-only genesis preflight before editing versions:

```sh
pnpm artifact:check
pnpm --filter @bubstack/moe-mint exec moe-mint release preflight --tag v0.1.5-rc.1 --plugin-version moe=0.1.5 --plugin-version moe-backstory=0.1.5 --plugin-version moe-memory=0.1.5 --plugin-version moe-glass=0.1.5 --plugin-version moe-crew=0.1.5 --plugin-version moe-statusline=0.1.1 --repo .
```

Expected: the command classifies genesis as six changed artifacts, proves the proposed versions are absent, snapshots `0.1.4` predecessors for five packages, and records Statusline as first-publish `NO_PREDECESSOR`/preview. Any present target version blocks this exact plan and requires a reviewed version amendment; do not auto-increment inside the release command.

- [ ] Change both authorities for Core/Backstory/Memory/Glass/Crew to `0.1.5` and both Statusline authorities to `0.1.1`. Regenerate all three committed outputs exclusively with `pnpm mint`.
- [ ] Run the full immutable-input gate:

```sh
pnpm build
pnpm mint
pnpm mint:check
pnpm artifact:check
pnpm provenance
pnpm check
```

Expected: all commands exit 0 and the regenerated artifacts/projections consistently carry the six new versions.

- [ ] Commit the version pairs and regenerated outputs before creating any tag:

```sh
git add packages/core/package.json packages/backstory/package.json packages/memory/package.json packages/glass/package.json packages/crew/package.json packages/statusline/package.json packages/core/mint/moe.yaml packages/backstory/mint/moe-backstory.yaml packages/memory/mint/moe-memory.yaml packages/glass/mint/moe-glass.yaml packages/crew/mint/moe-crew.yaml packages/statusline/mint/moe-statusline.yaml plugins .claude-plugin/marketplace.json docs/moe/generated/plugin-catalog.md
git commit -m "chore(release): prepare composed artifact genesis"
```

- [ ] Run candidate plan mode only after the commit:

```sh
pnpm --filter @bubstack/moe-mint exec moe-mint release candidate --tag v0.1.5-rc.1 --repo .
```

Expected: plan mode names six changed artifacts, six unused final package versions, and source SHA equal to `git rev-parse HEAD`. Save that SHA in the protected workflow approval record. Do not commit external evidence assets into the repository.

## Task 9: Publish and independently verify the `v0.1.5-rc.1` candidate

**Files:**

- Repository files: None
- External outputs: Git tag `v0.1.5-rc.1`; candidate GitHub prerelease; six tarballs; canonical bundle inventories; `SHA256SUMS`; `SHA512SUMS`; release lock; prerelease platform catalog

**Interfaces:**

- Consumes: the Task 8 release-ready SHA; protected `release-candidate` environment; npm OIDC; GitHub release permissions.
- Produces: complete self-contained candidate assets and exact six-version npm `next` state, or resumable draft state with no public platform catalog.

- [ ] Run one last read-only preflight at the release-ready SHA:

```sh
git diff --exit-code
git diff --cached --exit-code
pnpm --filter @bubstack/moe-mint exec moe-mint release candidate --tag v0.1.5-rc.1 --repo .
```

Expected: clean tracked/index state (unrelated ignored/untracked developer state may remain), six `changed` records, and no mutation.

- [ ] **HITL checkpoint — candidate publication:** obtain explicit operator approval to create and push `v0.1.5-rc.1`. This authorizes immutable npm publication under `next` and candidate GitHub release mutation only; it does not authorize stable promotion.
- [ ] After approval, create the annotated tag at the verified SHA and push only that tag:

```sh
git tag -a v0.1.5-rc.1 -m "Moe composed artifact candidate v0.1.5-rc.1"
git push origin v0.1.5-rc.1
```

- [ ] Observe `.github/workflows/publish.yml`. It must prepare/reuse the draft, upload the lock and every lock-bound asset before npm mutation, publish exact changed tarballs under `next`, verify all six registry integrities, and only then finalize the prerelease containing the complete catalog.
- [ ] If the workflow stops after partial publication, rerun the failed job from the existing Actions run. The recovery log must contain only `accept-existing` and `publish` actions derived from the draft lock; a pack/build attempt or missing/mismatched draft asset is a hard stop requiring investigation, not a new retry path.
- [ ] Independently verify the finalized candidate through the non-mutating CLI command added in Task 7:

```sh
pnpm --filter @bubstack/moe-mint exec moe-mint release verify --catalog-tag v0.1.5-rc.1 --repo .
```

Expected: six GitHub tarballs match checksum files and lock, six npm versions match recorded SHA-512 integrity under `next`, extracted artifact checks pass, and the catalog source SHA equals the candidate tag commit.

## Task 10: Certify Claude/macOS and promote the exact candidate to `v0.1.5`

**Files:**

- Repository files: None
- External outputs: six Claude/macOS evidence reports and redacted logs; Git tag `v0.1.5`; stable GitHub release/catalog; npm `latest` dist-tags

**Interfaces:**

- Consumes: verified candidate `v0.1.5-rc.1`; protected `claude-maintenance` and `release-stable` environments; six exact candidate subjects.
- Produces: five accepted Claude/macOS certifications, one accepted Statusline `preview/NO_PREDECESSOR` disposition, and stable platform catalog `moe-platform-v0.1.5.json` with candidate-identical artifact records.

- [ ] Trigger the protected evidence workflow with the candidate tag as its only input:

```sh
gh workflow run certify-claude-macos.yml --ref v0.1.5-rc.1 -f candidate_tag=v0.1.5-rc.1
```

- [ ] At the `claude-maintenance` environment prompt, verify the candidate tag/source SHA and approve the authenticated smoke. Require all six reports to pass install, discovery, every declared Claude capability, and uninstall; require real predecessor update passes for five packages and the exact locked `NO_PREDECESSOR` update skip for Statusline. Any other failed/skipped required result blocks promotion.
- [ ] Verify evidence bindings without mutation:

```sh
pnpm --filter @bubstack/moe-mint exec moe-mint release verify --catalog-tag v0.1.5-rc.1 --require-evidence claude-code:macos --repo .
pnpm --filter @bubstack/moe-mint exec moe-mint release promote --tag v0.1.5 --repo .
```

Expected: both commands plan zero pack/build/publish operations; promotion selects `v0.1.5-rc.1`, the same source SHA, six exact tarballs, five certification evidence checksums, and one Statusline preview evidence checksum.

- [ ] **HITL checkpoint — stable promotion:** obtain explicit operator approval to push stable tag `v0.1.5` and mutate npm `latest`. This is separate from candidate and evidence approval.
- [ ] Prove the stable tag targets the candidate commit, then create and push only that tag:

```sh
test "$(git rev-parse v0.1.5-rc.1^{commit})" = "$(git rev-parse HEAD)"
git tag -a v0.1.5 -m "Moe composed artifact release v0.1.5"
git push origin v0.1.5
```

- [ ] Observe stable promotion. If partially moved, rerun the same failed Actions job; exact already-moved tags are accepted, and remaining tags resume from the candidate catalog. Any integrity mismatch or newer `latest` blocks.
- [ ] Verify final state read-only:

```sh
pnpm --filter @bubstack/moe-mint exec moe-mint release verify --catalog-tag v0.1.5 --require-evidence claude-code:macos --repo .
```

Expected: all six npm identities/versions/integrities match `latest`; candidate and stable tarball bytes/artifact records match; the five predecessor-backed Claude/macOS rows are certified; Statusline Claude/macOS and every non-Claude emitted tuple remain preview; no incomplete platform catalog is visible.

## Plan 4 Completion Evidence

- Candidate preparation packs each changed artifact exactly once and every release mirrors all six verified tarballs.
- Retries consume durable draft assets and exact npm integrity; no partial platform catalog becomes visible.
- Six authenticated Claude Code/macOS reports bind lifecycle and declared capability results to exact candidate digests; five certify and Statusline remains preview with locked `NO_PREDECESSOR` evidence.
- Stable promotion performs no pack, build, or npm publish and moves only verified immutable versions to `latest`.
- Candidate and stable plugin artifact records/bytes are identical; only platform version/channel and accepted evidence bindings differ.
- The first stable composed-artifact `0.1.x` catalog is published, non-Claude output remains preview, and all repository gates pass.
