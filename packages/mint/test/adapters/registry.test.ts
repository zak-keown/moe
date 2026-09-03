import { describe, it, expect } from 'vitest'
import { adapters } from '../../src/adapters/index.js'
import { TARGET_IDS } from '../../src/vocabulary.js'

describe('adapter-name registry', () => {
  it('canonical target IDs match the live adapters array exactly', () => {
    expect([...TARGET_IDS]).toEqual(adapters.map((a) => a.name))
    for (const adapter of adapters) {
      expect(adapter.emit).toBeTypeOf('function')
      expect(adapter).toHaveProperty('support')
      expect(adapter.support).toBeTypeOf('object')
    }
  })
})
