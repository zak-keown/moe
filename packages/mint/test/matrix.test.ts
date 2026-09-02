import { describe, it, expect } from 'vitest'
import { renderMatrix } from '../src/matrix.js'

describe('renderMatrix', () => {
  it('renders one row per adapter without making static support claims', () => {
    const out = renderMatrix()
    expect(out).toContain('| Harness | Emitted capabilities |')
    // header + separator + at least the claude-code row
    expect(out).toContain('| claude-code | generate a plugin to inspect |')
  })
})
