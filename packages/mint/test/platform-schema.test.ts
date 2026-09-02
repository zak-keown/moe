import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { loadPlatformRegistry } from '../src/platform/load.js'

const REPO_ROOT = join(import.meta.dirname, '../../..')

const registry = `
schema: 1
targets:
  claude-code: { display_name: Claude Code, kind: host }
  cursor: { display_name: Cursor, kind: host }
  codex: { display_name: Codex, kind: host }
  kimi: { display_name: Kimi, kind: host }
  opencode:
    display_name: OpenCode
    kind: host
    contract:
      source: https://github.com/anomalyco/opencode
      revision: ef2792511deb406f3b064e05a7cc1a01979260ee
      path: packages/opencode/src/plugin/shared.ts
  pi:
    display_name: Pi
    kind: host
    contract:
      source: https://github.com/badlogic/pi-mono
      revision: e266507b606b9552fa277252644054afd4384b11
      path: packages/coding-agent/docs/packages.md
  agent-plugins-1.0: { display_name: Agent Plugins 1.0, kind: format }
  copilot:
    display_name: GitHub Copilot CLI
    kind: host
    requires: [claude-code]
profiles:
  core:
    default: true
    plugins: [moe]
plugins:
  - id: moe
    source: packages/core
    config: packages/core/mint/moe.yaml
platform:
  known_operating_systems: [macos, linux, wsl2, windows]
  contributor_operating_systems: [macos, linux, wsl2]
  core_cli_required_operating_systems: [macos, linux, wsl2, windows]
  formal_release_requires_target_os_matrix: true
release:
  origin:
    kind: npm
    registry: https://registry.npmjs.org
  mirror:
    kind: github-release
  channels:
    stable: latest
    prerelease: next
`

function fixtureRoot(name: string, yaml = registry): string {
  const root = mkdtempSync(join(tmpdir(), `mint-platform-${name}-`))
  mkdirSync(join(root, 'packages/core/mint'), { recursive: true })
  writeFileSync(join(root, 'packages/core/mint/moe.yaml'), 'name: moe\n')
  writeFileSync(join(root, 'moe-platform.yaml'), yaml.trimStart())
  return root
}

describe('platform registry schema', () => {
  it('loads the repository registry with the pinned OpenCode and Pi contracts', async () => {
    const platform = await loadPlatformRegistry(REPO_ROOT)

    expect(platform.schema).toBe(1)
    expect(platform.plugins.map((plugin) => plugin.id)).toEqual([
      'moe',
      'moe-backstory',
      'moe-memory',
      'moe-glass',
      'moe-crew',
      'moe-statusline',
    ])
    expect(platform.targets.opencode.contract).toEqual({
      source: 'https://github.com/anomalyco/opencode',
      revision: 'ef2792511deb406f3b064e05a7cc1a01979260ee',
      path: 'packages/opencode/src/plugin/shared.ts',
    })
    expect(platform.targets.pi.contract).toEqual({
      source: 'https://github.com/badlogic/pi-mono',
      revision: 'e266507b606b9552fa277252644054afd4384b11',
      path: 'packages/coding-agent/docs/packages.md',
    })
  })

  it('rejects an unknown target ID', async () => {
    const root = fixtureRoot('unknown-target', registry.replace('targets:\n', 'targets:\n  unknown: { display_name: Unknown, kind: host }\n'))

    await expect(loadPlatformRegistry(root)).rejects.toMatchObject({
      diagnostic: { code: 'PLATFORM_UNKNOWN_TARGET', source: 'moe-platform.yaml', field: 'targets.unknown' },
    })
  })

  it('rejects a registry missing a canonical target ID', async () => {
    const root = fixtureRoot('missing-target', registry.replace('  kimi: { display_name: Kimi, kind: host }\n', ''))

    await expect(loadPlatformRegistry(root)).rejects.toMatchObject({
      diagnostic: { code: 'PLATFORM_SCHEMA_INVALID', source: 'moe-platform.yaml', field: 'targets.kimi' },
    })
  })

  it('rejects a registry target with an arbitrary unknown key', async () => {
    const root = fixtureRoot('unknown-target-key', registry.replace(
      '  cursor: { display_name: Cursor, kind: host }\n',
      '  cursor:\n    display_name: Cursor\n    kind: host\n    unexpected: true\n',
    ))

    await expect(loadPlatformRegistry(root)).rejects.toMatchObject({
      diagnostic: { code: 'PLATFORM_SCHEMA_INVALID', source: 'moe-platform.yaml' },
    })
  })

  it('requires Copilot to name Claude Code as its sole prerequisite', async () => {
    const root = fixtureRoot('copilot-prerequisite-missing', registry.replace('    requires: [claude-code]\n', ''))

    await expect(loadPlatformRegistry(root)).rejects.toMatchObject({
      diagnostic: { code: 'PLATFORM_TARGET_PREREQUISITE', source: 'moe-platform.yaml', field: 'targets.copilot.requires' },
    })
  })

  it('rejects a Copilot prerequisite other than Claude Code', async () => {
    const root = fixtureRoot('copilot-prerequisite-wrong', registry.replace('[claude-code]', '[cursor]'))

    await expect(loadPlatformRegistry(root)).rejects.toMatchObject({
      diagnostic: { code: 'PLATFORM_TARGET_PREREQUISITE', source: 'moe-platform.yaml', field: 'targets.copilot.requires' },
    })
  })

  it('rejects duplicate plugin IDs', async () => {
    const root = fixtureRoot('duplicate-id', registry.replace('platform:\n', '  - id: moe\n    source: packages/other\n    config: packages/other/mint/moe.yaml\nplatform:\n'))
    mkdirSync(join(root, 'packages/other/mint'), { recursive: true })
    writeFileSync(join(root, 'packages/other/mint/moe.yaml'), 'name: other\n')

    await expect(loadPlatformRegistry(root)).rejects.toMatchObject({
      diagnostic: { code: 'PLATFORM_DUPLICATE_PLUGIN_ID', source: 'moe-platform.yaml', field: 'plugins[1].id' },
    })
  })

  it('rejects duplicate resolved plugin paths', async () => {
    const root = fixtureRoot('duplicate-path', registry.replace('platform:\n', '  - id: other\n    source: packages/core/.\n    config: packages/core/mint/./moe.yaml\nplatform:\n'))

    await expect(loadPlatformRegistry(root)).rejects.toMatchObject({
      diagnostic: { code: 'PLATFORM_DUPLICATE_PLUGIN_PATH', source: 'moe-platform.yaml', field: 'plugins[1].source' },
    })
  })

  it('rejects duplicate resolved plugin config paths', async () => {
    const root = fixtureRoot('duplicate-config-path', registry.replace('platform:\n', '  - id: other\n    source: packages/other\n    config: packages/core/mint/./moe.yaml\nplatform:\n'))
    mkdirSync(join(root, 'packages/other'), { recursive: true })

    await expect(loadPlatformRegistry(root)).rejects.toMatchObject({
      diagnostic: { code: 'PLATFORM_DUPLICATE_PLUGIN_PATH', source: 'moe-platform.yaml', field: 'plugins[1].config' },
    })
  })

  it('rejects profiles that name a plugin outside the registry', async () => {
    const root = fixtureRoot('unknown-profile-member', registry.replace('plugins: [moe]', 'plugins: [not-a-plugin]'))

    await expect(loadPlatformRegistry(root)).rejects.toMatchObject({
      diagnostic: { code: 'PLATFORM_UNKNOWN_PROFILE_MEMBER', source: 'moe-platform.yaml', field: 'profiles.core.plugins[0]' },
    })
  })

  it('rejects an absolute registry path', async () => {
    const root = fixtureRoot('absolute-registry', registry.replace('source: packages/core', 'source: /tmp/core'))

    await expect(loadPlatformRegistry(root)).rejects.toMatchObject({
      diagnostic: { code: 'PLATFORM_PATH_ESCAPE', source: 'moe-platform.yaml', field: 'plugins[0].source' },
    })
  })

  it('rejects a registry path that escapes the repository', async () => {
    const root = fixtureRoot('escaping-registry', registry.replace('source: packages/core', 'source: packages/../..'))

    await expect(loadPlatformRegistry(root)).rejects.toMatchObject({
      diagnostic: { code: 'PLATFORM_PATH_ESCAPE', source: 'moe-platform.yaml', field: 'plugins[0].source' },
    })
  })

  it('rejects a registry path whose symlink resolves outside the repository', async () => {
    const root = fixtureRoot('symlink-escape', registry.replace('source: packages/core', 'source: packages/escape'))
    const outside = mkdtempSync(join(tmpdir(), 'mint-platform-outside-'))
    symlinkSync(outside, join(root, 'packages/escape'))

    await expect(loadPlatformRegistry(root)).rejects.toMatchObject({
      diagnostic: { code: 'PLATFORM_PATH_ESCAPE', source: 'moe-platform.yaml', field: 'plugins[0].source' },
    })
  })

  it('reports a missing repository root as an actionable diagnostic', async () => {
    const root = join(mkdtempSync(join(tmpdir(), 'mint-platform-missing-root-')), 'missing')

    await expect(loadPlatformRegistry(root)).rejects.toMatchObject({
      diagnostic: { code: 'PLATFORM_ROOT_NOT_FOUND', source: root, path: root },
    })
  })

  it('distinguishes a registry read failure from invalid YAML', async () => {
    const root = mkdtempSync(join(tmpdir(), 'mint-platform-registry-directory-'))
    mkdirSync(join(root, 'moe-platform.yaml'))

    await expect(loadPlatformRegistry(root)).rejects.toMatchObject({
      diagnostic: { code: 'PLATFORM_REGISTRY_READ_FAILED', source: 'moe-platform.yaml', path: expect.stringContaining('moe-platform.yaml') },
    })
  })

  it('reports invalid YAML separately from registry filesystem failures', async () => {
    const root = fixtureRoot('invalid-yaml', 'schema: [')

    await expect(loadPlatformRegistry(root)).rejects.toMatchObject({
      diagnostic: { code: 'PLATFORM_YAML_INVALID', source: 'moe-platform.yaml' },
    })
  })

  it('rejects unsupported operating-system IDs', async () => {
    const root = fixtureRoot('unknown-os', registry.replace('[macos, linux, wsl2, windows]', '[macos, haiku]'))

    await expect(loadPlatformRegistry(root)).rejects.toMatchObject({
      diagnostic: { code: 'PLATFORM_UNSUPPORTED_OPERATING_SYSTEM', source: 'moe-platform.yaml', field: 'platform.known_operating_systems[1]' },
    })
  })

  it('rejects package metadata at registry scope', async () => {
    const root = fixtureRoot('plugin-metadata', registry.replace('    source: packages/core\n', '    source: packages/core\n    version: 1.0.0\n'))

    await expect(loadPlatformRegistry(root)).rejects.toMatchObject({
      diagnostic: { code: 'PLATFORM_FORBIDDEN_PLUGIN_METADATA', source: 'moe-platform.yaml', field: 'plugins[0].version' },
    })
  })
})
