# Moe Platform Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish one validated platform registry, migrate all six public package configurations to typed artifact and target intent, and generate every registry projection from those authorities.

**Architecture:** `moe-platform.yaml` owns the cross-package set, target IDs, profiles, operating-system vocabulary, and release policy. Package-local Mint YAML owns plugin identity and intent. Mint resolves both into a typed model, adapters return validated emitted capabilities, and projection writers derive the Claude marketplace, public catalog, and ephemeral publish matrix without introducing another hand-authored registry.

**Tech Stack:** Node.js 24, TypeScript, Zod, YAML, Vitest, pnpm, Turbo

**Spec:** `docs/moe/specs/2026-09-02-moe-artifact-registry-foundation-design.md`

## Global Constraints

- Work from execution base SHA `9103fa504751937f2ee8f1cf1b67bc61d1b7e4ad`; record a new SHA in any delegated review because findings are tree-scoped.
- Never hand-edit `plugins/`. Regenerate it with `pnpm mint` after source and Mint changes.
- Keep `moe-platform.yaml` free of plugin versions, descriptions, authors, licenses, repositories, homepages, keywords, entry points, and dependency data.
- Keep plugin ID (`moe-memory`) distinct from npm identity (`@bubstack/moe-memory`).
- Preserve the current `ADAPTER_NAMES` values as the canonical `TARGET_IDS` set, then import that one tuple everywhere. `copilot` requires `claude-code` and shares Claude's projection rather than emitting a second layout.
- Expected capabilities must exactly equal sorted, deduplicated emitted capabilities for both `certify` and `preview`. Generation alone never establishes certification.
- Preserve `packages/core/skill-tiers.yaml`, the frozen imported-skill set, root runtime/test project-reference separation, and centralized `NOTICE` ownership.
- Diagnostics introduced here use stable codes and structured context; tests assert those fields, not rendered prose.

## Open Decisions

None. The approved design fixes the registry authority, canonical IDs, target prerequisite, capability vocabulary, OS vocabulary, and projection ownership.

## Not Yet Specified

- Target-specific `required_core_operating_systems` lists belong to the later Core certification design. All non-Claude foundation rows remain `preview` unless later evidence says otherwise.
- The common lifecycle CLI, receipts, installation rollback, and multi-host selection are follow-on work.

## Out of Scope

- Composing runtime `package.json` files or staging package payloads (Plan 2).
- Complete artifact manifests, pack/extract checks, and bundled-content provenance (Plan 3).
- Publishing packages, release catalogs, npm dist-tags, or certification evidence (Plan 4).

---

## File Structure

| Path | Responsibility |
| --- | --- |
| `moe-platform.yaml` | Human-authored cross-plugin registry and platform/release policy. |
| `packages/mint/src/diagnostics.ts` | Stable diagnostic codes and structured `MintDiagnostic`/`MintError`. |
| `packages/mint/src/vocabulary.ts` | Single target, capability, operating-system, and intent vocabulary. |
| `packages/mint/src/platform/schema.ts` | Strict Zod schema and public registry/config vocabulary. |
| `packages/mint/src/platform/load.ts` | Contained-path loading and cross-authority resolution. |
| `packages/mint/src/platform/capabilities.ts` | Capability vocabulary, compatibility mapping, and exact-set validation. |
| `packages/mint/src/platform/projections.ts` | Deterministic marketplace, public catalog, and publish-matrix renderers. |
| `packages/mint/src/config.ts` | Package-local distribution, payload, target, OS, and imported-work parsing. |
| `packages/mint/src/adapters/types.ts` | Per-plugin emitted-capability result on `AdapterEmission`. |
| `packages/mint/src/adapters/` | Adapter-specific capability calculation from actual emitted files. |
| `packages/core/mint/moe.yaml` and five sibling package configs | Six migrated plugin policies. |
| Six public source `package.json` files | Duplicate metadata normalized to the approved GitHub authority. |
| `.claude-plugin/marketplace.json` | Generated Claude marketplace projection. |
| `docs/moe/generated/plugin-catalog.md` | Generated public six-plugin and target matrix. |
| `scripts/mint-plugins.mjs` | Thin caller of the registry resolver and projection writers during the migration. |
| Mint platform test files named in Tasks 1–6 | Schema, resolution, capability, and projection contract tests. |

## Task 1: Add structured diagnostics and the strict platform-registry schema

**Files:**

- Create: `moe-platform.yaml`
- Create: `packages/mint/src/diagnostics.ts`
- Create: `packages/mint/src/vocabulary.ts`
- Create: `packages/mint/src/platform/schema.ts`
- Create: `packages/mint/src/platform/load.ts`
- Create: `packages/mint/test/platform-schema.test.ts`
- Modify: `packages/mint/src/config.ts`
- Modify: `packages/mint/src/adapters/index.ts`
- Modify: `packages/mint/test/adapters/registry.test.ts`

**Interfaces:**

- Consumes: repository root; raw `moe-platform.yaml`; the existing `ADAPTER_NAMES` tuple currently declared in `packages/mint/src/config.ts`.
- Produces: `TargetId`, `CapabilityId`, `OperatingSystemId`, `TargetIntent`, `PlatformRegistryV1`, `MintDiagnostic`, `MintError`, `loadPlatformRegistry(repoRoot): Promise<PlatformRegistryV1>`.

- [ ] Write the failing schema tests, including valid loading and rejection of unknown target IDs, duplicate plugin IDs/paths, unknown profile members, absolute paths, `..` traversal, unsupported OS IDs, and forbidden plugin metadata at registry scope.

```ts
it("rejects a registry path that escapes the repository", async () => {
  await expect(loadPlatformRegistry(fixtureRoot("escaping-registry"))).rejects.toMatchObject({
    diagnostic: {
      code: "PLATFORM_PATH_ESCAPE",
      source: "moe-platform.yaml",
      field: "plugins[0].source",
    },
  });
});
```

- [ ] Run `pnpm --filter @bubstack/moe-mint exec vitest run test/platform-schema.test.ts`; expect failure because the platform modules do not exist.
- [ ] Add the stable diagnostic model. Use one error to carry one actionable primary diagnostic and allow commands to aggregate diagnostics at a higher level.

```ts
export interface MintDiagnostic {
  severity: "error" | "warning";
  code: string;
  plugin?: string;
  target?: string;
  source: string;
  field?: string;
  path?: string;
  message: string;
  action: string;
}

export class MintError extends Error {
  constructor(readonly diagnostic: MintDiagnostic) {
    super(diagnostic.message);
    this.name = "MintError";
  }
}
```

- [ ] Move the current `ADAPTER_NAMES` values into the shared vocabulary as `TARGET_IDS`; import that single tuple from config, platform schema, and the adapter registry. Define strict version-1 schemas and reject unknown keys rather than stripping them.

```ts
export const TARGET_IDS = [
  "claude-code", "cursor", "codex", "kimi", "opencode", "pi",
  "agent-plugins-1.0", "copilot",
] as const;
export type TargetId = (typeof TARGET_IDS)[number];

export const CAPABILITY_IDS = [
  "skill-discovery", "skill-invocation", "command-discovery",
  "command-invocation", "agent-discovery", "hook-execution",
  "mcp-registration", "bootstrap-routing", "executable-invocation",
  "format-conformance",
] as const;

export type CapabilityId = (typeof CAPABILITY_IDS)[number];
export type TargetIntent = "certify" | "preview" | "omit";
export type OperatingSystemId = "macos" | "linux" | "wsl2" | "windows";
```

- [ ] Implement `loadPlatformRegistry()` with YAML parsing, strict schema validation, realpath/relative containment checks, duplicate resolved-path checks, profile membership checks, and the exact pinned OpenCode/Pi contract records from the spec.
- [ ] Add `moe-platform.yaml` with schema 1, all eight targets, the `core` profile, all six public plugins, OS policy, npm origin, GitHub mirror, and stable/prerelease channels exactly as approved.
- [ ] Route current `ConfigError` construction through `MintError` without changing existing CLI exit behavior; retain rendered detail for humans.
- [ ] Run the focused test again; expect all cases to pass.
- [ ] Run `pnpm --filter @bubstack/moe-mint typecheck` and `pnpm --filter @bubstack/moe-mint test`; expect both to pass.
- [ ] Commit only this task's files:

```sh
git add moe-platform.yaml packages/mint/src/diagnostics.ts packages/mint/src/vocabulary.ts packages/mint/src/platform/schema.ts packages/mint/src/platform/load.ts packages/mint/src/config.ts packages/mint/src/adapters/index.ts packages/mint/test/platform-schema.test.ts packages/mint/test/adapters/registry.test.ts
git commit -m "feat(mint): add platform registry schema"
```

## Task 2: Type the package-local distribution, artifact, target, and imported-work policy

**Files:**

- Modify: `packages/mint/src/config.ts`
- Modify: `packages/mint/src/platform/load.ts`
- Modify: `packages/mint/test/config.test.ts`
- Create: `packages/mint/test/platform-resolution.test.ts`
- Create fixture directory: `packages/mint/test/fixtures/config/`

**Interfaces:**

- Consumes: `PlatformRegistryV1`; package-local YAML; source package manifests; existing `harnesses.<id>` settings.
- Produces: typed `DistributionConfig`, `ArtifactPayload`, `PluginTargetIntent`, `ImportedWorkRef`, `ResolvedPlugin`, `ResolvedPlatform`; `resolvePlugin(...)`; `resolvePlatform(repoRoot): Promise<ResolvedPlatform>`; migration validation between `targets` and `harnesses.exclude`.

- [ ] Add failing tests for the typed package-local fields and every negative policy: unscoped/invalid npm names, glob or traversal payloads, reserved destinations, missing required booleans, unknown targets/capabilities/OS IDs, duplicate imported work names, omitted targets with settings, Copilot without Claude, and source `os`/`cpu` contradictions.

```ts
expect(resolvePlugin(platform, parsed, sourceManifest)).toMatchObject({
  id: "moe-memory",
  npmPackage: "@bubstack/moe-memory",
  targets: {
    "claude-code": { intent: "certify" },
    codex: { intent: "preview" },
  },
});
```

- [ ] Run `pnpm --filter @bubstack/moe-mint exec vitest run test/config.test.ts test/platform-resolution.test.ts`; expect the new typed cases to fail.
- [ ] Extend `rawSchema` with strict `distribution`, `artifact`, `targets`, and object-form `imported_works` schemas.

```ts
export interface ArtifactPayload {
  from: string;
  to: string;
  required: boolean;
}

export interface PluginTargetIntent {
  intent: TargetIntent;
  expectedCapabilities: readonly CapabilityId[];
  operatingSystems?: readonly OperatingSystemId[];
}

export interface ResolvedPlugin {
  id: string;
  npmPackage: string;
  version: string;
  sourcePath: string;
  configPath: string;
  packageJson: Readonly<Record<string, unknown>>;
  config: MintConfig;
  targets: Readonly<Record<TargetId, PluginTargetIntent>>;
}

export interface ResolvedPlatform {
  registry: PlatformRegistryV1;
  plugins: readonly ResolvedPlugin[];
}
```

- [ ] Normalize `from`/`to` lexically at parse time, reject globs and reserved destinations, and leave filesystem existence checks for Plan 2 staging. Require `operatingSystems` for host targets and forbid it for the `agent-plugins-1.0` format target.
- [ ] Enforce the temporary migration equivalence: `omit` equals `harnesses.exclude`; `certify`/`preview` equals active. Enforce target prerequisites from the platform registry and prohibit target settings for an omitted adapter.
- [ ] Reconcile source npm name/version/license and OS/CPU constraints with typed package policy. Emit codes `PACKAGE_NAME_MISMATCH`, `PACKAGE_VERSION_MISMATCH`, `PACKAGE_LICENSE_MISMATCH`, and `TARGET_OS_CONTRADICTION` with plugin/source/field context.
- [ ] Convert scalar imported works into a targeted migration error whose action names the required `{name: ...}` form; do not silently accept both forms indefinitely.
- [ ] Run the focused tests; expect pass. Run the existing Mint suite; expect no regression.
- [ ] Commit:

```sh
git add packages/mint/src/config.ts packages/mint/src/platform/load.ts packages/mint/test/config.test.ts packages/mint/test/platform-resolution.test.ts packages/mint/test/fixtures/config
git commit -m "feat(mint): type artifact and target policy"
```

## Task 3: Migrate all six public packages and reconcile duplicate metadata

**Files:**

- Modify: `packages/core/mint/moe.yaml`
- Modify: `packages/backstory/mint/moe-backstory.yaml`
- Modify: `packages/memory/mint/moe-memory.yaml`
- Modify: `packages/glass/mint/moe-glass.yaml`
- Modify: `packages/crew/mint/moe-crew.yaml`
- Modify: `packages/statusline/mint/moe-statusline.yaml`
- Modify: `packages/core/package.json`
- Modify: `packages/backstory/package.json`
- Modify: `packages/memory/package.json`
- Modify: `packages/glass/package.json`
- Modify: `packages/crew/package.json`
- Modify: `packages/statusline/package.json`
- Create: `packages/mint/test/public-registry.test.ts`

**Interfaces:**

- Consumes: the Task 2 schemas; existing component paths and adapter settings; source runtime manifest fields.
- Produces: six fully resolved public plugin records with canonical GitHub metadata, explicit payload roots, target intent/capabilities/OS policy, npm identity, and typed imported works.

- [ ] Add one failing table-driven test that loads the real root registry and all six real configs. Assert one-to-one IDs, source/config paths, exact npm identities, version/license agreement, target migration agreement, target prerequisites, and canonical repository/homepage.

```ts
expect(resolved.map(({ id, npmPackage }) => [id, npmPackage])).toEqual([
  ["moe", "@bubstack/moe-core"],
  ["moe-backstory", "@bubstack/moe-backstory"],
  ["moe-memory", "@bubstack/moe-memory"],
  ["moe-glass", "@bubstack/moe-glass"],
  ["moe-crew", "@bubstack/moe-crew"],
  ["moe-statusline", "@bubstack/moe-statusline"],
]);
```

- [ ] Run `pnpm --filter @bubstack/moe-mint exec vitest run test/public-registry.test.ts`; expect failure on missing typed fields and the known GitLab/divergent metadata.
- [ ] Add `distribution.npm`, explicit `artifact.payloads`, all eight `targets` (including intentional omissions), and object-form `imported_works` to each Mint YAML. Preserve every existing component and adapter-specific setting.
- [ ] Declare runtime payloads package by package: Core `[]`; Backstory `[]`; Memory required `dist -> dist` and `prompts -> prompts`; Glass required `dist -> dist`; Crew required `dist -> dist`; Statusline required `dist -> dist` and `vendor -> vendor`. Exclude tests, source maps, package-local input YAML, and contributor-only material.
- [ ] Normalize duplicated metadata using the spec rules: object-form author, exact SPDX license, NFC/CRLF description comparison, canonical `https://github.com/zak-keown/moe` repository/homepage, and Mint-ordered keyword set. Do not change plugin IDs, scoped npm names, or current independent versions in this task.
- [ ] Declare Claude `certify`, other active targets `preview`, and Statusline's non-Claude targets `omit`. Use all four OS IDs for intended host tuples except Crew (`macos`, `linux`, `wsl2`); Agent Plugins has no OS axis. Lock the initial exact capability matrix below—do not infer invocation/executable capabilities from structural output alone.

| Plugin | Claude | Cursor | Codex | Kimi | OpenCode | Pi | Agent Plugins | Copilot |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `moe` | `skill-discovery`, `agent-discovery`, `hook-execution`, `bootstrap-routing` | `skill-discovery`, `hook-execution`, `bootstrap-routing` | `skill-discovery` | `skill-discovery`, `bootstrap-routing` | `skill-discovery`, `agent-discovery`, `bootstrap-routing` | `skill-discovery`, `bootstrap-routing` | `skill-discovery`, `format-conformance` | exact Claude set |
| `moe-backstory` | `skill-discovery`, `command-discovery`, `agent-discovery` | `skill-discovery` | `skill-discovery` | `skill-discovery` | `skill-discovery`, `command-discovery`, `agent-discovery` | `skill-discovery` | `skill-discovery`, `format-conformance` | exact Claude set |
| `moe-memory` | `skill-discovery`, `agent-discovery`, `hook-execution`, `mcp-registration`, `bootstrap-routing` | `skill-discovery`, `hook-execution`, `bootstrap-routing` | `skill-discovery` | `skill-discovery`, `bootstrap-routing` | `skill-discovery`, `agent-discovery`, `bootstrap-routing` | `skill-discovery`, `bootstrap-routing` | `skill-discovery`, `mcp-registration`, `format-conformance` | exact Claude set |
| `moe-glass` | `skill-discovery`, `agent-discovery` | `skill-discovery` | `skill-discovery` | `skill-discovery` | `skill-discovery`, `agent-discovery` | `skill-discovery` | `skill-discovery`, `format-conformance` | exact Claude set |
| `moe-crew` | `skill-discovery`, `hook-execution` | `skill-discovery` | `skill-discovery` | `skill-discovery` | `skill-discovery` | `skill-discovery` | `skill-discovery`, `format-conformance` | exact Claude set |
| `moe-statusline` | `hook-execution` | omit | omit | omit | omit | omit | omit | omit |
- [ ] Run the public-registry test and existing package metadata tests. If a guarded metadata test changes, cite its test name or symbol in the commit message/body rather than a line number.
- [ ] Commit:

```sh
git add packages/core/mint/moe.yaml packages/backstory/mint/moe-backstory.yaml packages/memory/mint/moe-memory.yaml packages/glass/mint/moe-glass.yaml packages/crew/mint/moe-crew.yaml packages/statusline/mint/moe-statusline.yaml packages/core/package.json packages/backstory/package.json packages/memory/package.json packages/glass/package.json packages/crew/package.json packages/statusline/package.json packages/mint/test/public-registry.test.ts
git commit -m "chore(mint): migrate public plugin policies"
```

## Task 4: Replace static support claims with validated emitted capabilities

**Files:**

- Create: `packages/mint/src/platform/capabilities.ts`
- Create: `packages/mint/test/platform-capabilities.test.ts`
- Modify: `packages/mint/src/adapters/types.ts`
- Modify: `packages/mint/src/adapters/index.ts`
- Modify: `packages/mint/src/adapters/agent-plugins.ts`
- Modify: `packages/mint/src/adapters/claude-code.ts`
- Modify: `packages/mint/src/adapters/codex.ts`
- Modify: `packages/mint/src/adapters/copilot.ts`
- Modify: `packages/mint/src/adapters/cursor.ts`
- Modify: `packages/mint/src/adapters/kimi.ts`
- Modify: `packages/mint/src/adapters/opencode.ts`
- Modify: `packages/mint/src/adapters/pi.ts`
- Modify: `packages/mint/src/generate.ts`
- Modify: `packages/mint/test/adapters/registry.test.ts`
- Modify: `packages/mint/test/adapters/copilot.test.ts`

**Interfaces:**

- Consumes: resolved plugin target intent; adapter-generated files; temporary `HarnessAdapter.support` compatibility map.
- Produces: `AdapterEmission.emittedCapabilities`; `validateEmittedCapabilities(plugin, target, expected, emitted)`; Copilot projection-owner result.

- [ ] Add failing golden tests that map current `full`/`partial`/`none` component support plus actual emitted paths into the version-1 capability vocabulary. Include a mismatch, duplicate capability, undeclared extra, omitted target, Agent Plugins format-conformance, and Copilot-without-Claude case.
- [ ] Run `pnpm --filter @bubstack/moe-mint exec vitest run test/platform-capabilities.test.ts test/adapters/registry.test.ts test/adapters/copilot.test.ts`; expect failures on the missing emission contract.
- [ ] Change adapter emission to carry capabilities calculated for the current plugin, not a universal certification claim.

```ts
export interface AdapterEmission {
  files: FileSet;
  limitations: readonly EmissionLimitation[];
  emittedCapabilities: readonly CapabilityId[];
  projectionOwner?: TargetId;
}

export interface EmissionLimitation {
  code: "COMPONENT_OMITTED" | "COMPONENT_PARTIAL" | "SETTING_DROPPED";
  component: "skills" | "commands" | "agents" | "hooks" | "mcp" | "bootstrap";
  message: string;
}
```

- [ ] Implement the compatibility mapper as a named transitional function. Validate capabilities against files/metadata and sort/deduplicate before exact equality. Convert every present expected partial/omitted-output warning into a typed `EmissionLimitation` validated against the target's absent capabilities; delete the free-form adapter `warnings` field. Any unrecognized free-form warning remains a generation error. Optional-payload omission is compositor state, not an adapter warning.
- [ ] Make Copilot return `projectionOwner: "claude-code"` and capabilities derived from the validated Claude files. It must not emit duplicate files or independently claim capabilities.
- [ ] Update all adapter tests to assert emitted capability IDs alongside file output. Keep the legacy `support` field only until every adapter test proves direct emission, then remove it from `HarnessAdapter` in the same task.
- [ ] Run all adapter tests, the capability tests, Mint typecheck, and Mint test; expect pass.
- [ ] Commit:

```sh
git add packages/mint/src/platform/capabilities.ts packages/mint/src/adapters packages/mint/src/generate.ts packages/mint/test/platform-capabilities.test.ts packages/mint/test/adapters
git commit -m "feat(mint): validate emitted capabilities"
```

## Task 5: Generate marketplace, public catalog, and publish-matrix projections

**Files:**

- Create: `packages/mint/src/platform/projections.ts`
- Create: `packages/mint/test/platform-projections.test.ts`
- Create: `packages/mint/test/publish-matrix.test.ts`
- Create: `docs/moe/generated/plugin-catalog.md`
- Modify: `.claude-plugin/marketplace.json`
- Modify: `scripts/mint-plugins.mjs`
- Modify: `packages/mint/src/cli.ts`
- Modify: `packages/mint/test/cli.test.ts`
- Modify: `packages/mint/src/docs-emit.ts`
- Modify: `packages/mint/test/docs-emit.test.ts`
- Modify: `packages/mint/test/generate.test.ts`
- Modify: `.github/workflows/publish.yml`
- Regenerate directory: `plugins/`

**Interfaces:**

- Consumes: `ResolvedPlatform`; validated `PluginProjectionRecord[]`; current package versions and summaries.
- Produces: `PluginProjectionRecord`, `renderMarketplace()`, `renderPublicCatalog()`, `resolvePublishMatrix()`, `writeRegistryProjections()`; CLI-accessible ephemeral JSON publish matrix.

```ts
export interface PluginProjectionRecord {
  plugin: ResolvedPlugin;
  emissions: Readonly<Partial<Record<TargetId, AdapterEmission>>>;
}

export interface PublishMatrixEntry {
  plugin: string;
  package: string;
  version: string;
  sourcePackagePath: string;
  generatedArtifactPath: string;
}

export interface ProjectionDestinations {
  marketplacePath: string;
  publicCatalogPath: string;
}

export function writeRegistryProjections(
  platform: ResolvedPlatform,
  artifacts: readonly PluginProjectionRecord[],
  destinations: ProjectionDestinations,
): Promise<void>;

export function renderMarketplace(
  platform: ResolvedPlatform,
  artifacts: readonly PluginProjectionRecord[],
): string;

export function renderPublicCatalog(
  platform: ResolvedPlatform,
  artifacts: readonly PluginProjectionRecord[],
): string;

export function resolvePublishMatrix(
  platform: ResolvedPlatform,
  artifacts: readonly PluginProjectionRecord[],
): readonly PublishMatrixEntry[];
```

- [ ] Add failing golden tests for deterministic ordering and one-to-one agreement among registry plugins, real Mint configs, marketplace entries, generated trees, public catalog rows, and the exact `PublishMatrixEntry` fields. Assert that no hard-coded six-plugin list remains in the renderer or `scripts/mint-plugins.mjs`, and reject a projection destination outside its exact repository path.

```ts
const matrix = resolvePublishMatrix(platform, artifacts);
expect(matrix).toHaveLength(6);
expect(new Set(matrix.map((entry) => entry.plugin))).toEqual(
  new Set(platform.plugins.map((plugin) => plugin.id)),
);
```

- [ ] Run `pnpm --filter @bubstack/moe-mint exec vitest run test/platform-projections.test.ts test/publish-matrix.test.ts test/cli.test.ts`; expect failure because projections are still hand-maintained/hard-coded.
- [ ] Implement canonical JSON serialization with a trailing newline and a deterministic Markdown table renderer. The public catalog includes six plugin IDs, npm identities, summaries, and emitted target matrix; it labels structural output as preview, never certified.
- [ ] Require every renderer to consume the validated `PluginProjectionRecord[]` from the current generation. Never reconstruct emitted capabilities from `expected_capabilities`, and never reread canonical `plugins/` while rendering a staged generation.
- [ ] Generate `.claude-plugin/marketplace.json` from the Claude projection only. Set root `name` from the default profile ID, derive `owner` from that profile's plugin author, and omit optional root `metadata` instead of inventing a second description/version authority. Preserve the schema required by `checkMarketplace()` and replace that script's literal-list comparison with resolver output.
- [ ] Add a non-mutating CLI route that prints the ephemeral publish matrix as JSON for Plan 4. It must read the registry at runtime and must not commit another matrix file.
- [ ] Remove `injectReadme()` and its marker-owned support table because README files remain wholly human-authored. Keep per-artifact install docs only when their content is part of a declared artifact path, and render any support data from emitted capabilities.
- [ ] Change the current source-directory publish workflow to consume the ephemeral matrix rather than its literal six-package loop. This is an interim registry-consistency step only; Plan 4 replaces directory publication with exact tarball publication.
- [ ] Call `writeRegistryProjections()` from the current root mint orchestration. Plan 2 will replace staging, but this plan must leave `pnpm mint` and `pnpm mint:check` green.
- [ ] Run the focused tests, then `pnpm mint` and `pnpm mint:check`; expect deterministic, byte-identical projections and generated trees.
- [ ] Commit generated projections with their authorities:

```sh
git add packages/mint/src/platform/projections.ts packages/mint/test/platform-projections.test.ts packages/mint/test/publish-matrix.test.ts packages/mint/src/cli.ts packages/mint/test/cli.test.ts packages/mint/src/docs-emit.ts packages/mint/test/docs-emit.test.ts packages/mint/test/generate.test.ts scripts/mint-plugins.mjs .github/workflows/publish.yml .claude-plugin/marketplace.json docs/moe/generated/plugin-catalog.md plugins
git commit -m "feat(mint): generate registry projections"
```

## Task 6: Close Plan 1 with cache inputs and repository-wide verification

**Files:**

- Modify: `turbo.json`
- Modify: `package.json`
- Modify: `packages/mint/package.json`
- Modify: `packages/mint/test/platform-projections.test.ts`
- Modify: `docs/moe/specs/2026-09-02-moe-artifact-registry-foundation-design.md`
- Regenerate if changed: `.claude-plugin/marketplace.json`
- Regenerate if changed: `docs/moe/generated/plugin-catalog.md`
- Modify if generated: `plugins/**`

**Interfaces:**

- Consumes: all Plan 1 source, configuration, and generated-projection inputs.
- Produces: correct Turbo invalidation for registry/config/adapter changes and an implementation-progress design status.

- [ ] Add a failing cache/input/gate assertion to `packages/mint/test/platform-projections.test.ts` that reads `turbo.json` and root `package.json`: require `moe-platform.yaml`, package Mint YAML, source package manifests, adapter source, and the generation script as Mint inputs, and require `mint:check` to diff `plugins/`, `.claude-plugin/marketplace.json`, and `docs/moe/generated/plugin-catalog.md`. Do not yet claim Plan 2 runtime output or Plan 3 legal/bundle inputs are complete.
- [ ] Run the test; expect it to fail on the current narrow `//#mint:generate` inputs.
- [ ] Expand the Mint task inputs and outputs minimally for Plan 1. Preserve build dependency on `@bubstack/moe-mint#build`; Plans 2 and 3 will add runtime/legal/bundle coverage.
- [ ] Change the design status to `Implementation in progress; platform-registry plan complete.` and remove no design content.
- [ ] Run the complete Plan 1 gate:

```sh
pnpm --filter @bubstack/moe-mint typecheck
pnpm --filter @bubstack/moe-mint test
pnpm mint
pnpm mint:check
pnpm check
```

Expected: every command exits 0; the second generation is byte-identical; `git status --short -- plugins .claude-plugin/marketplace.json docs/moe/generated/plugin-catalog.md` is clean after committing generated output.

- [ ] Commit:

```sh
git add turbo.json package.json packages/mint/package.json docs/moe/specs/2026-09-02-moe-artifact-registry-foundation-design.md plugins .claude-plugin/marketplace.json docs/moe/generated/plugin-catalog.md
git commit -m "test(mint): gate platform registry projections"
```

## Plan 1 Completion Evidence

- `moe-platform.yaml` is the only hand-authored public plugin registry.
- All six real configs load through the typed schema and agree with their source manifests.
- All eight adapters return validated emitted capability sets; Copilot is explicitly Claude-owned.
- Marketplace and public catalog projections reproduce byte-for-byte.
- The publish matrix is resolved ephemerally from the same model.
- `pnpm check` and `pnpm mint:check` pass.
