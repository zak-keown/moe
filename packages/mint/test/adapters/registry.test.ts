import { describe, it, expect } from 'vitest'
import { adapters } from '../../src/adapters/index.js'
import { ADAPTER_NAMES } from '../../src/config.js'

describe('adapter-name registry', () => {
  it('the dependency-free registry reports drift in either direction', async () => {
    // @ts-expect-error The dependency-free bin registry intentionally ships no TypeScript declarations.
    const registry = await import('../../../../bin/lib/plugin-registry.mjs') as {
      harnessRegistryProblems?: (label: string, names: string[]) => string[]
    }
    expect(registry.harnessRegistryProblems).toBeTypeOf('function')
    if (!registry.harnessRegistryProblems) return

    const problems = registry.harnessRegistryProblems('fixture', ['claude-code', 'future-host'])
    expect(problems).toHaveLength(2)
    expect(problems[0]).toMatch(/^fixture is missing canonical harnesses:/)
    expect(problems[1]).toBe('fixture contains harnesses absent from the canonical registry: future-host')
  })

  it('the canonical registry matches both Mint harness registries bidirectionally', async () => {
    // @ts-expect-error The dependency-free bin registry intentionally ships no TypeScript declarations.
    const registry = await import('../../../../bin/lib/plugin-registry.mjs') as {
      harnessRegistryProblems?: (label: string, names: string[]) => string[]
    }
    expect(registry.harnessRegistryProblems).toBeTypeOf('function')
    if (!registry.harnessRegistryProblems) return

    expect(registry.harnessRegistryProblems('Mint live adapters', adapters.map((a) => a.name))).toEqual([])
    expect(registry.harnessRegistryProblems('Mint ADAPTER_NAMES', [...ADAPTER_NAMES])).toEqual([])
  })
})
