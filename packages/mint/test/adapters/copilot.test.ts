import { describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildModel } from '../../src/model.js'
import { copilot } from '../../src/adapters/copilot.js'
import { adapters, getAdapter } from '../../src/adapters/index.js'
import { withV1Policy } from '../helpers.js'

const model = buildModel('fixtures/kitchen-sink')

function modelFromYaml(yaml: string) {
  const dir = mkdtempSync(join(tmpdir(), 'mint-copilot-'))
  writeFileSync(join(dir, 'moe-mint.yaml'), withV1Policy(yaml))
  return buildModel(dir)
}

describe('copilot adapter', () => {
  it('is registered as an explicit supported harness', () => {
    expect(adapters.map((adapter) => adapter.name)).toContain('copilot')
    expect(getAdapter('copilot')).toBe(copilot)
  })

  it('emits no Copilot-specific files and delegates the projection to Claude Code', () => {
    expect(copilot.emit(model)).toMatchObject({
      files: [],
      emittedCapabilities: [],
      limitations: [],
      projectionOwner: 'claude-code',
    })
  })

  it('emits no Copilot-specific files and reports effective Claude-layout support', () => {
    expect(copilot.emit(model)).toEqual({ files: [], warnings: [] })
    expect(copilot.support).toEqual({
      skills: 'full',
      commands: 'full',
      agents: 'full',
      hooks: 'full',
      mcp: 'full',
      bootstrap: 'full',
      rules: 'none',
      variables: 'none',
    })
  })

  it('uses the Claude marketplace name in the install id', () => {
    const configured = modelFromYaml([
      'name: demo',
      'version: 1.0.0',
      'description: Copilot fixture',
      'repository: https://gitlab.com/moe-ai/moe',
      'marketplace:',
      '  name: moe',
    ].join('\n'))
    const doc = copilot.installDoc!(configured)
    expect(doc).toContain('copilot plugin marketplace add https://gitlab.com/moe-ai/moe')
    expect(doc).toContain('copilot plugin install demo@moe')
  })

  it('records the Claude projection owner even when called without Claude output', () => {
    const withoutClaude = modelFromYaml([
      'name: demo',
      'version: 1.0.0',
      'description: Copilot fixture',
      'harnesses:',
      '  exclude: [claude-code]',
    ].join('\n'))
    expect(copilot.emit(withoutClaude).projectionOwner).toBe('claude-code')
  })
})
