import { createHash } from 'node:crypto'
import { z } from 'zod'
import { CAPABILITY_IDS, TARGET_IDS, OPERATING_SYSTEM_IDS, type CapabilityId, type TargetId, type OperatingSystemId } from '../vocabulary.js'
import { MintError } from '../diagnostics.js'
import type { PlatformTag } from './tag-policy.js'
import type { PublishMatrixEntry } from '../platform/projections.js'

function catalogError(code: string, message: string, action: string, cause?: unknown): never {
  throw new MintError({
    severity: 'error',
    code,
    source: 'release catalog',
    message,
    action,
  }, { cause })
}

const targetIdSchema = z.enum(TARGET_IDS)
const operatingSystemIdSchema = z.enum(OPERATING_SYSTEM_IDS)
const capabilityIdSchema = z.enum(CAPABILITY_IDS)

const pluginArtifactRecordSchema = z.object({
  artifact_tree_sha256: z.string().regex(/^[0-9a-f]{64}$/),
  artifact_manifest_sha256: z.string().regex(/^[0-9a-f]{64}$/),
  tarball: z.object({
    integrity: z.string().regex(/^sha512-[A-Za-z0-9+/]+=*$/),
    bytes: z.number().int().nonnegative(),
  }).strict(),
  mirror: z.object({
    asset: z.string().min(1),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
  }).strict(),
  legal: z.object({
    files: z.record(z.string().min(1), z.string().regex(/^[0-9a-f]{64}$/)),
    bundle_inventory_sha256: z.string().regex(/^[0-9a-f]{64}$/),
  }).strict(),
  emitted_capabilities: z.record(
    z.string(),
    z.array(capabilityIdSchema),
  ),
}).strict()

const certificationTupleSchema = z.object({
  target: targetIdSchema,
  os: operatingSystemIdSchema.optional(),
  arch: z.string().min(1).optional(),
  status: z.enum(['certified', 'preview', 'unsupported']),
  evidence: z.object({
    asset: z.string().min(1),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    result_id: z.string().min(1),
  }).strict().optional(),
}).strict()

const pluginCatalogRecordSchema = z.object({
  plugin: z.string().min(1),
  package: z.string().min(1),
  version: z.string().min(1),
  artifact: pluginArtifactRecordSchema,
  certification: z.array(certificationTupleSchema),
}).strict()

const platformCatalogSchema = z.object({
  schema: z.literal(1),
  platform_version: z.string().min(1),
  channel: z.enum(['prerelease', 'stable']),
  source: z.object({
    git_sha: z.string().regex(/^[0-9a-f]{40}$/),
    lockfile_sha256: z.string().regex(/^[0-9a-f]{64}$/),
    platform_registry_schema: z.literal(1),
    platform_registry_sha256: z.string().regex(/^[0-9a-f]{64}$/),
    mint_version: z.string().min(1),
  }).strict(),
  plugins: z.array(pluginCatalogRecordSchema).length(6),
}).strict()

export { platformCatalogSchema, pluginCatalogRecordSchema, certificationTupleSchema, pluginArtifactRecordSchema }

export interface PluginArtifactRecordV1 {
  artifact_tree_sha256: string
  artifact_manifest_sha256: string
  tarball: { integrity: `sha512-${string}`; bytes: number }
  mirror: { asset: string; sha256: string }
  legal: { files: Readonly<Record<string, string>>; bundle_inventory_sha256: string }
  emitted_capabilities: Readonly<Partial<Record<TargetId, readonly CapabilityId[]>>>
}

export interface CertificationTupleV1 {
  target: TargetId
  os?: OperatingSystemId
  arch?: string
  status: 'certified' | 'preview' | 'unsupported'
  evidence?: { asset: string; sha256: string; result_id: string }
}

export interface PluginCatalogRecordV1 {
  plugin: string
  package: string
  version: string
  artifact: PluginArtifactRecordV1
  certification: readonly CertificationTupleV1[]
}

export interface PlatformCatalogV1 {
  schema: 1
  platform_version: string
  channel: 'prerelease' | 'stable'
  source: {
    git_sha: string
    lockfile_sha256: string
    platform_registry_schema: number
    platform_registry_sha256: string
    mint_version: string
  }
  plugins: readonly PluginCatalogRecordV1[]
}

export interface ReleasePreflightV1 {
  schema: 1
  platform_version: string
  source_sha: string
  plugins: readonly {
    plugin: string
    package: string
    proposed_version: string
    proposed:
      | { state: 'absent' }
      | { state: 'present'; integrity: string; dist_tags: readonly string[] }
    predecessor:
      | { state: 'absent' }
      | { state: 'present'; version: string; integrity: string }
  }[]
}

export interface CandidateLockV1 {
  schema: 1
  platform_version: string
  source_sha: string
  publish_matrix: readonly PublishMatrixEntry[]
  preflight: ReleasePreflightV1
  plugins: readonly (PluginCatalogRecordV1 & { changed: boolean })[]
  release_assets: readonly {
    name: string
    bytes: number
    sha256: string
    kind: 'tarball' | 'bundle-inventory' | 'checksums' | 'catalog'
  }[]
}

export const REGISTRY_PLUGIN_COUNT = 6

export function canonicalJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

export function sha256(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex')
}

export function sha512Integrity(data: Buffer): `sha512-${string}` {
  return `sha512-${createHash('sha512').update(data).digest('base64')}`
}

export function validatePlatformCatalog(raw: unknown): PlatformCatalogV1 {
  const result = platformCatalogSchema.safeParse(raw)
  if (!result.success) {
    const issue = result.error.issues[0]
    catalogError(
      'CATALOG_SCHEMA_INVALID',
      `platform catalog is invalid: ${issue?.message ?? 'unknown'}`,
      'Correct the catalog to match the version-1 schema.',
    )
  }
  const catalog = result.data as unknown as PlatformCatalogV1
  if (catalog.plugins.length !== REGISTRY_PLUGIN_COUNT) {
    catalogError(
      'CATALOG_PLUGIN_COUNT',
      `platform catalog must contain exactly ${REGISTRY_PLUGIN_COUNT} plugins`,
      'Include all six registry plugins in registry order.',
    )
  }
  const packages = new Set<string>()
  const versions = new Set<string>()
  for (const plugin of catalog.plugins) {
    if (packages.has(plugin.package)) {
      catalogError('CATALOG_DUPLICATE_PACKAGE', `duplicate package "${plugin.package}" in catalog`, 'Use unique package identities in the catalog.')
    }
    packages.add(plugin.package)
    const key = `${plugin.package}@${plugin.version}`
    if (versions.has(key)) {
      catalogError('CATALOG_DUPLICATE_VERSION', `duplicate version "${key}" in catalog`, 'Use unique package/version identities.')
    }
    versions.add(key)
  }
  return catalog
}

export function buildPrereleaseCatalog(
  tag: PlatformTag,
  sourceSha: string,
  lockfileSha256: string,
  registrySha256: string,
  mintVersion: string,
  plugins: readonly PluginCatalogRecordV1[],
): PlatformCatalogV1 {
  if (tag.channel !== 'prerelease') {
    catalogError('CATALOG_WRONG_CHANNEL', 'prerelease catalog requires a prerelease tag', 'Use a prerelease tag.')
  }
  if (plugins.length !== REGISTRY_PLUGIN_COUNT) {
    catalogError('CATALOG_PLUGIN_COUNT', `expected ${REGISTRY_PLUGIN_COUNT} plugins`, 'Provide all six registry plugins.')
  }
  return {
    schema: 1,
    platform_version: tag.platformVersion,
    channel: 'prerelease',
    source: {
      git_sha: sourceSha,
      lockfile_sha256: lockfileSha256,
      platform_registry_schema: 1,
      platform_registry_sha256: registrySha256,
      mint_version: mintVersion,
    },
    plugins,
  }
}

export function buildStableCatalog(
  stableTag: PlatformTag,
  candidateCatalog: PlatformCatalogV1,
  certifications: ReadonlyMap<string, readonly CertificationTupleV1[]>,
): PlatformCatalogV1 {
  if (stableTag.channel !== 'stable') {
    catalogError('CATALOG_WRONG_CHANNEL', 'stable catalog requires a stable tag', 'Use a stable tag.')
  }
  return {
    schema: 1,
    platform_version: stableTag.platformVersion,
    channel: 'stable',
    source: candidateCatalog.source,
    plugins: candidateCatalog.plugins.map((plugin) => ({
      plugin: plugin.plugin,
      package: plugin.package,
      version: plugin.version,
      artifact: plugin.artifact,
      certification: certifications.get(plugin.plugin) ?? plugin.certification,
    })),
  }
}

export function detectChangedPlugins(
  current: readonly { plugin: string; version: string; treeSha256: string; manifestSha256: string }[],
  previous?: PlatformCatalogV1,
): ReadonlyMap<string, boolean> {
  const changed = new Map<string, boolean>()
  for (const plugin of current) {
    if (previous === undefined) {
      changed.set(plugin.plugin, true)
      continue
    }
    const prior = previous.plugins.find((p) => p.plugin === plugin.plugin)
    if (prior === undefined) {
      changed.set(plugin.plugin, true)
      continue
    }
    if (
      prior.version !== plugin.version
      || prior.artifact.artifact_tree_sha256 !== plugin.treeSha256
      || prior.artifact.artifact_manifest_sha256 !== plugin.manifestSha256
    ) {
      changed.set(plugin.plugin, true)
    } else {
      changed.set(plugin.plugin, false)
    }
  }
  return changed
}

export function requireVersionChangeForArtifactChange(
  plugin: string,
  currentVersion: string,
  currentTreeSha256: string,
  currentManifestSha256: string,
  previous?: PlatformCatalogV1,
): void {
  if (previous === undefined) return
  const prior = previous.plugins.find((p) => p.plugin === plugin)
  if (prior === undefined) return
  const bytesChanged =
    prior.artifact.artifact_tree_sha256 !== currentTreeSha256
    || prior.artifact.artifact_manifest_sha256 !== currentManifestSha256
  if (bytesChanged && prior.version === currentVersion) {
    catalogError(
      'CATALOG_VERSION_UNCHANGED',
      `plugin "${plugin}" artifact changed without a version change`,
      'Bump the plugin version when artifact bytes change.',
    )
  }
}
