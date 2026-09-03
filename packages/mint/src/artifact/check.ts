import { join } from 'node:path'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolvePlatform, type ResolvedPlatform, type ResolvedPlugin } from '../platform/load.js'
import { currentProjectionRecords } from '../platform/projections.js'
import { TARGET_IDS, type TargetId } from '../vocabulary.js'
import { scanArtifact, validateArtifact, readArtifactManifest, type ExpectedArtifactContext } from './artifact-manifest.js'
import { packArtifactOnce, verifyPackedArtifact } from './pack.js'
import { renderLicensePayload } from './license-payload.js'
import { MintError } from '../diagnostics.js'

export interface ArtifactCheckResult {
  readonly plugin: string
  readonly package: string
  readonly version: string
  readonly files: number
  readonly treeDigest: string
  readonly tarballBytes: number
  readonly tarballSha256: string
  readonly tarballIntegrity: string
  readonly legalDiagnostics: number
}

export interface ArtifactSetCheckResult {
  readonly results: readonly ArtifactCheckResult[]
  readonly problems: readonly string[]
}

function resolveExpectedContext(
  plugin: ResolvedPlugin,
  platform: ResolvedPlatform,
): ExpectedArtifactContext {
  const projections = currentProjectionRecords(platform)
  const record = projections.find((r) => r.plugin.id === plugin.id)
  const targets: ExpectedArtifactContext['targets'] = Object.fromEntries(
    TARGET_IDS.flatMap((target: TargetId) => {
      const emission = record?.emissions[target]
      return emission === undefined
        ? []
        : [[target, { emitted_capabilities: emission.emittedCapabilities }]]
    }),
  )
  return {
    plugin: {
      id: plugin.id,
      package: plugin.npmPackage,
      version: plugin.version,
    },
    targets,
    omitted_optional_payloads: [],
  }
}

export async function checkArtifactSet(
  repoRoot: string,
): Promise<ArtifactSetCheckResult> {
  const platform = await resolvePlatform(repoRoot)
  const problems: string[] = []
  const results: ArtifactCheckResult[] = []

  for (const plugin of platform.plugins) {
    const artifactRoot = join(platform.repositoryRoot, 'plugins', plugin.id)
    const expected = resolveExpectedContext(plugin, platform)

    try {
      const entries = await scanArtifact(artifactRoot)

      let manifest
      try {
        manifest = await readArtifactManifest(artifactRoot)
        await validateArtifact(artifactRoot, expected)
      } catch (err) {
        problems.push(`${plugin.id}: manifest validation failed: ${err instanceof Error ? err.message : String(err)}`)
      }

      const packDir = await mkdtemp(join(tmpdir(), `moe-artifact-check-${plugin.id}-`))
      let packed
      try {
        packed = await packArtifactOnce(artifactRoot, packDir, expected)
        await verifyPackedArtifact(packed.tarballPath, expected)
      } finally {
        await rm(packDir, { recursive: true, force: true })
      }

      let legalDiagnosticCount = 0
      try {
        const rendered = await renderLicensePayload({
          repoRoot: platform.repositoryRoot,
          pluginId: plugin.id,
          license: plugin.config.license,
          importedWorks: plugin.config.importedWorks.map((w) => w.name),
        })
        const observedLicense = await readFile(join(artifactRoot, 'LICENSE'), 'utf8').catch(() => undefined)
        const observedNotice = await readFile(join(artifactRoot, 'NOTICE'), 'utf8').catch(() => undefined)
        if (observedLicense === undefined) {
          problems.push(`${plugin.id}: legal: LEGAL_PAYLOAD_MISSING — artifact is missing LICENSE`)
          legalDiagnosticCount++
        } else if (observedLicense !== rendered.license) {
          problems.push(`${plugin.id}: legal: LEGAL_PAYLOAD_DRIFT — LICENSE differs from canonical rendered payload`)
          legalDiagnosticCount++
        }
        if (observedNotice === undefined) {
          problems.push(`${plugin.id}: legal: LEGAL_PAYLOAD_MISSING — artifact is missing NOTICE`)
          legalDiagnosticCount++
        } else if (observedNotice !== rendered.notice) {
          problems.push(`${plugin.id}: legal: LEGAL_PAYLOAD_DRIFT — NOTICE differs from canonical rendered payload`)
          legalDiagnosticCount++
        }
      } catch (err) {
        problems.push(
          `${plugin.id}: legal closure check failed: ${err instanceof Error ? err.message : String(err)}`,
        )
        legalDiagnosticCount++
      }

      results.push({
        plugin: plugin.id,
        package: plugin.npmPackage,
        version: plugin.version,
        files: entries.length,
        treeDigest: manifest?.tree_sha256 ?? 'unavailable',
        tarballBytes: packed.bytes,
        tarballSha256: packed.sha256,
        tarballIntegrity: packed.integrity,
        legalDiagnostics: legalDiagnosticCount,
      })
    } catch (err) {
      problems.push(
        `${plugin.id}: ${err instanceof MintError ? `${err.diagnostic.code}: ${err.message}` : err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  return { results, problems }
}
