import { describe, it, expect } from 'vitest'
import { renderMatrix } from '../src/matrix.js'

describe('renderMatrix', () => {
  it('renders one row per adapter without making static support claims', () => {
    const out = renderMatrix()
    expect(out).toContain('| Harness | Skill delivery | Emitted capabilities |')
    // header + separator + at least the claude-code row
    expect(out).toContain('| claude-code | generate a plugin to inspect | generate a plugin to inspect |')
  })

  it('labels absent entries as intentionally omitted when a generation record is supplied', () => {
    const out = renderMatrix({
      'claude-code': { files: [], limitations: [], emittedCapabilities: ['skill-discovery'] },
    }, { 'claude-code': 'rendered' })
    expect(out).toContain('| claude-code | rendered | skill-discovery |')
    expect(out).toContain('| codex | unsupported | omitted |')
  })
})
