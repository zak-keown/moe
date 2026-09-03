import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { NpmRegistryPort } from '../src/release/npm-registry.js'

export function createFakeNpmRegistry(): NpmRegistryPort & {
  packages: Map<string, Map<string, { integrity: string; distTags: string[] }>>
  publishLog: string[]
  distTagLog: string[]
} {
  const packages = new Map<string, Map<string, { integrity: string; distTags: string[] }>>()
  const publishLog: string[] = []
  const distTagLog: string[] = []

  return {
    packages,
    publishLog,
    distTagLog,

    async preflight(_packageName: string): Promise<void> {},

    async inspectVersion(packageName: string, version: string) {
      const pkg = packages.get(packageName)
      if (pkg === undefined) return { state: 'absent' as const }
      const entry = pkg.get(version)
      if (entry === undefined) return { state: 'absent' as const }
      return { state: 'present' as const, integrity: entry.integrity, distTags: entry.distTags }
    },

    async publishTarball(path: string, tag: 'next'): Promise<void> {
      publishLog.push(path)
    },

    async setDistTag(packageName: string, version: string, tag: 'latest'): Promise<void> {
      distTagLog.push(`${packageName}@${version} -> ${tag}`)
      const pkg = packages.get(packageName)
      if (pkg) {
        for (const entry of pkg.values()) {
          entry.distTags = entry.distTags.filter((t) => t !== tag)
        }
        const entry = pkg.get(version)
        if (entry) entry.distTags.push(tag)
      }
    },

    async inspectDistTags(packageName: string) {
      const pkg = packages.get(packageName)
      if (pkg === undefined) return {}
      const tags: Record<string, string> = {}
      for (const [version, entry] of pkg) {
        for (const tag of entry.distTags) {
          tags[tag] = version
        }
      }
      return tags
    },
  }
}

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
