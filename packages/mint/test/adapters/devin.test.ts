import { describe, it, expect } from 'vitest'
import { byPathMap, mustGet } from '../helpers.js'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildModel } from '../../src/model.js'
import { devin } from '../../src/adapters/devin.js'
import { adapters, getAdapter } from '../../src/adapters/index.js'

const model = buildModel('fixtures/kitchen-sink')

describe('adapter registry', () => {
  it('registers devin', () => {
    expect(adapters.map((a) => a.name)).toContain('devin')
    expect(getAdapter('devin')).toBe(devin)
  })
})

describe('devin adapter', () => {
  const result = devin.emit(model)
  const byPath = byPathMap(result.files)

  it('emits .devin-plugin/plugin.json with base fields only (no skills/hooks keys)', () => {
    const manifest = JSON.parse(mustGet(byPath, '.devin-plugin/plugin.json'))
    expect(manifest).toEqual({
      name: 'kitchen-sink',
      version: '0.1.0',
      description: 'Fixture plugin exercising every component type',
      author: { name: 'Bubstack', email: 'dev@bubstack.example' },
      license: 'MIT',
      repository: 'https://github.com/example/kitchen-sink',
      keywords: ['fixture'],
    })
  })

  it('warns about hooks, commands, agents, and mcp not being emitted for devin', () => {
    expect(result.warnings).toEqual([
      'hooks are not emitted for devin',
      'commands are not emitted for devin',
      'agents are not emitted for devin',
      'mcp servers are not emitted for devin',
    ])
  })

  it('declares expected support levels', () => {
    expect(devin.support).toEqual({
      skills: 'full',
      commands: 'none',
      agents: 'none',
      hooks: 'none',
      mcp: 'none',
      bootstrap: 'none',
    })
  })
})

describe('devin adapter installDoc', () => {
  it('uses `owner/repo` shorthand for github (kitchen-sink fixture)', () => {
    expect(devin.installDoc!(model)).toContain('devin plugins install example/kitchen-sink')
  })

  it('emits the full URL for a non-github host', () => {
    // Regression: previously the helper only matched github.com, so any
    // gitlab.tcdevops.com repository fell back to a <your-repo> placeholder.
    const dir = mkdtempSync(join(tmpdir(), 'mint-devin-installdoc-nongithub-'))
    writeFileSync(
      join(dir, 'moe-mint.yaml'),
      'name: gh\nversion: 1.0.0\ndescription: self-hosted gitlab fixture\nrepository: https://gitlab.tcdevops.com/Zak/moe\nbootstrap: none\n',
    )
    const gitlabModel = buildModel(dir)
    const body = devin.installDoc!(gitlabModel)
    expect(body).toContain('devin plugins install https://gitlab.tcdevops.com/Zak/moe')
    expect(body).not.toContain('<your-repo>')
  })
})
