import { describe, it, expect } from 'vitest'
import { renderMatrix, renderSupportMatrix } from '../src/matrix.js'

describe('renderMatrix', () => {
  it('renders one row per adapter without making static support claims', () => {
    const out = renderMatrix()
    expect(out).toContain('| Harness | Emitted capabilities |')
    // header + separator + at least the claude-code row
    expect(out).toContain('| claude-code | generate a plugin to inspect |')
  })

  it('labels absent entries as intentionally omitted when a generation record is supplied', () => {
    const out = renderMatrix({
      'claude-code': { files: [], limitations: [], emittedCapabilities: ['skill-discovery'] },
    })
    expect(out).toContain('| claude-code | skill-discovery |')
    expect(out).toContain('| codex | omitted |')
  })
})

describe('renderSupportMatrix', () => {
  it('renders one row per adapter with component support levels', () => {
    const out = renderSupportMatrix()
    expect(out).toMatch(/\| claude-code \|( full \|){6}( none \|){2}/)
  })
})
