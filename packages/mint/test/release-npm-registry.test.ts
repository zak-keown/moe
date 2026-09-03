import { describe, it, expect } from 'vitest'
import { createFakeNpmRegistry } from './helpers/fake-npm-registry.js'

describe('FakeNpmRegistry', () => {
  it('returns absent for unknown packages', async () => {
    const registry = createFakeNpmRegistry()
    const result = await registry.inspectVersion('@test/foo', '1.0.0')
    expect(result.state).toBe('absent')
  })

  it('returns present for known versions', async () => {
    const registry = createFakeNpmRegistry()
    registry.packages.set('@test/foo', new Map([
      ['1.0.0', { integrity: 'sha512-xxx', distTags: ['latest'] }],
    ]))
    const result = await registry.inspectVersion('@test/foo', '1.0.0')
    expect(result).toEqual({ state: 'present', integrity: 'sha512-xxx', distTags: ['latest'] })
  })

  it('tracks publish calls', async () => {
    const registry = createFakeNpmRegistry()
    await registry.publishTarball('/path/to/foo.tgz', 'next')
    expect(registry.publishLog).toEqual(['/path/to/foo.tgz'])
  })

  it('tracks dist-tag mutations', async () => {
    const registry = createFakeNpmRegistry()
    registry.packages.set('@test/foo', new Map([
      ['1.0.0', { integrity: 'sha512-xxx', distTags: ['next'] }],
    ]))
    await registry.setDistTag('@test/foo', '1.0.0', 'latest')
    expect(registry.distTagLog).toEqual(['@test/foo@1.0.0 -> latest'])
    const tags = await registry.inspectDistTags('@test/foo')
    expect(tags.latest).toBe('1.0.0')
  })
})

describe('process-spawn tripwire', () => {
  it('throws if argv starts with npm publish', () => {
    const tripwire = (args: readonly string[]) => {
      if (args[0] === 'npm' && (args[1] === 'publish' || args[1] === 'dist-tag')) {
        throw new Error(`TRIPWIRE: test attempted to spawn "${args.join(' ')}"`)
      }
    }
    expect(() => tripwire(['npm', 'publish', 'foo.tgz'])).toThrow(/TRIPWIRE/)
    expect(() => tripwire(['npm', 'dist-tag', 'add'])).toThrow(/TRIPWIRE/)
    expect(() => tripwire(['npm', 'view'])).not.toThrow()
  })
})
