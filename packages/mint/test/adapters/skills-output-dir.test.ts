import { describe, it, expect } from 'vitest'
import { adapters } from '../../src/adapters/index.js'

describe('skillLayout', () => {
  it('declares the exact profile, output directory, and rendering mode for every adapter', () => {
    expect(Object.fromEntries(adapters.map((adapter) => [adapter.name, adapter.skillLayout]))).toEqual({
      'claude-code': {
        outputDir: '.claude-plugin/skills',
        profile: 'claude-code',
        mode: 'rendered',
      },
      copilot: {
        outputDir: '.claude-plugin/skills',
        profile: 'claude-code',
        mode: 'rendered',
      },
      'agent-plugins-1.0': {
        outputDir: 'skills',
        profile: 'agent-plugins-1.0',
        mode: 'source-or-rendered',
      },
      cursor: {
        outputDir: '.cursor-plugin/skills',
        profile: 'cursor',
        mode: 'rendered',
      },
      codex: {
        outputDir: '.codex-plugin/skills',
        profile: 'codex',
        mode: 'rendered',
      },
      kimi: {
        outputDir: '.kimi-plugin/skills',
        profile: 'kimi',
        mode: 'rendered',
      },
      opencode: {
        outputDir: '.opencode/skills',
        profile: 'opencode',
        mode: 'rendered',
      },
      pi: {
        outputDir: '.pi/skills',
        profile: 'pi',
        mode: 'rendered',
      },
    })
  })

  it('declares how each adapter delivers its skill tree', () => {
    expect(Object.fromEntries(adapters.map((adapter) => [adapter.name, adapter.skillDelivery]))).toEqual({
      'claude-code': 'rendered',
      cursor: 'rendered',
      codex: 'rendered',
      kimi: 'rendered',
      opencode: 'rendered',
      pi: 'rendered',
      'agent-plugins-1.0': 'native-discovery',
      copilot: 'shared-compatible',
    })
  })
})
