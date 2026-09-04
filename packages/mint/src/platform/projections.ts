import { constants, promises as fsp } from 'node:fs'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import type { AdapterEmission } from '../adapters/types.js'
import { MintError, type MintDiagnostic } from '../diagnostics.js'
import {
  canonicalProjectionEvidence,
  isCanonicalGenerationFor,
  validateCanonicalGeneration,
  type CanonicalProjectionEvidence,
  type CanonicalProjectionPlugin,
  type CanonicalGenerationIdentity,
  type GenerationValidation,
} from '../generate.js'
import { TARGET_IDS, type TargetId } from '../vocabulary.js'
import type { ResolvedPlatform, ResolvedPlugin } from './load.js'

export interface PluginProjectionRecord {
  readonly plugin: CanonicalProjectionPlugin
  readonly emissions: Readonly<Partial<Record<TargetId, AdapterEmission>>>
}

interface ProjectionProvenance {
  validation: GenerationValidation
  evidence: CanonicalProjectionEvidence
  identity: CanonicalGenerationIdentity
  producer: ResolvedPlugin
  platform: PlatformProjectionEvidence
}

const projectionProvenance = new WeakMap<PluginProjectionRecord, ProjectionProvenance>()

interface PlatformProjectionEvidence {
  producer: ResolvedPlatform
  registry: ResolvedPlatform['registry']
  fingerprint: string
}

interface AuthorizedProjectionRecords {
  records: readonly PluginProjectionRecord[]
  registry: ResolvedPlatform['registry']
}

export interface PublishMatrixEntry {
  plugin: string
  package: string
  version: string
  sourcePackagePath: string
  generatedArtifactPath: string
}

export interface ProjectionDestinations {
  marketplacePath: string
  publicCatalogPath: string
}

function projectionError(
  code: string,
  message: string,
  action: string,
  context: Pick<MintDiagnostic, 'source'> & Partial<Pick<MintDiagnostic, 'plugin' | 'target' | 'field' | 'path'>>,
  cause?: unknown,
): MintError {
  return new MintError({ severity: 'error', code, message, action, ...context }, { cause })
}

function projectionRecords(
  platform: ResolvedPlatform,
  artifacts: readonly PluginProjectionRecord[],
): AuthorizedProjectionRecords {
  const firstRecord = artifacts[0]
  const firstProvenance = firstRecord === undefined ? undefined : projectionProvenance.get(firstRecord)
  if (
    firstRecord !== undefined
    && firstProvenance !== undefined
    && (
      firstProvenance.platform.producer !== platform
      || firstProvenance.platform.fingerprint !== registryFingerprint(platform.registry)
    )
  ) {
    const declaration = platform.registry.plugins.find((plugin) => plugin.id === firstRecord.plugin.id)
    throw projectionError(
      'PROJECTION_RECORD_PROVENANCE',
      `projection record for ${firstRecord.plugin.id} lacks a current validated generation`,
      'Create the record from the current canonical adapter validation pass.',
      {
        source: declaration?.config ?? firstRecord.plugin.configSource,
        plugin: firstRecord.plugin.id,
        field: 'artifacts',
      },
    )
  }
  const registry = firstProvenance?.platform.registry ?? platform.registry
  const fingerprint = firstProvenance?.platform.fingerprint
  const byPlugin = new Map(artifacts.map((artifact) => [artifact.plugin.id, artifact]))
  if (byPlugin.size !== artifacts.length || artifacts.length !== registry.plugins.length) {
    throw projectionError(
      'PROJECTION_RECORD_CARDINALITY',
      'projection records must contain exactly one current generation for every registry plugin',
      'Provide one canonical projection record for each registry plugin.',
      { source: 'moe-platform.yaml', field: 'plugins' },
    )
  }
  const records = registry.plugins.map((declaration) => {
    const record = byPlugin.get(declaration.id)
    if (record === undefined) {
      throw projectionError(
        'PROJECTION_RECORD_CARDINALITY',
        `projection record for ${declaration.id} is missing`,
        'Provide one canonical projection record for each registry plugin.',
        { source: 'moe-platform.yaml', plugin: declaration.id, field: 'plugins' },
      )
    }
    const provenance = projectionProvenance.get(record)
    const currentPlugin = platform.plugins.find((plugin) => plugin.id === declaration.id)
    const currentIdentity = currentPlugin === undefined ? undefined : generationIdentity(currentPlugin)
    if (
      provenance === undefined
      || provenance.platform.producer !== platform
      || provenance.platform.fingerprint !== fingerprint
      || currentPlugin === undefined
      || currentIdentity === undefined
      || provenance.producer !== currentPlugin
      || record.plugin !== provenance.evidence.plugin
      || record.emissions !== provenance.evidence.emissions
      || !sameGenerationIdentity(provenance.identity, currentIdentity)
      || !isCanonicalGenerationFor(provenance.validation, currentIdentity)
      || record.plugin.id !== declaration.id
      || record.plugin.sourcePackagePath !== declaration.source
      || record.plugin.configSource !== declaration.config
      || currentPlugin.sourcePackagePath !== declaration.source
      || currentPlugin.sourcePath !== declaration.sourcePath
      || currentPlugin.configPath !== declaration.configPath
      || currentPlugin.config.source !== declaration.config
    ) {
      throw projectionError(
        'PROJECTION_RECORD_PROVENANCE',
        `projection record for ${declaration.id} lacks a current validated generation`,
        'Create the record from the current canonical adapter validation pass.',
        { source: declaration.config, plugin: declaration.id, field: 'artifacts' },
      )
    }
    return record
  })
  return { records, registry }
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value
  for (const nested of Object.values(value)) deepFreeze(nested)
  return Object.freeze(value)
}

function registryFingerprint(registry: ResolvedPlatform['registry']): string {
  return JSON.stringify(registry)
}

function platformProjectionEvidence(platform: ResolvedPlatform): PlatformProjectionEvidence {
  const registry = deepFreeze(structuredClone(platform.registry))
  return Object.freeze({
    producer: platform,
    registry,
    fingerprint: registryFingerprint(registry),
  })
}

function sameGenerationIdentity(
  left: CanonicalGenerationIdentity,
  right: CanonicalGenerationIdentity,
): boolean {
  return left.sourcePath === right.sourcePath
    && left.sourcePackagePath === right.sourcePackagePath
    && left.configPath === right.configPath
    && left.configSource === right.configSource
}

function generationIdentity(plugin: ResolvedPlugin): CanonicalGenerationIdentity {
  return {
    sourcePath: plugin.sourcePath,
    sourcePackagePath: plugin.sourcePackagePath,
    configPath: plugin.configPath,
    configSource: plugin.config.source,
  }
}

/** Bind a plugin to the exact result of a real adapter validation/emission pass. */
export function projectionRecordForCurrentGeneration(
  platform: ResolvedPlatform,
  plugin: ResolvedPlugin,
  validation: GenerationValidation,
): PluginProjectionRecord {
  return projectionRecord(platform, plugin, validation, platformProjectionEvidence(platform))
}

function projectionRecord(
  platform: ResolvedPlatform,
  plugin: ResolvedPlugin,
  validation: GenerationValidation,
  platformEvidence: PlatformProjectionEvidence,
): PluginProjectionRecord {
  if (platformEvidence.producer !== platform || !platform.plugins.includes(plugin)) {
    throw projectionError(
      'PROJECTION_GENERATION_PROVENANCE',
      `projection record for ${plugin.id} does not belong to the producing platform`,
      'Use the resolved plugin from the platform that produced this canonical validation.',
      { source: plugin.config.source, plugin: plugin.id, field: 'generation' },
    )
  }
  const identity = generationIdentity(plugin)
  if (!isCanonicalGenerationFor(validation, identity)) {
    throw projectionError(
      'PROJECTION_GENERATION_PROVENANCE',
      `projection record for ${plugin.id} lacks a current canonical generation`,
      'Use validateCanonicalGeneration for this resolved plugin before creating a projection record.',
      { source: plugin.config.source, plugin: plugin.id, field: 'generation' },
    )
  }
  const evidence = canonicalProjectionEvidence(validation)
  if (evidence === undefined) {
    throw projectionError(
      'PROJECTION_GENERATION_PROVENANCE',
      `projection record for ${plugin.id} lacks canonical projection evidence`,
      'Repeat the canonical adapter validation pass for this plugin.',
      { source: plugin.config.source, plugin: plugin.id, field: 'generation' },
    )
  }
  const record = Object.freeze({ plugin: evidence.plugin, emissions: evidence.emissions })
  projectionProvenance.set(record, {
    validation,
    evidence,
    identity: Object.freeze({ ...identity }),
    producer: plugin,
    platform: platformEvidence,
  })
  return record
}

/**
 * Run current adapter validation against each package source without writing
 * generated artifacts. This is the authority used by the ephemeral publish
 * matrix route.
 */
export function currentProjectionRecords(platform: ResolvedPlatform): readonly PluginProjectionRecord[] {
  const marketplaceName = defaultProfileId(platform)
  const platformEvidence = platformProjectionEvidence(platform)
  return platform.plugins.map((plugin) => projectionRecord(
    platform,
    plugin,
    validateCanonicalGeneration(generationIdentity(plugin), { marketplaceName }),
    platformEvidence,
  ))
}

function defaultProfile(registry: ResolvedPlatform['registry']): [string, (typeof registry.profiles)[string]] {
  const profiles = Object.entries(registry.profiles).filter(([, profile]) => profile.default)
  if (profiles.length !== 1) {
    throw projectionError(
      'PROJECTION_PROFILE_INVALID',
      'platform registry must define exactly one default profile for projections',
      'Mark exactly one usable platform profile as default.',
      { source: 'moe-platform.yaml', field: 'profiles' },
    )
  }
  const profile = profiles[0]
  if (profile === undefined || profile[1].plugins.length === 0) {
    throw projectionError(
      'PROJECTION_PROFILE_INVALID',
      'platform registry has no usable default profile for projections',
      'Add at least one registered plugin to the default profile.',
      { source: 'moe-platform.yaml', field: profile === undefined ? 'profiles' : `profiles.${profile[0]}.plugins` },
    )
  }
  return profile
}

export function defaultProfileId(platform: ResolvedPlatform): string {
  return defaultProfile(platform.registry)[0]
}

function marketplaceSource(plugin: CanonicalProjectionPlugin): { source: 'npm'; package: string } {
  return { source: 'npm', package: plugin.npmPackage }
}

function canonicalJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

function markdownCell(value: string): string {
  return value.replaceAll('|', '\\|').replaceAll('\n', ' ')
}

function targetCell(record: PluginProjectionRecord, target: TargetId): string {
  const emission = record.emissions[target]
  if (emission === undefined) return 'unsupported'
  const capabilities = [...emission.emittedCapabilities].sort()
  return `preview: ${capabilities.length === 0 ? 'none' : capabilities.join(', ')}`
}

function isContained(root: string, candidate: string): boolean {
  const rel = relative(root, candidate)
  return rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)
}

async function nearestExistingParent(path: string): Promise<string> {
  let candidate = path
  while (true) {
    try {
      await fsp.realpath(candidate)
      return candidate
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      const parent = dirname(candidate)
      if (parent === candidate) throw error
      candidate = parent
    }
  }
}

async function validateDestination(
  root: string,
  actual: string,
  expected: string,
  field: keyof ProjectionDestinations,
): Promise<string> {
  const resolved = isAbsolute(actual) ? resolve(actual) : resolve(root, actual)
  if (resolved !== resolve(root, expected)) {
    throw projectionError(
      'PROJECTION_DESTINATION_INVALID',
      `projection destination must be exactly ${expected}`,
      `Set ${field} to ${expected} relative to the resolved repository root.`,
      { source: 'registry projections', field, path: actual },
    )
  }
  let rootReal: string
  let existingParent: string
  try {
    rootReal = await fsp.realpath(root)
    existingParent = await fsp.realpath(await nearestExistingParent(dirname(resolved)))
  } catch (error) {
    throw projectionError(
      'PROJECTION_DESTINATION_UNAVAILABLE',
      `projection destination could not be resolved: ${(error as Error).message}`,
      'Make the repository root and destination parent accessible.',
      { source: 'registry projections', field, path: actual },
      error,
    )
  }
  if (!isContained(rootReal, existingParent)) {
    throw projectionError(
      'PROJECTION_DESTINATION_ESCAPE',
      `projection destination escapes the repository: ${actual}`,
      'Remove the escaping parent symlink and use the exact in-repository destination.',
      { source: 'registry projections', field, path: actual },
    )
  }
  try {
    if ((await fsp.lstat(resolved)).isSymbolicLink()) {
      throw projectionError(
        'PROJECTION_DESTINATION_ESCAPE',
        `projection destination may not be a symbolic link: ${actual}`,
        'Remove the destination symlink and write the repository-owned projection file.',
        { source: 'registry projections', field, path: actual },
      )
    }
  } catch (error) {
    if (error instanceof MintError) throw error
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw projectionError(
        'PROJECTION_DESTINATION_UNAVAILABLE',
        `projection destination could not be inspected: ${(error as Error).message}`,
        'Make the destination path accessible.',
        { source: 'registry projections', field, path: actual },
        error,
      )
    }
  }
  return resolved
}

export function renderMarketplace(
  platform: ResolvedPlatform,
  artifacts: readonly PluginProjectionRecord[],
): string {
  const { records, registry } = projectionRecords(platform, artifacts)
  const [profileId, profile] = defaultProfile(registry)
  const profilePlugin = records.find((record) => record.plugin.id === profile.plugins[0])?.plugin
  const author = profilePlugin?.author
  if (author === undefined) {
    const plugin = profile.plugins[0]
    const source = registry.plugins.find((entry) => entry.id === plugin)?.config ?? 'moe-platform.yaml'
    throw projectionError(
      'PROJECTION_PROFILE_INVALID',
      `default profile ${profileId} has no plugin author for marketplace ownership`,
      'Add an author to the default profile plugin Mint configuration.',
      { source, ...(plugin === undefined ? {} : { plugin }), field: 'author' },
    )
  }

  return canonicalJson({
    name: profileId,
    owner: author,
    plugins: records
      .filter((record) => record.emissions['claude-code'] !== undefined)
      .map((record) => ({
        name: record.plugin.id,
        source: marketplaceSource(record.plugin),
        version: record.plugin.version,
        description: record.plugin.summary,
        strict: true,
      })),
  })
}

export function renderPublicCatalog(
  platform: ResolvedPlatform,
  artifacts: readonly PluginProjectionRecord[],
): string {
  const { records, registry } = projectionRecords(platform, artifacts)
  const headers = ['Plugin', 'npm package', 'Summary', ...TARGET_IDS.map((target) => markdownCell(registry.targets[target].display_name))]
  const rows = records.map((record) => [
    `\`${record.plugin.id}\``,
    `\`${record.plugin.npmPackage}\``,
    markdownCell(record.plugin.summary),
    ...TARGET_IDS.map((target) => targetCell(record, target)),
  ])
  return [
    '# Moe plugin catalog',
    '',
    'Generated from `moe-platform.yaml` and current validated Mint emissions. Structural target output is preview only; this catalog never certifies a target.',
    '',
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
    '',
  ].join('\n')
}

export function resolvePublishMatrix(
  platform: ResolvedPlatform,
  artifacts: readonly PluginProjectionRecord[],
): readonly PublishMatrixEntry[] {
  const { records } = projectionRecords(platform, artifacts)
  return records.map(({ plugin }) => {
    return {
      plugin: plugin.id,
      package: plugin.npmPackage,
      version: plugin.version,
      sourcePackagePath: plugin.sourcePackagePath,
      generatedArtifactPath: `plugins/${plugin.id}`,
    }
  })
}

// Writes with O_NOFOLLOW, the same pattern fileset.ts's writeFileSet uses (and
// documents there): the containment/symlink checks in validateDestination and
// this write are two separate syscalls, so anything with write access to the
// destination directory can swap the target for a symlink in between. A
// symlink-following write (node:fs/promises' writeFile) would silently write
// the projection content through to wherever that link points, defeating the
// check above. Opening with O_NOFOLLOW instead makes the open() call itself
// refuse a symlinked leaf (ELOOP), closing that window (CR-062).
async function writeProjectionFile(path: string, content: string, field: keyof ProjectionDestinations): Promise<void> {
  let handle: Awaited<ReturnType<typeof fsp.open>>
  try {
    handle = await fsp.open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW, 0o666)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ELOOP') {
      throw projectionError(
        'PROJECTION_DESTINATION_ESCAPE',
        `projection destination may not be a symbolic link: ${path}`,
        'Remove the destination symlink and write the repository-owned projection file.',
        { source: 'registry projections', field, path },
      )
    }
    throw error
  }
  try {
    await handle.writeFile(content)
  } finally {
    await handle.close()
  }
}

export async function writeRegistryProjections(
  platform: ResolvedPlatform,
  artifacts: readonly PluginProjectionRecord[],
  destinations: ProjectionDestinations,
): Promise<void> {
  const root = platform.repositoryRoot
  const marketplacePath = await validateDestination(root, destinations.marketplacePath, '.claude-plugin/marketplace.json', 'marketplacePath')
  const publicCatalogPath = await validateDestination(root, destinations.publicCatalogPath, 'docs/moe/generated/plugin-catalog.md', 'publicCatalogPath')
  const marketplace = renderMarketplace(platform, artifacts)
  const catalog = renderPublicCatalog(platform, artifacts)
  await Promise.all([
    fsp.mkdir(dirname(marketplacePath), { recursive: true }),
    fsp.mkdir(dirname(publicCatalogPath), { recursive: true }),
  ])
  await Promise.all([
    writeProjectionFile(marketplacePath, marketplace, 'marketplacePath'),
    writeProjectionFile(publicCatalogPath, catalog, 'publicCatalogPath'),
  ])
}
