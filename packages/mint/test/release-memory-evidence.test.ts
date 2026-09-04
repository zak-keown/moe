import { describe, it, expect } from 'vitest'
import {
  validateMemoryReleaseEvidence,
  memoryReleaseBlocking,
  type MemoryReleaseEvidence,
} from '../src/release/memory-evidence.js'
import type { PluginCatalogRecordV1 } from '../src/release/catalog.js'

const CANDIDATE_INTEGRITY = 'sha512-AAAA' as `sha512-${string}`
const CANDIDATE_TREE_SHA = 'a'.repeat(64)
const CANDIDATE_MANIFEST_SHA = 'b'.repeat(64)

function fakeCandidate(overrides?: Partial<PluginCatalogRecordV1>): PluginCatalogRecordV1 {
  return {
    plugin: 'moe-memory',
    package: '@bubstack/moe-memory',
    version: '0.2.0',
    artifact: {
      artifact_tree_sha256: CANDIDATE_TREE_SHA,
      artifact_manifest_sha256: CANDIDATE_MANIFEST_SHA,
      tarball: { integrity: CANDIDATE_INTEGRITY, bytes: 1024 },
      mirror: { asset: 'moe-memory.tgz', sha256: 'c'.repeat(64) },
      legal: {
        files: { LICENSE: 'd'.repeat(64), NOTICE: 'e'.repeat(64) },
        bundle_inventory_sha256: 'f'.repeat(64),
      },
      emitted_capabilities: {},
    },
    certification: [],
    ...overrides,
  }
}

function fakeEvidence(overrides?: Partial<MemoryReleaseEvidence>): MemoryReleaseEvidence {
  return {
    schema: 1,
    memory_version: '0.2.0',
    artifact_integrity: CANDIDATE_INTEGRITY,
    artifact_tree_sha256: CANDIDATE_TREE_SHA,
    runtime_matrix: {
      node_lanes: ['22.13.0', '22.23.2', '24.20.0'],
      native_targets: ['darwin-arm64', 'darwin-x64', 'linux-arm64', 'linux-x64'],
      database_only_targets: ['win32-x64'],
    },
    recovery_capsules: [
      { target: 'darwin-arm64', version: '0.1.5', sha256: '1'.repeat(64) },
      { target: 'darwin-x64', version: '0.1.5', sha256: '2'.repeat(64) },
      { target: 'linux-arm64', version: '0.1.5', sha256: '3'.repeat(64) },
      { target: 'linux-x64', version: '0.1.5', sha256: '4'.repeat(64) },
    ],
    ...overrides,
  }
}

describe('validateMemoryReleaseEvidence', () => {
  it('binds every recovery capsule to the candidate memory artifact', () => {
    const candidateRecord = fakeCandidate()
    const evidence = fakeEvidence()
    const record = validateMemoryReleaseEvidence(candidateRecord, evidence)
    expect(record.memory_version).toBe('0.2.0')
    expect(record.recovery_capsules.map((item) => item.target).sort()).toEqual(
      ['darwin-arm64', 'darwin-x64', 'linux-arm64', 'linux-x64'],
    )
    expect(record.artifact_integrity).toBe(candidateRecord.artifact.tarball.integrity)
  })

  it('accepts valid evidence with extra database-only targets', () => {
    const evidence = fakeEvidence({
      runtime_matrix: {
        node_lanes: ['22.13.0', '22.23.2', '24.20.0'],
        native_targets: ['darwin-arm64', 'darwin-x64', 'linux-arm64', 'linux-x64'],
        database_only_targets: ['win32-x64', 'win32-arm64'],
      },
    })
    expect(() => validateMemoryReleaseEvidence(fakeCandidate(), evidence)).not.toThrow()
  })

  it('rejects wrong memory version', () => {
    const evidence = fakeEvidence({ memory_version: '0.1.5' })
    expect(() => validateMemoryReleaseEvidence(fakeCandidate(), evidence))
      .toThrow(/version/)
  })

  it('rejects wrong artifact integrity', () => {
    const evidence = fakeEvidence({ artifact_integrity: 'sha512-BBBB' })
    expect(() => validateMemoryReleaseEvidence(fakeCandidate(), evidence))
      .toThrow(/integrity/)
  })

  it('rejects wrong artifact tree SHA-256', () => {
    const candidate = fakeCandidate()
    const evidence = fakeEvidence({ artifact_tree_sha256: 'f'.repeat(64) })
    expect(() => validateMemoryReleaseEvidence(candidate, evidence))
      .toThrow(/tree SHA-256/)
  })

  it('rejects missing native target', () => {
    const evidence = fakeEvidence({
      runtime_matrix: {
        node_lanes: ['22.13.0', '22.23.2', '24.20.0'],
        native_targets: ['darwin-arm64', 'darwin-x64', 'linux-arm64', 'linux-amd64'],
        database_only_targets: ['win32-x64'],
      },
    })
    expect(() => validateMemoryReleaseEvidence(fakeCandidate(), evidence))
      .toThrow(/native target/)
  })

  it('rejects insufficient Node lanes', () => {
    const evidence = fakeEvidence({
      runtime_matrix: {
        node_lanes: ['22.13.0', '24.20.0'],
        native_targets: ['darwin-arm64', 'darwin-x64', 'linux-arm64', 'linux-x64'],
        database_only_targets: ['win32-x64'],
      },
    })
    expect(() => validateMemoryReleaseEvidence(fakeCandidate(), evidence))
      .toThrow()
  })

  it('rejects duplicate recovery capsule target', () => {
    const evidence = fakeEvidence({
      recovery_capsules: [
        { target: 'darwin-arm64', version: '0.1.5', sha256: '1'.repeat(64) },
        { target: 'darwin-arm64', version: '0.1.5', sha256: '2'.repeat(64) },
        { target: 'darwin-x64', version: '0.1.5', sha256: '3'.repeat(64) },
        { target: 'linux-arm64', version: '0.1.5', sha256: '4'.repeat(64) },
        { target: 'linux-x64', version: '0.1.5', sha256: '5'.repeat(64) },
      ],
    })
    expect(() => validateMemoryReleaseEvidence(fakeCandidate(), evidence))
      .toThrow(/duplicate/)
  })

  it('rejects missing recovery capsule for required target', () => {
    const evidence = fakeEvidence({
      recovery_capsules: [
        { target: 'darwin-arm64', version: '0.1.5', sha256: '1'.repeat(64) },
        { target: 'darwin-x64', version: '0.1.5', sha256: '2'.repeat(64) },
        { target: 'linux-arm64', version: '0.1.5', sha256: '3'.repeat(64) },
        { target: 'win32-x64', version: '0.1.5', sha256: '4'.repeat(64) },
      ],
    })
    expect(() => validateMemoryReleaseEvidence(fakeCandidate(), evidence))
      .toThrow(/capsule/)
  })

  it('rejects invalid schema shape', () => {
    expect(() => validateMemoryReleaseEvidence(fakeCandidate(), {}))
      .toThrow()
    expect(() => validateMemoryReleaseEvidence(fakeCandidate(), { schema: 2 }))
      .toThrow()
  })

  it('rejects unknown keys', () => {
    const evidence = { ...fakeEvidence(), extra_field: true }
    expect(() => validateMemoryReleaseEvidence(fakeCandidate(), evidence))
      .toThrow()
  })
})

describe('memoryReleaseBlocking', () => {
  it('returns empty when memory evidence is complete', () => {
    const candidate = fakeCandidate()
    const evidence = fakeEvidence()
    const diagnostics = memoryReleaseBlocking([candidate], evidence)
    expect(diagnostics).toEqual([])
  })

  it('returns empty when no moe-memory plugin in catalog', () => {
    const other = { ...fakeCandidate(), plugin: 'moe-core' }
    expect(memoryReleaseBlocking([other], undefined)).toEqual([])
  })

  it('blocks when evidence is missing', () => {
    const diagnostics = memoryReleaseBlocking([fakeCandidate()], undefined)
    expect(diagnostics).toContainEqual(
      expect.objectContaining({ code: 'MEMORY_EVIDENCE_MISSING' }),
    )
  })

  it('blocks on version mismatch', () => {
    const evidence = fakeEvidence({ memory_version: '0.1.5' })
    const diagnostics = memoryReleaseBlocking([fakeCandidate()], evidence)
    expect(diagnostics).toContainEqual(
      expect.objectContaining({ code: 'MEMORY_EVIDENCE_VERSION_MISMATCH' }),
    )
  })

  it('blocks on integrity mismatch', () => {
    const evidence = fakeEvidence({ artifact_integrity: 'sha512-ZZZZ' })
    const diagnostics = memoryReleaseBlocking([fakeCandidate()], evidence)
    expect(diagnostics).toContainEqual(
      expect.objectContaining({ code: 'MEMORY_EVIDENCE_INTEGRITY_MISMATCH' }),
    )
  })

  it('blocks on missing capsule target', () => {
    const evidence = fakeEvidence({
      recovery_capsules: [
        { target: 'darwin-arm64', version: '0.1.5', sha256: '1'.repeat(64) },
        { target: 'darwin-x64', version: '0.1.5', sha256: '2'.repeat(64) },
        { target: 'linux-arm64', version: '0.1.5', sha256: '3'.repeat(64) },
      ],
    })
    const diagnostics = memoryReleaseBlocking([fakeCandidate()], evidence)
    expect(diagnostics).toContainEqual(
      expect.objectContaining({ code: 'MEMORY_EVIDENCE_CAPSULE_MISSING' }),
    )
  })
})
