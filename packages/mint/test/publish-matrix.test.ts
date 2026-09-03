import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { adapters, type HarnessAdapter } from '../src/adapters/index.js'
import { claudeCode } from '../src/adapters/claude-code.js'
import { validateCanonicalGeneration, validateGeneration } from '../src/generate.js'
import { resolvePlatform, type ResolvedPlatform } from '../src/platform/load.js'
import {
  currentProjectionRecords,
  projectionRecordForCurrentGeneration,
  renderMarketplace,
  renderPublicCatalog,
  resolvePublishMatrix,
  type PluginProjectionRecord,
} from '../src/platform/projections.js'
import { TARGET_IDS } from '../src/vocabulary.js'

const REPO_ROOT = join(import.meta.dirname, '../../..')

function alteredRegistry(platform: ResolvedPlatform): ResolvedPlatform['registry'] {
  return {
    ...platform.registry,
    targets: {
      ...platform.registry.targets,
      cursor: { ...platform.registry.targets.cursor, display_name: 'Rebound Cursor' },
    },
    profiles: {
      ...Object.fromEntries(Object.entries(platform.registry.profiles).map(([id, profile]) => [
        id,
        { ...profile, default: false },
      ])),
      alternate: { default: true, plugins: [platform.plugins[0]?.id ?? 'moe'] },
    },
  }
}

describe('publish matrix', () => {
  it('resolves one deterministic publish entry for every registry plugin', async () => {
    const platform = await resolvePlatform(REPO_ROOT)
    const matrix = resolvePublishMatrix(platform, currentProjectionRecords(platform))

    expect(matrix).toHaveLength(6)
    expect(new Set(matrix.map((entry) => entry.plugin))).toEqual(new Set(platform.plugins.map((plugin) => plugin.id)))
    expect(matrix).toEqual([
      { plugin: 'moe', package: '@bubstack/moe-core', version: '0.1.4', sourcePackagePath: 'packages/core', generatedArtifactPath: 'plugins/moe' },
      { plugin: 'moe-backstory', package: '@bubstack/moe-backstory', version: '0.1.4', sourcePackagePath: 'packages/backstory', generatedArtifactPath: 'plugins/moe-backstory' },
      { plugin: 'moe-memory', package: '@bubstack/moe-memory', version: '0.2.0', sourcePackagePath: 'packages/memory', generatedArtifactPath: 'plugins/moe-memory' },
      { plugin: 'moe-glass', package: '@bubstack/moe-glass', version: '0.1.4', sourcePackagePath: 'packages/glass', generatedArtifactPath: 'plugins/moe-glass' },
      { plugin: 'moe-crew', package: '@bubstack/moe-crew', version: '0.1.4', sourcePackagePath: 'packages/crew', generatedArtifactPath: 'plugins/moe-crew' },
      { plugin: 'moe-statusline', package: '@bubstack/moe-statusline', version: '0.1.0', sourcePackagePath: 'packages/statusline', generatedArtifactPath: 'plugins/moe-statusline' },
    ])
  })

  it('rejects records fabricated without a current adapter validation pass', async () => {
    const platform = await resolvePlatform(REPO_ROOT)
    const fabricated = platform.plugins.map((plugin) => ({ plugin, emissions: {} })) as unknown as PluginProjectionRecord[]

    expect(() => resolvePublishMatrix(platform, fabricated)).toThrowError(expect.objectContaining({
      diagnostic: expect.objectContaining({
        code: 'PROJECTION_RECORD_PROVENANCE',
        plugin: 'moe',
        source: 'packages/core/mint/moe.yaml',
        field: 'artifacts',
      }),
    }))
  })

  it('rejects projection record cardinality mismatches with structured context', async () => {
    const platform = await resolvePlatform(REPO_ROOT)
    const records = currentProjectionRecords(platform).slice(1)

    expect(() => resolvePublishMatrix(platform, records)).toThrowError(expect.objectContaining({
      diagnostic: expect.objectContaining({
        code: 'PROJECTION_RECORD_CARDINALITY',
        source: 'moe-platform.yaml',
        field: 'plugins',
      }),
    }))
  })

  it('rejects a genuine validation rebound to another resolved plugin', async () => {
    const platform = await resolvePlatform(REPO_ROOT)
    const [first, second] = platform.plugins
    if (first === undefined || second === undefined) throw new Error('expected two resolved plugins')
    const validation = validateGeneration(first.sourcePath, undefined, {
      configPath: first.configPath,
      configSource: first.config.source,
    })

    expect(() => projectionRecordForCurrentGeneration(platform, second, validation)).toThrowError(expect.objectContaining({
      diagnostic: expect.objectContaining({
        code: 'PROJECTION_GENERATION_PROVENANCE',
        plugin: second.id,
        source: second.config.source,
        field: 'generation',
      }),
    }))
  })

  it.each([
    ['marketplace', renderMarketplace],
    ['catalog', renderPublicCatalog],
    ['publish matrix', resolvePublishMatrix],
  ] as const)('rejects producer-platform records against a second config authority in the %s', async (_name, render) => {
    const [producerPlatform, currentPlatform] = await Promise.all([
      resolvePlatform(REPO_ROOT),
      resolvePlatform(REPO_ROOT),
    ])
    const records = currentProjectionRecords(producerPlatform)
    const replacedConfig = 'packages/core/mint/replaced.yaml'
    const rebound: ResolvedPlatform = {
      ...currentPlatform,
      registry: {
        ...currentPlatform.registry,
        plugins: currentPlatform.registry.plugins.map((declaration, index) => index === 0
          ? { ...declaration, config: replacedConfig, configPath: join(REPO_ROOT, replacedConfig) }
          : declaration),
      },
      plugins: currentPlatform.plugins.map((plugin, index) => index === 0
        ? {
          ...plugin,
          configPath: join(REPO_ROOT, replacedConfig),
          config: { ...plugin.config, source: replacedConfig },
        }
        : plugin),
    }

    expect(() => render(rebound, records)).toThrowError(expect.objectContaining({
      diagnostic: expect.objectContaining({
        code: 'PROJECTION_RECORD_PROVENANCE',
        plugin: 'moe',
        source: replacedConfig,
        field: 'artifacts',
      }),
    }))
  })

  it.each([
    ['marketplace', renderMarketplace],
    ['catalog', renderPublicCatalog],
    ['publish matrix', resolvePublishMatrix],
  ] as const)('rejects producer-platform records against altered registry state in the %s', async (_name, render) => {
    const platform = await resolvePlatform(REPO_ROOT)
    const records = currentProjectionRecords(platform)
    const rebound: ResolvedPlatform = {
      ...platform,
      registry: alteredRegistry(platform),
    }

    expect(() => render(rebound, records)).toThrowError(expect.objectContaining({
      diagnostic: expect.objectContaining({
        code: 'PROJECTION_RECORD_PROVENANCE',
        plugin: 'moe',
        source: 'packages/core/mint/moe.yaml',
        field: 'artifacts',
      }),
    }))
  })

  it.each([
    ['marketplace', renderMarketplace],
    ['catalog', renderPublicCatalog],
    ['publish matrix', resolvePublishMatrix],
  ] as const)('rejects records after the producing registry is mutated before %s rendering', async (_name, render) => {
    const platform = await resolvePlatform(REPO_ROOT)
    const records = currentProjectionRecords(platform)
    platform.registry = alteredRegistry(platform)

    expect(() => render(platform, records)).toThrowError(expect.objectContaining({
      diagnostic: expect.objectContaining({
        code: 'PROJECTION_RECORD_PROVENANCE',
        plugin: 'moe',
        source: 'packages/core/mint/moe.yaml',
        field: 'artifacts',
      }),
    }))
  })

  it.each([
    ['declared config source', (platform: ResolvedPlatform) => {
      const declaration = platform.registry.plugins[0]
      const plugin = platform.plugins[0]
      if (declaration === undefined || plugin === undefined) throw new Error('expected the core plugin')
      declaration.config = 'packages/core/mint/replaced.yaml'
      plugin.config.source = declaration.config
    }],
    ['resolved config path', (platform: ResolvedPlatform) => {
      const declaration = platform.registry.plugins[0]
      const plugin = platform.plugins[0]
      if (declaration === undefined || plugin === undefined) throw new Error('expected the core plugin')
      declaration.configPath = join(REPO_ROOT, 'packages/core/mint/replaced.yaml')
      plugin.configPath = declaration.configPath
    }],
    ['resolved source path', (platform: ResolvedPlatform) => {
      const declaration = platform.registry.plugins[0]
      const plugin = platform.plugins[0]
      if (declaration === undefined || plugin === undefined) throw new Error('expected the core plugin')
      declaration.sourcePath = join(REPO_ROOT, 'packages/core-replaced')
      plugin.sourcePath = declaration.sourcePath
    }],
  ] as const)('rejects a record after its producing platform changes the %s identity', async (_name, changeIdentity) => {
    const platform = await resolvePlatform(REPO_ROOT)
    const records = currentProjectionRecords(platform)
    changeIdentity(platform)

    expect(() => resolvePublishMatrix(platform, records)).toThrowError(expect.objectContaining({
      diagnostic: expect.objectContaining({
        code: 'PROJECTION_RECORD_PROVENANCE',
        plugin: 'moe',
        field: 'artifacts',
      }),
    }))
  })

  it('rejects a zero-adapter validation pass', async () => {
    const platform = await resolvePlatform(REPO_ROOT)
    const [plugin] = platform.plugins
    if (plugin === undefined) throw new Error('expected a resolved plugin')
    const validation = validateGeneration(plugin.sourcePath, [], {
      configPath: plugin.configPath,
      configSource: plugin.config.source,
    })

    expect(() => projectionRecordForCurrentGeneration(platform, plugin, validation)).toThrowError(expect.objectContaining({
      diagnostic: expect.objectContaining({
        code: 'PROJECTION_GENERATION_PROVENANCE',
        plugin: plugin.id,
        source: plugin.config.source,
        field: 'generation',
      }),
    }))
  })

  it('rejects an incomplete custom-adapter validation pass', async () => {
    const platform = await resolvePlatform(REPO_ROOT)
    const [plugin] = platform.plugins
    const claude = adapters.find((adapter) => adapter.name === 'claude-code')
    if (plugin === undefined || claude === undefined) throw new Error('expected the core plugin and Claude adapter')
    const validation = validateGeneration(plugin.sourcePath, [claude], {
      configPath: plugin.configPath,
      configSource: plugin.config.source,
    })

    expect(() => projectionRecordForCurrentGeneration(platform, plugin, validation)).toThrowError(expect.objectContaining({
      diagnostic: expect.objectContaining({
        code: 'PROJECTION_GENERATION_PROVENANCE',
        plugin: plugin.id,
        source: plugin.config.source,
        field: 'generation',
      }),
    }))
  })

  it('prevents canonical adapter method mutation through direct and registry exports', () => {
    const originalDirect = claudeCode.emit
    const originalIndexed = adapters[0]?.emit
    if (originalIndexed === undefined) throw new Error('expected the Claude adapter at adapters[0]')

    let directError: unknown
    try {
      ;(claudeCode as HarnessAdapter).emit = () => ({ files: [], limitations: [], emittedCapabilities: [] })
    } catch (error) {
      directError = error
    } finally {
      if (claudeCode.emit !== originalDirect) (claudeCode as HarnessAdapter).emit = originalDirect
    }

    let indexedError: unknown
    try {
      ;(adapters[0] as HarnessAdapter).emit = () => ({ files: [], limitations: [], emittedCapabilities: [] })
    } catch (error) {
      indexedError = error
    } finally {
      if (adapters[0]?.emit !== originalIndexed) (adapters[0] as HarnessAdapter).emit = originalIndexed
    }

    expect(directError).toBeInstanceOf(TypeError)
    expect(indexedError).toBeInstanceOf(TypeError)
  })

  it('keeps canonical validation complete when mutation of the exported adapter collection is attempted', async () => {
    const platform = await resolvePlatform(REPO_ROOT)
    const [plugin] = platform.plugins
    if (plugin === undefined) throw new Error('expected a resolved plugin')
    const mutableAdapters = adapters as unknown as HarnessAdapter[]
    const originalAdapters = [...mutableAdapters]
    let mutationError: unknown
    let validation: ReturnType<typeof validateCanonicalGeneration>
    try {
      try {
        mutableAdapters.splice(0)
      } catch (error) {
        mutationError = error
      }
      validation = validateCanonicalGeneration({
        sourcePath: plugin.sourcePath,
        sourcePackagePath: plugin.sourcePackagePath,
        configPath: plugin.configPath,
        configSource: plugin.config.source,
      })
    } finally {
      if (mutableAdapters.length !== originalAdapters.length) {
        mutableAdapters.splice(0, mutableAdapters.length, ...originalAdapters)
      }
    }

    expect(mutationError).toBeInstanceOf(TypeError)
    expect(validation.adaptersRun).toEqual([...TARGET_IDS])
    expect(Object.keys(validation.emissions).sort()).toEqual([...TARGET_IDS].sort())
  })

  it('keeps projection outputs and provenance unchanged after an emission-mutation attempt', async () => {
    const platform = await resolvePlatform(REPO_ROOT)
    const records = currentProjectionRecords(platform)
    const marketplace = renderMarketplace(platform, records)
    const catalog = renderPublicCatalog(platform, records)
    const matrix = resolvePublishMatrix(platform, records)
    const [record] = records
    const claude = record?.emissions['claude-code']
    if (record === undefined || claude === undefined || claude.files[0] === undefined) {
      throw new Error('expected a Claude emission with generated files')
    }
    const mutableEmissions = record.emissions as Record<string, unknown>

    expect(() => { delete mutableEmissions['claude-code'] }).toThrow(TypeError)
    expect(() => { (claude.emittedCapabilities as string[]).push('tampered') }).toThrow(TypeError)
    expect(() => { claude.files[0]!.content = 'tampered' }).toThrow(TypeError)
    expect(renderMarketplace(platform, records)).toBe(marketplace)
    expect(renderPublicCatalog(platform, records)).toBe(catalog)
    expect(resolvePublishMatrix(platform, records)).toEqual(matrix)
  })

  it('renders the canonical evidence captured before its public validation result is mutated', async () => {
    const platform = await resolvePlatform(REPO_ROOT)
    const validations = platform.plugins.map((plugin) => validateCanonicalGeneration({
      sourcePath: plugin.sourcePath,
      sourcePackagePath: plugin.sourcePackagePath,
      configPath: plugin.configPath,
      configSource: plugin.config.source,
    }))
    const [firstPlugin] = platform.plugins
    const [firstValidation] = validations
    const originalCapabilities = firstValidation?.emissions['claude-code']?.emittedCapabilities
    if (firstPlugin === undefined || firstValidation === undefined || originalCapabilities === undefined) {
      throw new Error('expected a canonical Claude emission')
    }
    const expectedCapabilities = [...originalCapabilities]
    ;(firstValidation.emissions['claude-code']!.emittedCapabilities as string[]).push('mcp-registration')
    delete (firstValidation.emissions as Record<string, unknown>)['claude-code']

    const records = platform.plugins.map((plugin, index) => {
      const validation = validations[index]
      if (validation === undefined) throw new Error('expected a canonical validation for every plugin')
      return projectionRecordForCurrentGeneration(platform, plugin, validation)
    })
    const firstRecord = records[0]
    if (firstRecord === undefined) throw new Error('expected a projection record')
    const marketplace = JSON.parse(renderMarketplace(platform, records)) as { plugins: { name: string }[] }
    const catalogRow = renderPublicCatalog(platform, records).split('\n').find((line) => line.startsWith('| `moe` |'))

    expect(firstRecord.emissions['claude-code']?.emittedCapabilities).toEqual(expectedCapabilities)
    expect(marketplace.plugins.map((entry) => entry.name)).toContain('moe')
    expect(catalogRow).not.toContain('mcp-registration')
  })

  it('renders only validation-time plugin authority after the resolved plugin is mutated', async () => {
    const platform = await resolvePlatform(REPO_ROOT)
    const records = currentProjectionRecords(platform)
    const expectedMarketplace = renderMarketplace(platform, records)
    const expectedCatalog = renderPublicCatalog(platform, records)
    const expectedMatrix = resolvePublishMatrix(platform, records)
    const plugin = platform.plugins[0]
    const record = records[0]
    if (plugin === undefined || record === undefined) throw new Error('expected the core plugin record')

    const mutablePlugin = plugin as unknown as {
      npmPackage: string
      version: string
      config: { description: string; author?: { name: string }; targets: Record<string, unknown> }
    }
    mutablePlugin.npmPackage = '@attacker/subverted'
    mutablePlugin.version = '9.9.9'
    mutablePlugin.config.description = 'subverted summary'
    if (mutablePlugin.config.author !== undefined) mutablePlugin.config.author.name = 'Subverted Owner'
    mutablePlugin.config.targets['claude-code'] = { intent: 'omit' }

    expect(Object.isFrozen(record.plugin)).toBe(true)
    expect(Object.isFrozen(record.plugin.author)).toBe(true)
    expect(Object.isFrozen(record.plugin.targets)).toBe(true)
    expect(renderMarketplace(platform, records)).toBe(expectedMarketplace)
    expect(renderPublicCatalog(platform, records)).toBe(expectedCatalog)
    expect(resolvePublishMatrix(platform, records)).toEqual(expectedMatrix)
  })
})
