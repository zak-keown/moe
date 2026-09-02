import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { adapters } from '../src/adapters/index.js'
import { validateGeneration } from '../src/generate.js'
import { resolvePlatform } from '../src/platform/load.js'
import {
  currentProjectionRecords,
  projectionRecordForCurrentGeneration,
  resolvePublishMatrix,
  type PluginProjectionRecord,
} from '../src/platform/projections.js'

const REPO_ROOT = join(import.meta.dirname, '../../..')

describe('publish matrix', () => {
  it('resolves one deterministic publish entry for every registry plugin', async () => {
    const platform = await resolvePlatform(REPO_ROOT)
    const matrix = resolvePublishMatrix(platform, currentProjectionRecords(platform))

    expect(matrix).toHaveLength(6)
    expect(new Set(matrix.map((entry) => entry.plugin))).toEqual(new Set(platform.plugins.map((plugin) => plugin.id)))
    expect(matrix).toEqual([
      { plugin: 'moe', package: '@bubstack/moe-core', version: '0.1.4', sourcePackagePath: 'packages/core', generatedArtifactPath: 'plugins/moe' },
      { plugin: 'moe-backstory', package: '@bubstack/moe-backstory', version: '0.1.4', sourcePackagePath: 'packages/backstory', generatedArtifactPath: 'plugins/moe-backstory' },
      { plugin: 'moe-memory', package: '@bubstack/moe-memory', version: '0.1.4', sourcePackagePath: 'packages/memory', generatedArtifactPath: 'plugins/moe-memory' },
      { plugin: 'moe-glass', package: '@bubstack/moe-glass', version: '0.1.4', sourcePackagePath: 'packages/glass', generatedArtifactPath: 'plugins/moe-glass' },
      { plugin: 'moe-crew', package: '@bubstack/moe-crew', version: '0.1.4', sourcePackagePath: 'packages/crew', generatedArtifactPath: 'plugins/moe-crew' },
      { plugin: 'moe-statusline', package: '@bubstack/moe-statusline', version: '0.1.0', sourcePackagePath: 'packages/statusline', generatedArtifactPath: 'plugins/moe-statusline' },
    ])
  })

  it('rejects records fabricated without a current adapter validation pass', async () => {
    const platform = await resolvePlatform(REPO_ROOT)
    const fabricated = platform.plugins.map((plugin) => ({ plugin, emissions: {} })) as unknown as PluginProjectionRecord[]

    expect(() => resolvePublishMatrix(platform, fabricated)).toThrow(
      'current validated generation',
    )
  })

  it('rejects a genuine validation rebound to another resolved plugin', async () => {
    const platform = await resolvePlatform(REPO_ROOT)
    const [first, second] = platform.plugins
    if (first === undefined || second === undefined) throw new Error('expected two resolved plugins')
    const validation = validateGeneration(first.sourcePath, undefined, {
      configPath: first.configPath,
      configSource: first.config.source,
    })

    expect(() => projectionRecordForCurrentGeneration(second, validation)).toThrow(
      'current canonical generation',
    )
  })

  it('rejects a zero-adapter validation pass', async () => {
    const platform = await resolvePlatform(REPO_ROOT)
    const [plugin] = platform.plugins
    if (plugin === undefined) throw new Error('expected a resolved plugin')
    const validation = validateGeneration(plugin.sourcePath, [], {
      configPath: plugin.configPath,
      configSource: plugin.config.source,
    })

    expect(() => projectionRecordForCurrentGeneration(plugin, validation)).toThrow(
      'current canonical generation',
    )
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

    expect(() => projectionRecordForCurrentGeneration(plugin, validation)).toThrow(
      'current canonical generation',
    )
  })
})
