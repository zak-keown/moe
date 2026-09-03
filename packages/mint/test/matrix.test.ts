import { describe, it, expect } from 'vitest'
import { renderMatrix } from '../src/matrix.js'

describe('renderMatrix', () => {
  it('renders one row per adapter with all component columns', () => {
    const out = renderMatrix()
    expect(out).toContain('| Harness |')
    expect(out).toContain('| skills |')
    expect(out).toContain('| skill delivery |')
    // header + separator + at least the claude-code row
    expect(out).toMatch(/\| claude-code \| rendered \|( full \|){6}( none \|){2}/)
  })

  it('treats a missing achieved-delivery entry as unsupported instead of using a static claim', () => {
    const out = renderMatrix({ 'claude-code': 'rendered' })

    expect(out).toContain('| cursor | unsupported | none |')
  })
})
