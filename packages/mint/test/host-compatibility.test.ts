import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const MINT_ROOT = resolve(import.meta.dirname, '..')
const MEMORY_ROOT = resolve(import.meta.dirname, '../../memory')

interface CompatibilityCandidate {
  version: string
  integrity: string
  role: 'minimum' | 'current'
  customPaths: boolean
}

interface CompatibilityManifest {
  schema: number
  description: string
  candidates: CompatibilityCandidate[]
}

function loadCompatibilityManifest(path: string): CompatibilityManifest {
  const content = readFileSync(path, 'utf8')
  return JSON.parse(content) as CompatibilityManifest
}

describe('host-compatibility manifests', () => {
  it('copilot compatibility manifest is well-formed', () => {
    const manifestPath = resolve(MINT_ROOT, 'runtime/copilot-compatibility.json')
    expect(existsSync(manifestPath)).toBe(true)
    const manifest = loadCompatibilityManifest(manifestPath)
    expect(manifest.schema).toBe(1)
    expect(manifest.candidates.length).toBeGreaterThanOrEqual(2)
    const roles = manifest.candidates.map(c => c.role)
    expect(roles).toContain('minimum')
    expect(roles).toContain('current')
    for (const candidate of manifest.candidates) {
      expect(candidate.version).toMatch(/^\d+\.\d+\.\d+/)
      expect(typeof candidate.integrity).toBe('string')
      expect(typeof candidate.customPaths).toBe('boolean')
    }
  })

  it('codex compatibility manifest is well-formed', () => {
    const manifestPath = resolve(MEMORY_ROOT, 'runtime/codex-compatibility.json')
    expect(existsSync(manifestPath)).toBe(true)
    const manifest = loadCompatibilityManifest(manifestPath)
    expect(manifest.schema).toBe(1)
    expect(manifest.candidates.length).toBeGreaterThanOrEqual(2)
    const roles = manifest.candidates.map(c => c.role)
    expect(roles).toContain('minimum')
    expect(roles).toContain('current')
  })

  it('all pinned candidates claim custom path support', () => {
    const copilot = loadCompatibilityManifest(resolve(MINT_ROOT, 'runtime/copilot-compatibility.json'))
    const codex = loadCompatibilityManifest(resolve(MEMORY_ROOT, 'runtime/codex-compatibility.json'))
    for (const candidate of [...copilot.candidates, ...codex.candidates]) {
      expect(candidate.customPaths).toBe(true)
    }
  })

  it('minimum version is less than or equal to current', () => {
    const copilot = loadCompatibilityManifest(resolve(MINT_ROOT, 'runtime/copilot-compatibility.json'))
    const codex = loadCompatibilityManifest(resolve(MEMORY_ROOT, 'runtime/codex-compatibility.json'))
    for (const manifest of [copilot, codex]) {
      const minimum = manifest.candidates.find(c => c.role === 'minimum')!
      const current = manifest.candidates.find(c => c.role === 'current')!
      const minParts = minimum.version.split('.').map(Number)
      const curParts = current.version.split('.').map(Number)
      const cmp = minParts[0]! < curParts[0]! ? -1
        : minParts[0]! > curParts[0]! ? 1
        : minParts[1]! < curParts[1]! ? -1
        : minParts[1]! > curParts[1]! ? 1
        : minParts[2]! - curParts[2]!
      expect(cmp).toBeLessThanOrEqual(0)
    }
  })
})
