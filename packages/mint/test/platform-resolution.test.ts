import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config.js'
import { loadPlatformRegistry, resolvePlatform, resolvePlugin } from '../src/platform/load.js'

const platformYaml = `
schema: 1
targets:
  claude-code: { display_name: Claude Code, kind: host }
  cursor: { display_name: Cursor, kind: host }
  codex: { display_name: Codex, kind: host }
  kimi: { display_name: Kimi, kind: host }
  opencode:
    display_name: OpenCode
    kind: host
    contract: { source: https://github.com/anomalyco/opencode, revision: ef2792511deb406f3b064e05a7cc1a01979260ee, path: packages/opencode/src/plugin/shared.ts }
  pi:
    display_name: Pi
    kind: host
    contract: { source: https://github.com/badlogic/pi-mono, revision: e266507b606b9552fa277252644054afd4384b11, path: packages/coding-agent/docs/packages.md }
  agent-plugins-1.0: { display_name: Agent Plugins 1.0, kind: format }
  copilot: { display_name: GitHub Copilot CLI, kind: host, requires: [claude-code] }
profiles: { core: { default: true, plugins: [moe-memory] } }
plugins:
  - { id: moe-memory, source: packages/memory, config: packages/memory/mint/moe-mint.yaml }
platform:
  known_operating_systems: [macos, linux, wsl2, windows]
  contributor_operating_systems: [macos, linux, wsl2]
  core_cli_required_operating_systems: [macos, linux, wsl2, windows]
  formal_release_requires_target_os_matrix: true
release:
  origin: { kind: npm, registry: https://registry.npmjs.org }
  mirror: { kind: github-release }
  channels: { stable: latest, prerelease: next }
`

function configYaml(extra = ''): string {
  return `
name: moe-memory
version: 1.0.0
description: Memory
license: MIT
distribution: { npm: "@bubstack/moe-memory" }
artifact: { payloads: [] }
targets:
  claude-code: { intent: certify, expected_capabilities: [skill-discovery], operating_systems: [macos, linux] }
  cursor: { intent: omit }
  codex: { intent: preview, expected_capabilities: [skill-discovery], operating_systems: [macos] }
  kimi: { intent: omit }
  opencode: { intent: omit }
  pi: { intent: omit }
  agent-plugins-1.0: { intent: omit }
  copilot: { intent: omit }
imported_works: []
harnesses:
  exclude: [cursor, kimi, opencode, pi, agent-plugins-1.0, copilot]
${extra}`
}

function repoWith(config = configYaml(), manifest: Record<string, unknown> = {
  name: '@bubstack/moe-memory', version: '1.0.0', license: 'MIT',
}, configFile = 'moe-mint.yaml'): string {
  const root = mkdtempSync(join(tmpdir(), 'mint-platform-resolution-'))
  const packageRoot = join(root, 'packages/memory')
  mkdirSync(join(packageRoot, 'mint'), { recursive: true })
  writeFileSync(join(root, 'moe-platform.yaml'), platformYaml.replace('packages/memory/mint/moe-mint.yaml', `packages/memory/mint/${configFile}`).trimStart())
  mkdirSync(dirname(join(packageRoot, 'mint', configFile)), { recursive: true })
  writeFileSync(join(packageRoot, 'mint', configFile), config)
  writeFileSync(join(packageRoot, 'package.json'), JSON.stringify(manifest))
  return root
}

describe('platform resolution', () => {
  it('resolves package-local policy with its source manifest', async () => {
    const root = repoWith()
    const platform = await loadPlatformRegistry(root)
    const parsed = loadConfig(join(root, 'packages/memory/mint'))
    const sourceManifest = { name: '@bubstack/moe-memory', version: '1.0.0', license: 'MIT' }

    expect(resolvePlugin(platform, parsed, sourceManifest)).toMatchObject({
      id: 'moe-memory',
      npmPackage: '@bubstack/moe-memory',
      targets: {
        'claude-code': { intent: 'certify' },
        codex: { intent: 'preview' },
      },
    })
    await expect(resolvePlatform(root)).resolves.toMatchObject({
      repositoryRoot: realpathSync(root),
      plugins: [{ id: 'moe-memory', npmPackage: '@bubstack/moe-memory' }],
    })
  })

  it('rejects target settings for an omitted target', () => {
    const root = repoWith(configYaml()
      .replace('  codex: { intent: preview, expected_capabilities: [skill-discovery], operating_systems: [macos] }', '  codex: { intent: omit }')
      .replace('agent-plugins-1.0, copilot]', 'agent-plugins-1.0, copilot, codex]')
      .replace('  exclude: [cursor, kimi, opencode, pi, agent-plugins-1.0, copilot, codex]', '  exclude: [cursor, kimi, opencode, pi, agent-plugins-1.0, copilot, codex]\n  codex: { manifest: { name: ignored } }'))
    try {
      loadConfig(join(root, 'packages/memory/mint'))
      expect.unreachable('loadConfig should reject settings for an omitted target')
    } catch (error) {
      expect(error).toMatchObject({
        diagnostic: {
          code: 'TARGET_OMITTED_SETTINGS',
          source: 'moe-mint.yaml',
          field: 'harnesses.codex',
          target: 'codex',
        },
      })
    }
  })

  it('attributes a registry-declared custom config filename in migration diagnostics', async () => {
    const config = configYaml()
      .replace('  codex: { intent: preview, expected_capabilities: [skill-discovery], operating_systems: [macos] }', '  codex: { intent: omit }')
      .replace('agent-plugins-1.0, copilot]', 'agent-plugins-1.0, copilot, codex]')
      .replace('  exclude: [cursor, kimi, opencode, pi, agent-plugins-1.0, copilot, codex]', '  exclude: [cursor, kimi, opencode, pi, agent-plugins-1.0, copilot, codex]\n  codex: { manifest: { name: ignored } }')
    const root = repoWith(config, undefined, 'policy/custom-mint.yaml')
    await expect(resolvePlatform(root)).rejects.toMatchObject({
      diagnostic: {
        code: 'TARGET_OMITTED_SETTINGS',
        source: 'packages/memory/mint/policy/custom-mint.yaml',
        field: 'harnesses.codex',
        target: 'codex',
      },
    })
  })

  it('rejects Copilot when its Claude prerequisite is omitted', async () => {
    const config = configYaml()
      .replace('  claude-code: { intent: certify, expected_capabilities: [skill-discovery], operating_systems: [macos, linux] }', '  claude-code: { intent: omit }')
      .replace('agent-plugins-1.0, copilot]', 'agent-plugins-1.0, claude-code]')
      .replace('  copilot: { intent: omit }', '  copilot: { intent: preview, expected_capabilities: [], operating_systems: [macos] }')
    const root = repoWith(config, undefined, 'policy/custom-mint.yaml')
    await expect(resolvePlatform(root)).rejects.toMatchObject({
      diagnostic: {
        code: 'TARGET_PREREQUISITE_UNMET',
        source: 'packages/memory/mint/policy/custom-mint.yaml',
        field: 'targets.copilot.intent',
        plugin: 'moe-memory',
        target: 'copilot',
      },
    })
  })

  it.each([
    ['name', { name: '@bubstack/other', version: '1.0.0', license: 'MIT' }, 'PACKAGE_NAME_MISMATCH'],
    ['version', { name: '@bubstack/moe-memory', version: '9.0.0', license: 'MIT' }, 'PACKAGE_VERSION_MISMATCH'],
    ['license', { name: '@bubstack/moe-memory', version: '1.0.0', license: 'Apache-2.0' }, 'PACKAGE_LICENSE_MISMATCH'],
  ])('reports a source package %s mismatch with context', async (field, manifest, code) => {
    const root = repoWith(undefined, manifest)
    await expect(resolvePlatform(root)).rejects.toMatchObject({
      diagnostic: { code, plugin: 'moe-memory', source: expect.stringContaining('package.json'), field },
    })
  })

  it('rejects a source OS constraint that excludes an active target operating system', async () => {
    const root = repoWith(undefined, { name: '@bubstack/moe-memory', version: '1.0.0', license: 'MIT', os: ['darwin'] })
    await expect(resolvePlatform(root)).rejects.toMatchObject({
      diagnostic: { code: 'TARGET_OS_CONTRADICTION', plugin: 'moe-memory', source: expect.stringContaining('package.json'), field: 'os' },
    })
  })

  it('rejects a source CPU constraint that narrows an active host matrix', async () => {
    const root = repoWith(undefined, { name: '@bubstack/moe-memory', version: '1.0.0', license: 'MIT', cpu: ['arm64'] })
    await expect(resolvePlatform(root)).rejects.toMatchObject({
      diagnostic: { code: 'TARGET_OS_CONTRADICTION', plugin: 'moe-memory', source: expect.stringContaining('package.json'), field: 'cpu' },
    })
  })
})
