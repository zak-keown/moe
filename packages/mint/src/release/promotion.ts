import { compare } from 'semver'
import { MintError } from '../diagnostics.js'
import type { ReleaseStorePort, ReleaseRef, StableReleaseInput } from './github-release.js'
import type { NpmRegistryPort } from './npm-registry.js'
import type {
  PlatformCatalogV1,
  PluginCatalogRecordV1,
  CertificationTupleV1,
  CandidateLockV1,
} from './catalog.js'
import { buildStableCatalog, canonicalJson, sha256, REGISTRY_PLUGIN_COUNT } from './catalog.js'
import type { CertificationEvidenceV1, EvidenceExpectation } from './evidence.js'
import { evaluateEvidence } from './evidence.js'
import type { PlatformTag } from './tag-policy.js'
import { selectStableCandidate } from './tag-policy.js'

function promotionError(code: string, message: string, action: string, cause?: unknown): never {
  throw new MintError({
    severity: 'error',
    code,
    source: 'promotion',
    message,
    action,
  }, { cause })
}

export type DistTagAction =
  | { kind: 'move'; plugin: string; package: string; version: string }
  | { kind: 'already-latest'; plugin: string }
  | { kind: 'block'; plugin: string; code: string; message: string }

export interface PromotionDeps {
  releaseStore: ReleaseStorePort
  npmRegistry: NpmRegistryPort
}

export interface PromotionInput {
  stableTag: PlatformTag
  candidateTag: PlatformTag
  candidateCatalog: PlatformCatalogV1
  candidateLock: CandidateLockV1
  evidenceReports: ReadonlyMap<string, CertificationEvidenceV1>
  evidenceExpectations: ReadonlyMap<string, EvidenceExpectation>
  downloadedTarballs: ReadonlyMap<string, string>
}

export interface PromotionResult {
  actions: readonly DistTagAction[]
  stableCatalog: PlatformCatalogV1
  stableRelease: ReleaseRef
}

export function computeDistTagActions(
  catalog: PlatformCatalogV1,
  registryState: ReadonlyMap<string, { state: 'absent' | 'present'; integrity?: string; currentLatest?: string }>,
): readonly DistTagAction[] {
  const actions: DistTagAction[] = []

  for (const plugin of catalog.plugins) {
    const state = registryState.get(plugin.plugin)
    if (state === undefined) {
      actions.push({
        kind: 'block',
        plugin: plugin.plugin,
        code: 'PROMOTION_NO_REGISTRY_STATE',
        message: `no registry state for "${plugin.plugin}"`,
      })
      continue
    }

    if (state.state === 'absent') {
      actions.push({
        kind: 'block',
        plugin: plugin.plugin,
        code: 'PROMOTION_NOT_PUBLISHED',
        message: `"${plugin.package}@${plugin.version}" is not published on npm — publish it as a candidate first`,
      })
      continue
    }

    if (state.integrity !== plugin.artifact.tarball.integrity) {
      actions.push({
        kind: 'block',
        plugin: plugin.plugin,
        code: 'PROMOTION_INTEGRITY_MISMATCH',
        message: `"${plugin.package}@${plugin.version}" registry integrity does not match candidate`,
      })
      continue
    }

    if (state.currentLatest === plugin.version) {
      actions.push({ kind: 'already-latest', plugin: plugin.plugin })
      continue
    }

    if (state.currentLatest !== undefined) {
      if (compare(state.currentLatest, plugin.version) > 0) {
        actions.push({
          kind: 'block',
          plugin: plugin.plugin,
          code: 'PROMOTION_WOULD_DOWNGRADE',
          message: `"${plugin.package}" already has latest@${state.currentLatest} which is newer than ${plugin.version}`,
        })
        continue
      }
    }

    actions.push({
      kind: 'move',
      plugin: plugin.plugin,
      package: plugin.package,
      version: plugin.version,
    })
  }

  return actions
}

export function hasBlockingDistTagActions(actions: readonly DistTagAction[]): boolean {
  return actions.some((a) => a.kind === 'block')
}

export function movableActions(actions: readonly DistTagAction[]): readonly (DistTagAction & { kind: 'move' })[] {
  return actions.filter((a): a is DistTagAction & { kind: 'move' } => a.kind === 'move')
}

export function validateEvidenceForPromotion(
  catalog: PlatformCatalogV1,
  evidenceReports: ReadonlyMap<string, CertificationEvidenceV1>,
  expectations: ReadonlyMap<string, EvidenceExpectation>,
): ReadonlyMap<string, readonly CertificationTupleV1[]> {
  if (catalog.plugins.length !== REGISTRY_PLUGIN_COUNT) {
    promotionError('PROMOTION_INCOMPLETE', `expected ${REGISTRY_PLUGIN_COUNT} plugins`, 'Provide all six registry plugins.')
  }

  const certifications = new Map<string, readonly CertificationTupleV1[]>()
  let certifiedCount = 0
  let previewCount = 0

  for (const plugin of catalog.plugins) {
    const evidence = evidenceReports.get(plugin.plugin)
    if (evidence === undefined) {
      promotionError('PROMOTION_MISSING_EVIDENCE', `no evidence for "${plugin.plugin}"`, 'Provide certification evidence for all plugins.')
    }
    const expectation = expectations.get(plugin.plugin)
    if (expectation === undefined) {
      promotionError('PROMOTION_MISSING_EXPECTATION', `no expectation for "${plugin.plugin}"`, 'Provide evidence expectations for all plugins.')
    }

    const disposition = evaluateEvidence(evidence, expectation)
    const evidenceJson = canonicalJson(evidence)
    const evidenceSha256 = sha256(evidenceJson)

    const tuple: CertificationTupleV1 = {
      target: expectation.target,
      ...(expectation.os !== undefined ? { os: expectation.os } : {}),
      ...(expectation.arch !== undefined ? { arch: expectation.arch } : {}),
      status: disposition.status,
      evidence: {
        asset: `moe-evidence-${plugin.plugin}-claude-code-macos.json`,
        sha256: evidenceSha256,
        result_id: evidence.result_id,
      },
    }

    if (disposition.status === 'certified') certifiedCount++
    if (disposition.status === 'preview') previewCount++

    certifications.set(plugin.plugin, [tuple])
  }

  if (certifiedCount + previewCount !== REGISTRY_PLUGIN_COUNT) {
    promotionError(
      'PROMOTION_EVIDENCE_INCOMPLETE',
      `expected ${REGISTRY_PLUGIN_COUNT} evidence reports (${certifiedCount} certified, ${previewCount} preview)`,
      'Provide certification evidence for all plugins.',
    )
  }

  return certifications
}

export async function promoteToStable(
  input: PromotionInput,
  deps: PromotionDeps,
): Promise<PromotionResult> {
  if (input.stableTag.channel !== 'stable') {
    promotionError('PROMOTION_WRONG_CHANNEL', 'promotion requires a stable tag', 'Use a stable tag.')
  }
  if (input.candidateTag.channel !== 'prerelease') {
    promotionError('PROMOTION_WRONG_CHANNEL', 'candidate must be a prerelease tag', 'Use a prerelease candidate tag.')
  }
  if (input.candidateCatalog.plugins.length !== REGISTRY_PLUGIN_COUNT) {
    promotionError('PROMOTION_INCOMPLETE', `expected ${REGISTRY_PLUGIN_COUNT} plugins`, 'Provide all six registry plugins.')
  }

  const certifications = validateEvidenceForPromotion(
    input.candidateCatalog,
    input.evidenceReports,
    input.evidenceExpectations,
  )

  const registryState = new Map<string, {
    state: 'absent' | 'present'
    integrity?: string
    currentLatest?: string
  }>()
  for (const plugin of input.candidateCatalog.plugins) {
    const inspection = await deps.npmRegistry.inspectVersion(plugin.package, plugin.version)
    const tags = await deps.npmRegistry.inspectDistTags(plugin.package)
    const entry: { state: 'absent' | 'present'; integrity?: string; currentLatest?: string } = {
      state: inspection.state,
    }
    if (inspection.state === 'present') entry.integrity = inspection.integrity
    if (tags.latest !== undefined) entry.currentLatest = tags.latest
    registryState.set(plugin.plugin, entry)
  }

  const actions = computeDistTagActions(input.candidateCatalog, registryState)
  if (hasBlockingDistTagActions(actions)) {
    promotionError(
      'PROMOTION_BLOCKED',
      `promotion blocked: ${actions.filter((a) => a.kind === 'block').map((a) => (a as any).message).join('; ')}`,
      'Resolve all blocking issues before promoting.',
    )
  }

  const stableCatalog = buildStableCatalog(
    input.stableTag,
    input.candidateCatalog,
    certifications,
  )

  const existingStable = await deps.releaseStore.findByTag(input.stableTag.raw)
  const stableRelease = existingStable ?? await deps.releaseStore.createStable({
    tag: input.stableTag.raw,
    sourceSha: input.candidateCatalog.source.git_sha,
    title: `Moe ${input.stableTag.platformVersion}`,
    candidateTag: input.candidateTag.raw,
  })

  for (const plugin of input.candidateCatalog.plugins) {
    const tarballPath = input.downloadedTarballs.get(plugin.plugin)
    if (tarballPath === undefined) {
      promotionError('PROMOTION_TARBALL_MISSING', `tarball for "${plugin.plugin}" not provided`, 'Download all candidate tarballs before promoting.')
    }
    const tarballSha256 = plugin.artifact.mirror.sha256
    await deps.releaseStore.uploadExact(stableRelease, tarballPath, tarballSha256)
  }

  for (const action of movableActions(actions)) {
    await deps.npmRegistry.setDistTag(action.package, action.version, 'latest')
  }

  await deps.releaseStore.finalize(stableRelease, 'stable')

  return { actions, stableCatalog, stableRelease }
}
