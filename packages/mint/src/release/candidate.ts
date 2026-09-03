import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, basename } from 'node:path'
import { MintError } from '../diagnostics.js'
import type { PlatformTag } from './tag-policy.js'
import type { PublishMatrixEntry } from '../platform/projections.js'
import {
  canonicalJson,
  sha256,
  sha512Integrity,
  buildPrereleaseCatalog,
  detectChangedPlugins,
  requireVersionChangeForArtifactChange,
  REGISTRY_PLUGIN_COUNT,
  type CandidateLockV1,
  type PlatformCatalogV1,
  type PluginArtifactRecordV1,
  type PluginCatalogRecordV1,
  type ReleasePreflightV1,
} from './catalog.js'
import {
  buildReleaseAssetRecords,
  renderChecksumFile,
  type ReleaseAssetRecord,
} from './assets.js'
import type { ReleaseStorePort, ReleaseRef } from './github-release.js'
import type { PackedArtifact } from '../artifact/pack.js'
import type { ExpectedArtifactContext } from '../artifact/artifact-manifest.js'
import type { ResolvedPlugin } from '../platform/load.js'
import type { BundledPackage } from '../artifact/bundle-inventory.js'

function candidateError(code: string, message: string, action: string, cause?: unknown): never {
  throw new MintError({
    severity: 'error',
    code,
    source: 'release candidate',
    message,
    action,
  }, { cause })
}

export interface CandidateArtifactInput {
  plugin: ResolvedPlugin
  artifactRoot: string
  expected: ExpectedArtifactContext
  bundleInventory: readonly BundledPackage[]
  treeSha256: string
  manifestSha256: string
}

export interface CandidateInput {
  tag: PlatformTag
  sourceSha: string
  preflight: ReleasePreflightV1
  publishMatrix: readonly PublishMatrixEntry[]
  artifacts: readonly CandidateArtifactInput[]
  previous?: PlatformCatalogV1
  lockfileSha256: string
  registrySha256: string
  mintVersion: string
  outputDir: string
}

export interface CandidatePreparationDeps {
  pack: (artifactRoot: string, outputDir: string, expected: ExpectedArtifactContext) => Promise<PackedArtifact>
  verify: (tarballPath: string, expected: ExpectedArtifactContext) => Promise<PackedArtifact>
  releases: ReleaseStorePort
}

export interface CandidatePreparationResult {
  lock: CandidateLockV1
  catalogContent: string
  release: ReleaseRef
}

export async function prepareCandidate(
  input: CandidateInput,
  deps: CandidatePreparationDeps,
): Promise<CandidatePreparationResult> {
  if (input.tag.channel !== 'prerelease') {
    candidateError('CANDIDATE_WRONG_CHANNEL', 'candidate preparation requires a prerelease tag', 'Use a prerelease tag.')
  }
  if (input.preflight.platform_version !== input.tag.platformVersion) {
    candidateError('CANDIDATE_PREFLIGHT_MISMATCH', 'preflight platform version does not match tag', 'Use a preflight produced for this exact tag.')
  }
  if (input.preflight.source_sha !== input.sourceSha) {
    candidateError('CANDIDATE_PREFLIGHT_MISMATCH', 'preflight source SHA does not match', 'Use a preflight produced at this exact source SHA.')
  }
  if (input.artifacts.length !== REGISTRY_PLUGIN_COUNT) {
    candidateError('CANDIDATE_PLUGIN_COUNT', `expected ${REGISTRY_PLUGIN_COUNT} artifacts`, 'Provide all six registry plugin artifacts.')
  }

  for (const artifact of input.artifacts) {
    const preflightEntry = input.preflight.plugins.find((p) => p.plugin === artifact.plugin.id)
    if (preflightEntry === undefined) {
      candidateError('CANDIDATE_PREFLIGHT_MISMATCH', `plugin "${artifact.plugin.id}" not found in preflight`, 'Match artifacts to preflight entries.')
    }
    if (preflightEntry.proposed_version !== artifact.plugin.version) {
      candidateError('CANDIDATE_VERSION_MISMATCH', `plugin "${artifact.plugin.id}" version "${artifact.plugin.version}" does not match preflight proposed "${preflightEntry.proposed_version}"`, 'Use the exact version from the preflight.')
    }
    requireVersionChangeForArtifactChange(
      artifact.plugin.id,
      artifact.plugin.version,
      artifact.treeSha256,
      artifact.manifestSha256,
      input.previous,
    )
  }

  const changedMap = detectChangedPlugins(
    input.artifacts.map((a) => ({
      plugin: a.plugin.id,
      version: a.plugin.version,
      treeSha256: a.treeSha256,
      manifestSha256: a.manifestSha256,
    })),
    input.previous,
  )

  const packOutputDir = join(input.outputDir, 'tarballs')
  await mkdir(packOutputDir, { recursive: true })

  const pluginRecords: (PluginCatalogRecordV1 & { changed: boolean })[] = []
  const tarballMeta: { filename: string; bytes: number; sha256: string; integrity: `sha512-${string}` }[] = []
  const inventoryContents: { filename: string; content: string }[] = []

  for (const artifact of input.artifacts) {
    const changed = changedMap.get(artifact.plugin.id) ?? true
    let packed: PackedArtifact

    if (changed) {
      const pluginPackDir = join(packOutputDir, artifact.plugin.id)
      await mkdir(pluginPackDir, { recursive: true })
      packed = await deps.pack(artifact.artifactRoot, pluginPackDir, artifact.expected)
    } else {
      const priorRecord = input.previous!.plugins.find((p) => p.plugin === artifact.plugin.id)!
      const downloadDir = join(input.outputDir, 'downloads')
      await mkdir(downloadDir, { recursive: true })

      const priorTag = `v${input.previous!.platform_version}`
      let release = await deps.releases.findByTag(priorTag)
      if (release === undefined) {
        candidateError('CANDIDATE_PRIOR_RELEASE_MISSING', `prior release "${priorTag}" not found`, 'Verify the prior catalog references a published release.')
      }
      await deps.releases.download(release, priorRecord.artifact.mirror.asset, downloadDir)
      const tarballPath = join(downloadDir, priorRecord.artifact.mirror.asset)
      packed = await deps.verify(tarballPath, artifact.expected)
    }

    const inventoryContent = canonicalJson(artifact.bundleInventory)
    const inventoryFilename = `${artifact.plugin.id}-bundle-inventory.json`
    inventoryContents.push({ filename: inventoryFilename, content: inventoryContent })

    const artifactRecord: PluginArtifactRecordV1 = {
      artifact_tree_sha256: artifact.treeSha256,
      artifact_manifest_sha256: artifact.manifestSha256,
      tarball: { integrity: packed.integrity, bytes: packed.bytes },
      mirror: { asset: packed.filename, sha256: packed.sha256 },
      legal: {
        files: {},
        bundle_inventory_sha256: sha256(inventoryContent),
      },
      emitted_capabilities: Object.fromEntries(
        Object.entries(artifact.expected.targets).map(([target, value]) => [target, value.emitted_capabilities]),
      ) as PluginArtifactRecordV1['emitted_capabilities'],
    }

    tarballMeta.push({
      filename: packed.filename,
      bytes: packed.bytes,
      sha256: packed.sha256,
      integrity: packed.integrity,
    })

    pluginRecords.push({
      plugin: artifact.plugin.id,
      package: artifact.plugin.npmPackage,
      version: artifact.plugin.version,
      artifact: artifactRecord,
      certification: [],
      changed,
    })
  }

  const pluginHashes = new Map(
    tarballMeta.map((t) => {
      const sha512 = createHash('sha512').update('').digest('hex')
      return [t.filename, { sha256: t.sha256, sha512 }] as const
    }),
  )

  const sha256Rows = tarballMeta.map((t) => ({ hash: t.sha256, filename: t.filename }))
  const sha256sumsContent = renderChecksumFile(sha256Rows)

  const sha512Rows = tarballMeta.map((t) => {
    const hash = t.integrity.replace('sha512-', '')
    const hexHash = Buffer.from(hash, 'base64').toString('hex')
    return { hash: hexHash, filename: t.filename }
  })
  const sha512sumsContent = renderChecksumFile(sha512Rows)

  const catalogPlugins: PluginCatalogRecordV1[] = pluginRecords.map(({ changed: _changed, ...rest }) => rest)
  const catalog = buildPrereleaseCatalog(
    input.tag,
    input.sourceSha,
    input.lockfileSha256,
    input.registrySha256,
    input.mintVersion,
    catalogPlugins,
  )
  const catalogContent = canonicalJson(catalog)

  const releaseAssets = buildReleaseAssetRecords(
    tarballMeta,
    inventoryContents,
    sha256sumsContent,
    sha512sumsContent,
    catalogContent,
  )

  const lock: CandidateLockV1 = {
    schema: 1,
    platform_version: input.tag.platformVersion,
    source_sha: input.sourceSha,
    publish_matrix: input.publishMatrix,
    preflight: input.preflight,
    plugins: pluginRecords,
    release_assets: releaseAssets,
  }

  const lockContent = canonicalJson(lock)
  const lockFilename = `moe-release-lock-v${input.tag.platformVersion}.json`

  await writeFile(join(input.outputDir, lockFilename), lockContent)
  await writeFile(join(input.outputDir, 'SHA256SUMS'), sha256sumsContent)
  await writeFile(join(input.outputDir, 'SHA512SUMS'), sha512sumsContent)
  await writeFile(join(input.outputDir, `moe-platform-v${input.tag.platformVersion}.json`), catalogContent)
  for (const inv of inventoryContents) {
    await writeFile(join(input.outputDir, inv.filename), inv.content)
  }

  let release = await deps.releases.findByTag(input.tag.raw)
  if (release === undefined) {
    release = await deps.releases.createDraft({
      tag: input.tag.raw,
      sourceSha: input.sourceSha,
      title: `Moe ${input.tag.platformVersion}`,
    })
  }

  const existingAssets = await deps.releases.listAssets(release)
  const existingByName = new Map(existingAssets.map((a) => [a.name, a]))

  await deps.releases.uploadExact(release, join(input.outputDir, lockFilename), sha256(lockContent))

  for (const tarball of tarballMeta) {
    const existing = existingByName.get(tarball.filename)
    if (existing !== undefined) {
      if (existing.bytes !== tarball.bytes) {
        candidateError('CANDIDATE_ASSET_CONFLICT', `existing asset "${tarball.filename}" has different size`, 'Do not overwrite release assets that may back a publication.')
      }
      continue
    }
    const tarballPath = pluginRecords.find((p) => p.artifact.mirror.asset === tarball.filename)
    const dir = changedMap.get(pluginRecords.find((p) => p.artifact.mirror.asset === tarball.filename)!.plugin) ? join(packOutputDir, pluginRecords.find((p) => p.artifact.mirror.asset === tarball.filename)!.plugin) : join(input.outputDir, 'downloads')
    await deps.releases.uploadExact(release, join(dir, tarball.filename), tarball.sha256)
  }

  for (const inv of inventoryContents) {
    await deps.releases.uploadExact(release, join(input.outputDir, inv.filename), sha256(inv.content))
  }
  await deps.releases.uploadExact(release, join(input.outputDir, 'SHA256SUMS'), sha256(sha256sumsContent))
  await deps.releases.uploadExact(release, join(input.outputDir, 'SHA512SUMS'), sha256(sha512sumsContent))

  return { lock, catalogContent, release }
}
