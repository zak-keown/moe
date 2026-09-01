import { describe, it, expect } from 'vitest'
import { byPathMap, mustGet } from '../helpers.js'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildModel } from '../../src/model.js'
import { codex } from '../../src/adapters/codex.js'
import { adapters, getAdapter } from '../../src/adapters/index.js'

const model = buildModel('fixtures/kitchen-sink')

describe('adapter registry', () => {
  it('registers codex', () => {
    expect(adapters.map((a) => a.name)).toContain('codex')
    expect(getAdapter('codex')).toBe(codex)
  })
})

describe('codex adapter', () => {
  const result = codex.emit(model)
  const byPath = byPathMap(result.files)

  it('emits .codex-plugin/plugin.json with base fields, always-empty hooks, and no interface (no codex override in kitchen-sink)', () => {
    const manifest = JSON.parse(mustGet(byPath, '.codex-plugin/plugin.json'))
    expect(manifest).toEqual({
      name: 'kitchen-sink',
      version: '0.1.0',
      description: 'Fixture plugin exercising every component type',
      author: { name: 'Bubstack', email: 'dev@bubstack.example' },
      license: 'MIT',
      repository: 'https://github.com/example/kitchen-sink',
      keywords: ['fixture'],
      skills: './skills/',
      hooks: {},
    })
  })

  it('emits the Agent Plugins marketplace descriptor used by Codex installation', () => {
    const manifest = JSON.parse(mustGet(byPath, '.agents/plugins/marketplace.json'))
    expect(manifest).toEqual({
      name: 'kitchen-sink-dev',
      interface: { displayName: 'kitchen-sink' },
      plugins: [
        {
          name: 'kitchen-sink',
          source: { source: 'url', url: './' },
          policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
          category: 'Developer Tools',
        },
      ],
    })
  })

  it('warns about hooks, commands, agents, and mcp not being emitted for codex', () => {
    expect(result.warnings).toEqual([
      'hooks are not supported on codex; bootstrap relies on native skill discovery',
      'commands are not supported on codex (no plugin-shipped prompt mechanism)',
      'agents are not emitted for codex in v1',
      'mcp servers are not emitted for codex in v1',
    ])
  })

  it('declares expected support levels', () => {
    expect(codex.support).toEqual({
      skills: 'full',
      commands: 'none',
      agents: 'none',
      hooks: 'none',
      mcp: 'none',
      bootstrap: 'partial',
    })
  })
})

describe('codex adapter with harnesses.codex.manifest', () => {
  it('deep-merges interface portal metadata from the manifest patch into plugin.json', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mint-codex-override-'))
    writeFileSync(
      join(dir, 'moe-mint.yaml'),
      [
        'name: override-demo',
        'version: 1.0.0',
        'description: override fixture for codex interface metadata',
        'harnesses:',
        '  codex:',
        '    manifest:',
        '      interface:',
        '        displayName: Demo',
      ].join('\n'),
    )
    const overrideModel = buildModel(dir)
    const result = codex.emit(overrideModel)
    const manifest = JSON.parse(result.files.find((f) => f.path === '.codex-plugin/plugin.json')!.content)
    expect(manifest.interface.displayName).toBe('Demo')
  })
})
