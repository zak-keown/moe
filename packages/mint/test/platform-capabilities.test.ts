import { describe, expect, it } from 'vitest'
import { buildModel } from '../src/model.js'
import { claudeCode } from '../src/adapters/claude-code.js'
import { codex } from '../src/adapters/codex.js'
import {
  mapLegacyComponentSupport,
  validateEmittedCapabilities,
} from '../src/platform/capabilities.js'

const model = buildModel('fixtures/kitchen-sink')

describe('platform emitted capabilities', () => {
  it('maps legacy full, partial, and none support against the emitted projection', () => {
    const emitted = claudeCode.emit(model)
    expect(mapLegacyComponentSupport('claude-code', {
      skills: 'full', commands: 'full', agents: 'full', hooks: 'full', mcp: 'full', bootstrap: 'full',
    }, model, emitted.files)).toEqual([
      'skill-discovery', 'command-discovery', 'agent-discovery', 'hook-execution', 'mcp-registration', 'bootstrap-routing',
    ])
    expect(mapLegacyComponentSupport('codex', {
      skills: 'full', commands: 'none', agents: 'none', hooks: 'none', mcp: 'none', bootstrap: 'partial',
    }, model, codex.emit(model).files)).toEqual(['skill-discovery'])
  })

  it('rejects a missing capability, a duplicate, and an undeclared extra', () => {
    expect(() => validateEmittedCapabilities('fixture', 'claude-code', ['skill-discovery'], [])).toThrow(/missing/i)
    expect(() => validateEmittedCapabilities('fixture', 'claude-code', ['skill-discovery'], ['skill-discovery', 'skill-discovery'])).toThrow(/duplicate/i)
    expect(() => validateEmittedCapabilities('fixture', 'claude-code', ['skill-discovery'], ['skill-discovery', 'mcp-registration'])).toThrow(/undeclared/i)
  })

  it('requires an omitted target to emit no capability', () => {
    expect(() => validateEmittedCapabilities('fixture', 'codex', [], ['skill-discovery'], 'omit')).toThrow(/omitted/i)
  })
})
