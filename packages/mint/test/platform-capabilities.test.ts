import { describe, expect, it } from 'vitest'
import { buildModel } from '../src/model.js'
import type { PluginModel } from '../src/model.js'
import { claudeCode } from '../src/adapters/claude-code.js'
import { codex } from '../src/adapters/codex.js'
import { cursor } from '../src/adapters/cursor.js'
import { kimi } from '../src/adapters/kimi.js'
import { opencode } from '../src/adapters/opencode.js'
import { pi } from '../src/adapters/pi.js'
import { agentPlugins } from '../src/adapters/agent-plugins.js'
import { copilot } from '../src/adapters/copilot.js'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { withV1Policy } from './helpers.js'
import {
  mapLegacyComponentSupport,
  validateEmittedCapabilities,
} from '../src/platform/capabilities.js'

const model = buildModel('fixtures/kitchen-sink')

describe('platform emitted capabilities', () => {
  it('maps every legacy adapter matrix to capabilities from its emitted projection', () => {
    const matrix = [
      [claudeCode, { skills: 'full', commands: 'full', agents: 'full', hooks: 'full', mcp: 'full', bootstrap: 'full', rules: 'none', variables: 'none' }, ['skill-discovery', 'command-discovery', 'agent-discovery', 'hook-execution', 'mcp-registration', 'bootstrap-routing']],
      [cursor, { skills: 'full', commands: 'none', agents: 'none', hooks: 'partial', mcp: 'none', bootstrap: 'full', rules: 'none', variables: 'none' }, ['skill-discovery', 'hook-execution', 'bootstrap-routing']],
      [codex, { skills: 'full', commands: 'none', agents: 'none', hooks: 'none', mcp: 'none', bootstrap: 'partial', rules: 'none', variables: 'none' }, ['skill-discovery']],
      [kimi, { skills: 'full', commands: 'none', agents: 'none', hooks: 'none', mcp: 'none', bootstrap: 'partial', rules: 'none', variables: 'none' }, ['skill-discovery', 'bootstrap-routing']],
      [opencode, { skills: 'full', commands: 'full', agents: 'partial', hooks: 'none', mcp: 'none', bootstrap: 'full', rules: 'none', variables: 'none' }, ['skill-discovery', 'command-discovery', 'agent-discovery', 'bootstrap-routing']],
      [pi, { skills: 'full', commands: 'none', agents: 'none', hooks: 'none', mcp: 'none', bootstrap: 'full', rules: 'none', variables: 'none' }, ['skill-discovery', 'bootstrap-routing']],
      [agentPlugins, { skills: 'full', commands: 'none', agents: 'none', hooks: 'none', mcp: 'full', bootstrap: 'none', rules: 'none', variables: 'none' }, ['skill-discovery', 'mcp-registration', 'format-conformance']],
      [copilot, { skills: 'full', commands: 'full', agents: 'full', hooks: 'full', mcp: 'full', bootstrap: 'full', rules: 'none', variables: 'none' }, []],
    ] as const
    for (const [adapter, support, expected] of matrix) {
      expect(mapLegacyComponentSupport(adapter.name as Parameters<typeof mapLegacyComponentSupport>[0], support, model, adapter.emit(model).files)).toEqual(expected)
    }
  })

  it('reports missing, duplicate, and undeclared emissions through stable diagnostics', () => {
    const cases = [
      [[], 'CAPABILITY_EMITTED_MISSING'],
      [['skill-discovery', 'skill-discovery'], 'CAPABILITY_EMITTED_DUPLICATE'],
      [['skill-discovery', 'mcp-registration'], 'CAPABILITY_EMITTED_UNDECLARED'],
    ] as const
    for (const [emitted, code] of cases) {
      try {
        validateEmittedCapabilities('fixture', 'claude-code', ['skill-discovery'], emitted)
        throw new Error('expected emitted capability rejection')
      } catch (error) {
        expect((error as { diagnostic?: unknown }).diagnostic).toMatchObject({
          code, plugin: 'fixture', target: 'claude-code', source: 'moe-mint.yaml', field: 'targets.claude-code.expected_capabilities',
        })
      }
    }
  })

  it('rejects duplicate and noncanonical expected declarations with structured capability diagnostics', () => {
    for (const expected of [
      [['skill-discovery', 'skill-discovery'], 'CAPABILITY_EXPECTED_DUPLICATE'],
      [['mcp-registration', 'skill-discovery'], 'CAPABILITY_EXPECTED_NONCANONICAL'],
    ] as const) {
      try {
        validateEmittedCapabilities('fixture', 'claude-code', expected[0], ['skill-discovery', 'mcp-registration'])
        throw new Error('expected capability declaration rejection')
      } catch (error) {
        expect((error as { diagnostic?: unknown }).diagnostic).toMatchObject({
          code: expected[1],
          plugin: 'fixture', target: 'claude-code', source: 'moe-mint.yaml', field: 'targets.claude-code.expected_capabilities',
        })
      }
    }
  })

  it('does not claim Kimi skills or bootstrap after a manifest override deletes them', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mint-kimi-capability-'))
    mkdirSync(join(dir, 'skills', 'demo'), { recursive: true })
    writeFileSync(join(dir, 'skills', 'demo', 'SKILL.md'), '---\nname: demo\ndescription: Demo\n---\n')
    writeFileSync(join(dir, 'moe-mint.yaml'), withV1Policy([
      'name: kimi-override', 'version: 1.0.0', 'description: Kimi override fixture', 'bootstrap:', '  skill: demo',
      'harnesses:', '  kimi:', '    manifest:', '      skills: null', '      sessionStart: null',
    ].join('\n')))
    expect(kimi.emit(buildModel(dir)).emittedCapabilities).toEqual([])
  })

  it('derives Claude Code, Cursor, and Codex capabilities from their final manifest content', () => {
    const withManifestOverride = (target: 'claude-code' | 'cursor' | 'codex', manifest: Record<string, unknown>): PluginModel => ({
      ...model,
      config: {
        ...model.config,
        components: {
          ...model.config.components,
          skills: 'custom-skills',
          commands: 'custom-commands',
          agents: 'custom-agents',
          hooks: 'custom-hooks.json',
          mcp: 'custom-mcp.json',
        },
        harnesses: {
          ...model.config.harnesses,
          settings: {
            ...model.config.harnesses.settings,
            [target]: { hooks: model.config.harnesses.settings[target]?.hooks ?? 'generated', manifest },
          },
        },
      },
    })

    expect(claudeCode.emit(withManifestOverride('claude-code', {
      skills: null, commands: null, agents: null, hooks: null, mcpServers: null,
    })).emittedCapabilities).toEqual([])
    expect(cursor.emit(withManifestOverride('cursor', { skills: null, hooks: null })).emittedCapabilities).toEqual([])
    expect(codex.emit(withManifestOverride('codex', { skills: null })).emittedCapabilities).toEqual([])
  })

  it('reports emitted capabilities for an omitted target through a stable diagnostic', () => {
    try {
      validateEmittedCapabilities('fixture', 'codex', [], ['skill-discovery'], 'omit')
      throw new Error('expected omitted target rejection')
    } catch (error) {
      expect((error as { diagnostic?: unknown }).diagnostic).toMatchObject({
        code: 'CAPABILITY_OMITTED_EMITTED', plugin: 'fixture', target: 'codex', source: 'moe-mint.yaml', field: 'targets.codex.expected_capabilities',
      })
    }
  })
})
