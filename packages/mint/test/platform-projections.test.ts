import { mkdtempSync, readFileSync, readdirSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { AdapterEmission } from '../src/adapters/types.js'
import { resolvePlatform, type ResolvedPlatform } from '../src/platform/load.js'
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
    const reordered: ResolvedPlatform = {
      ...platform,
      registry: {
        ...platform.registry,
        targets: Object.fromEntries([...TARGET_IDS].reverse().map((target) => [target, platform.registry.targets[target]])) as ResolvedPlatform['registry']['targets'],
      },
    }

    expect(renderPublicCatalog(reordered, recordsFor(platform)).split('\n')[4]).toBe(
      '| Plugin | npm package | Summary | Claude Code | Cursor | Codex | Kimi | OpenCode | Pi | Agent Plugins 1.0 | GitHub Copilot CLI |',
    )
  })

  it('escapes target display names in public-catalog headers', async () => {
    const platform = await resolvePlatform(REPO_ROOT)
    const escaped = {
      ...platform,
      registry: {
        ...platform.registry,
        targets: {
          ...platform.registry.targets,
          cursor: { ...platform.registry.targets.cursor, display_name: 'Cursor | preview\nchannel' },
        },
      },
    }

    expect(renderPublicCatalog(escaped, recordsFor(platform)).split('\n')[4]).toContain('Cursor \\| preview channel')
  })

  it('keeps resolved configs, generated roots, marketplace entries, and catalog rows one-to-one', async () => {
    const platform = await resolvePlatform(REPO_ROOT)
    const ids = platform.plugins.map((plugin) => plugin.id)
    const generatedIds = readdirSync(join(REPO_ROOT, 'plugins'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()

    expect(platform.registry.plugins.map((plugin) => plugin.id)).toEqual(ids)
    expect(generatedIds).toEqual([...ids].sort())
    expect(JSON.parse(readFileSync(join(REPO_ROOT, '.claude-plugin', 'marketplace.json'), 'utf8')).plugins.map((entry: { name: string }) => entry.name)).toEqual(ids)
    const catalogIds = readFileSync(join(REPO_ROOT, 'docs', 'moe', 'generated', 'plugin-catalog.md'), 'utf8')
      .split('\n')
      .filter((line) => line.startsWith('| `'))
      .map((line) => /^\| `([^`]+)`/.exec(line)?.[1])
    expect(catalogIds).toEqual(ids)
    for (const plugin of platform.plugins) {
      expect(readFileSync(join(REPO_ROOT, 'plugins', plugin.id, 'moe-mint.yaml'), 'utf8')).toBe(
        readFileSync(plugin.configPath, 'utf8'),
      )
    }
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

  it('writes allowed relative projection destinations against the repository root, not the current working directory', async () => {
    const platform = await resolvePlatform(REPO_ROOT)
    const root = mkdtempSync(join(tmpdir(), 'mint-projection-root-'))
    const isolated = {
      ...platform,
      registry: {
        ...platform.registry,
        plugins: platform.registry.plugins.map((plugin) => ({ ...plugin, sourcePath: join(root, plugin.source) })),
      },
    }
    expect(process.cwd()).not.toBe(root)
    await writeRegistryProjections(isolated, recordsFor(platform), {
      marketplacePath: '.claude-plugin/marketplace.json',
      publicCatalogPath: 'docs/moe/generated/plugin-catalog.md',
    })

    expect(readFileSync(join(root, '.claude-plugin', 'marketplace.json'), 'utf8')).toContain('"name": "core"')
    expect(() => readFileSync(join(process.cwd(), '.claude-plugin', 'marketplace.json'), 'utf8')).toThrow()
  })

  it('rejects a projection destination whose existing parent symlink escapes the repository', async () => {
    const platform = await resolvePlatform(REPO_ROOT)
    const root = mkdtempSync(join(tmpdir(), 'mint-projection-root-'))
    const outside = mkdtempSync(join(tmpdir(), 'mint-projection-outside-'))
    symlinkSync(outside, join(root, 'docs'))
    const isolated = {
      ...platform,
      registry: {
        ...platform.registry,
        plugins: platform.registry.plugins.map((plugin) => ({ ...plugin, sourcePath: join(root, plugin.source) })),
      },
    }

    await expect(writeRegistryProjections(isolated, recordsFor(platform), {
      marketplacePath: '.claude-plugin/marketplace.json',
      publicCatalogPath: 'docs/moe/generated/plugin-catalog.md',
    })).rejects.toThrow('escapes the repository')
    expect(() => readFileSync(join(outside, 'moe', 'generated', 'plugin-catalog.md'), 'utf8')).toThrow()
  })
})
