import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { AdapterEmission } from '../src/adapters/types.js'
import { resolvePlatform } from '../src/platform/load.js'
import { resolvePublishMatrix, type PluginProjectionRecord } from '../src/platform/projections.js'
import { TARGET_IDS, type TargetId } from '../src/vocabulary.js'

const REPO_ROOT = join(import.meta.dirname, '../../..')

function recordsFor(platform: Awaited<ReturnType<typeof resolvePlatform>>): PluginProjectionRecord[] {
  return platform.plugins.map((plugin) => {
    const emissions: Partial<Record<TargetId, AdapterEmission>> = {}
    for (const target of TARGET_IDS) {
      if (plugin.targets[target].intent !== 'omit') {
        emissions[target] = { files: [], limitations: [], emittedCapabilities: [] }
      }
    }
    return { plugin, emissions }
  })
}

describe('publish matrix', () => {
  it('resolves one deterministic publish entry for every registry plugin', async () => {
    const platform = await resolvePlatform(REPO_ROOT)
    const matrix = resolvePublishMatrix(platform, recordsFor(platform))

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
})
