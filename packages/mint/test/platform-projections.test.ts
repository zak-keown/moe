import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { AdapterEmission } from '../src/adapters/types.js'
import { resolvePlatform } from '../src/platform/load.js'
import {
  renderMarketplace,
  renderPublicCatalog,
  writeRegistryProjections,
  type PluginProjectionRecord,
} from '../src/platform/projections.js'
import { TARGET_IDS, type TargetId } from '../src/vocabulary.js'

const REPO_ROOT = join(import.meta.dirname, '../../..')

function recordsFor(platform: Awaited<ReturnType<typeof resolvePlatform>>): PluginProjectionRecord[] {
  return platform.plugins.map((plugin) => {
    const emissions: Partial<Record<TargetId, AdapterEmission>> = {}
    for (const target of TARGET_IDS) {
      if (plugin.targets[target].intent === 'omit') continue
      // These deliberately empty, hand-authored emissions prove projections use
      // their current generation input rather than rebuilding expectations from
      // package policy.
      emissions[target] = { files: [], limitations: [], emittedCapabilities: [] }
    }
    return { plugin, emissions }
  })
}

describe('registry projections', () => {
  it('renders a deterministic marketplace from the Claude emissions and the default profile author', async () => {
    const platform = await resolvePlatform(REPO_ROOT)
    const first = renderMarketplace(platform, recordsFor(platform))
    const second = renderMarketplace(platform, recordsFor(platform))

    expect(first).toBe(second)
    expect(first.endsWith('\n')).toBe(true)
    expect(JSON.parse(first)).toMatchObject({
      name: 'core',
      owner: { name: 'Zak Keown', email: 'zak.keown@outlook.com' },
    })
    expect(JSON.parse(first).metadata).toBeUndefined()
    expect(JSON.parse(first).plugins.map((entry: { name: string }) => entry.name)).toEqual(
      platform.plugins.map((plugin) => plugin.id),
    )
  })

  it('renders only supplied emitted capabilities as preview output, never policy expectations or certification', async () => {
    const platform = await resolvePlatform(REPO_ROOT)
    const catalog = renderPublicCatalog(platform, recordsFor(platform))

    expect(catalog).toContain('| Plugin | npm package | Summary | Claude Code |')
    expect(catalog).toContain('| `moe` | `@bubstack/moe-core` |')
    expect(catalog).toContain('preview: none')
    expect(catalog).not.toContain('certified')
    expect(catalog.endsWith('\n')).toBe(true)
  })

  it('keeps target columns in canonical vocabulary order when the registry object is reordered', async () => {
    const platform = await resolvePlatform(REPO_ROOT)
    const reordered = {
      ...platform,
      registry: {
        ...platform.registry,
        targets: Object.fromEntries([...TARGET_IDS].reverse().map((target) => [target, platform.registry.targets[target]])),
      },
    }

    expect(renderPublicCatalog(reordered, recordsFor(platform)).split('\n')[4]).toBe(
      '| Plugin | npm package | Summary | Claude Code | Cursor | Codex | Kimi | OpenCode | Pi | Agent Plugins 1.0 | GitHub Copilot CLI |',
    )
  })

  it('writes only the two repository projection destinations', async () => {
    const platform = await resolvePlatform(REPO_ROOT)
    const root = mkdtempSync(join(tmpdir(), 'mint-projections-'))
    const destinations = {
      marketplacePath: join(root, '.claude-plugin', 'marketplace.json'),
      publicCatalogPath: join(root, 'docs', 'moe', 'generated', 'plugin-catalog.md'),
    }

    await expect(writeRegistryProjections(platform, recordsFor(platform), destinations)).rejects.toThrow(
      'projection destination',
    )
    expect(() => readFileSync(destinations.marketplacePath, 'utf8')).toThrow()
  })
})
