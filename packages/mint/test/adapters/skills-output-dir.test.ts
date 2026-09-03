import { describe, it, expect } from 'vitest'
import { adapters } from '../../src/adapters/index.js'

describe('skillsOutputDir', () => {
  it('every adapter has skillsOutputDir defined or explicitly undefined', () => {
    for (const adapter of adapters) {
      expect('skillsOutputDir' in adapter).toBe(true)
    }
  })

  it('claude-code, agent-plugins-1.0, and copilot share the source directory', () => {
    const shared = adapters.filter(
      (a) => a.name === 'claude-code' || a.name === 'agent-plugins-1.0' || a.name === 'copilot',
    )
    for (const adapter of shared) {
      expect(adapter.skillsOutputDir).toBeUndefined()
    }
  })

  it('cursor, codex, kimi, opencode, and pi each have a distinct output dir', () => {
    const withDir = adapters.filter((a) => a.skillsOutputDir !== undefined)
    expect(withDir.length).toBe(5)
    const dirs = withDir.map((a) => a.skillsOutputDir)
    expect(new Set(dirs).size).toBe(5)
  })
})
