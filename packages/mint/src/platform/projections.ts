import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import type { AdapterEmission } from '../adapters/types.js'
import { TARGET_IDS, type TargetId } from '../vocabulary.js'
import type { ResolvedPlatform, ResolvedPlugin } from './load.js'

export interface PluginProjectionRecord {
  plugin: ResolvedPlugin
  emissions: Readonly<Partial<Record<TargetId, AdapterEmission>>>
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

function projectionRecords(
  platform: ResolvedPlatform,
  artifacts: readonly PluginProjectionRecord[],
): readonly PluginProjectionRecord[] {
  const byPlugin = new Map(artifacts.map((artifact) => [artifact.plugin.id, artifact]))
  if (byPlugin.size !== artifacts.length || byPlugin.size !== platform.plugins.length) {
    throw new Error('projection records must contain exactly one current generation for every registry plugin')
  }
  return platform.plugins.map((plugin) => {
    const record = byPlugin.get(plugin.id)
    if (record === undefined || record.plugin !== plugin) {
      throw new Error(`projection record for ${plugin.id} does not match the resolved registry plugin`)
    }
    return record
  })
}

function defaultProfile(platform: ResolvedPlatform): [string, (typeof platform.registry.profiles)[string]] {
  const profiles = Object.entries(platform.registry.profiles).filter(([, profile]) => profile.default)
  if (profiles.length !== 1) throw new Error('platform registry must define exactly one default profile for projections')
  const profile = profiles[0]
  if (profile === undefined) throw new Error('platform registry has no default profile for projections')
  return profile
}

function marketplaceSource(plugin: ResolvedPlugin): { source: 'npm'; package: string } {
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

function repositoryRoot(platform: ResolvedPlatform): string {
  const roots = new Set(
    platform.registry.plugins.map((plugin) => {
      const segments = plugin.source.split('/').filter(Boolean)
      return resolve(plugin.sourcePath, ...segments.map(() => '..'))
    }),
  )
  if (roots.size !== 1) throw new Error('resolved platform plugins do not share a repository root')
  const root = roots.values().next().value
  if (typeof root !== 'string') throw new Error('resolved platform has no repository root')
  return root
}

function assertDestination(root: string, actual: string, expected: string): void {
  const resolved = isAbsolute(actual) ? resolve(actual) : resolve(root, actual)
  if (resolved !== resolve(root, expected)) {
    throw new Error(`projection destination must be exactly ${expected}`)
  }
  const rel = relative(root, resolved)
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error(`projection destination escapes the repository: ${actual}`)
  }
}

export function renderMarketplace(
  platform: ResolvedPlatform,
  artifacts: readonly PluginProjectionRecord[],
): string {
  const records = projectionRecords(platform, artifacts)
  const [profileId, profile] = defaultProfile(platform)
  const profilePlugin = platform.plugins.find((plugin) => plugin.id === profile.plugins[0])
  const author = profilePlugin?.config.author
  if (author === undefined) throw new Error(`default profile ${profileId} has no plugin author for marketplace ownership`)

  return canonicalJson({
    name: profileId,
    owner: author,
    plugins: records
      .filter((record) => record.emissions['claude-code'] !== undefined)
      .map((record) => ({
        name: record.plugin.id,
        source: marketplaceSource(record.plugin),
        version: record.plugin.version,
        description: record.plugin.config.description,
        strict: true,
      })),
  })
}

export function renderPublicCatalog(
  platform: ResolvedPlatform,
  artifacts: readonly PluginProjectionRecord[],
): string {
  const records = projectionRecords(platform, artifacts)
  const headers = ['Plugin', 'npm package', 'Summary', ...TARGET_IDS.map((target) => platform.registry.targets[target].display_name)]
  const rows = records.map((record) => [
    `\`${record.plugin.id}\``,
    `\`${record.plugin.npmPackage}\``,
    markdownCell(record.plugin.config.description),
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
  projectionRecords(platform, artifacts)
  const declarations = new Map(platform.registry.plugins.map((plugin) => [plugin.id, plugin]))
  return platform.plugins.map((plugin) => {
    const declaration = declarations.get(plugin.id)
    if (declaration === undefined) throw new Error(`resolved plugin ${plugin.id} is absent from the platform registry`)
    return {
      plugin: plugin.id,
      package: plugin.npmPackage,
      version: plugin.version,
      sourcePackagePath: declaration.source,
      generatedArtifactPath: `plugins/${plugin.id}`,
    }
  })
}

export async function writeRegistryProjections(
  platform: ResolvedPlatform,
  artifacts: readonly PluginProjectionRecord[],
  destinations: ProjectionDestinations,
): Promise<void> {
  const root = repositoryRoot(platform)
  assertDestination(root, destinations.marketplacePath, '.claude-plugin/marketplace.json')
  assertDestination(root, destinations.publicCatalogPath, 'docs/moe/generated/plugin-catalog.md')
  const marketplace = renderMarketplace(platform, artifacts)
  const catalog = renderPublicCatalog(platform, artifacts)
  await Promise.all([
    mkdir(dirname(destinations.marketplacePath), { recursive: true }),
    mkdir(dirname(destinations.publicCatalogPath), { recursive: true }),
  ])
  await Promise.all([
    writeFile(destinations.marketplacePath, marketplace),
    writeFile(destinations.publicCatalogPath, catalog),
  ])
}
