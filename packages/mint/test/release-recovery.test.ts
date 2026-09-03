import { describe, it, expect } from 'vitest'
import {
  computeResumeActions,
  hasBlockingActions,
  publishableActions,
  type RegistrySnapshot,
} from '../src/release/recovery.js'
import { sha256, type CandidateLockV1 } from '../src/release/catalog.js'

function fakeLock(plugins: { id: string; changed: boolean; tarball: string; integrity: string; sha256: string }[]): CandidateLockV1 {
  return {
    schema: 1,
    platform_version: '0.1.5-rc.1',
    source_sha: '0'.repeat(40),
    publish_matrix: [],
    preflight: { schema: 1, platform_version: '0.1.5-rc.1', source_sha: '0'.repeat(40), plugins: [] },
    plugins: plugins.map((p) => ({
      plugin: p.id,
      package: `@test/${p.id}`,
      version: '0.1.5',
      artifact: {
        artifact_tree_sha256: 'a'.repeat(64),
        artifact_manifest_sha256: 'b'.repeat(64),
        tarball: { integrity: p.integrity as `sha512-${string}`, bytes: 1024 },
        mirror: { asset: p.tarball, sha256: p.sha256 },
        legal: { files: {}, bundle_inventory_sha256: 'c'.repeat(64) },
        emitted_capabilities: {},
      },
      certification: [],
      changed: p.changed,
    })),
    release_assets: plugins.map((p) => ({
      name: p.tarball,
      bytes: 1024,
      sha256: p.sha256,
      kind: 'tarball' as const,
    })),
  } as unknown as CandidateLockV1
}

function snapshot(plugin: string, overrides: Partial<RegistrySnapshot> = {}): RegistrySnapshot {
  return {
    plugin,
    package: `@test/${plugin}`,
    version: '0.1.5',
    tarballIntegrity: 'sha512-xxx',
    state: 'absent',
    draftAssetPresent: true,
    draftAssetSha256: sha256(`tarball-${plugin}`),
    ...overrides,
  }
}

describe('computeResumeActions', () => {
  it('returns publish for all changed + absent plugins', () => {
    const lock = fakeLock([
      { id: 'a', changed: true, tarball: 'a.tgz', integrity: 'sha512-aaa', sha256: sha256('tarball-a') },
      { id: 'b', changed: true, tarball: 'b.tgz', integrity: 'sha512-bbb', sha256: sha256('tarball-b') },
    ])
    const snapshots = [snapshot('a'), snapshot('b')]
    const actions = computeResumeActions(lock, snapshots)
    expect(actions.every((a) => a.kind === 'publish')).toBe(true)
    expect(actions).toHaveLength(2)
  })

  it('returns accept-existing for unchanged plugins', () => {
    const lock = fakeLock([
      { id: 'a', changed: false, tarball: 'a.tgz', integrity: 'sha512-aaa', sha256: sha256('tarball-a') },
    ])
    const actions = computeResumeActions(lock, [])
    expect(actions).toEqual([{ kind: 'accept-existing', plugin: 'a' }])
  })

  it('returns accept-existing for already-published with matching integrity', () => {
    const lock = fakeLock([
      { id: 'a', changed: true, tarball: 'a.tgz', integrity: 'sha512-aaa', sha256: sha256('tarball-a') },
    ])
    const snapshots = [snapshot('a', { state: 'present', observedIntegrity: 'sha512-aaa' })]
    const actions = computeResumeActions(lock, snapshots)
    expect(actions).toEqual([{ kind: 'accept-existing', plugin: 'a' }])
  })

  it('blocks on integrity mismatch', () => {
    const lock = fakeLock([
      { id: 'a', changed: true, tarball: 'a.tgz', integrity: 'sha512-aaa', sha256: sha256('tarball-a') },
    ])
    const snapshots = [snapshot('a', { state: 'present', observedIntegrity: 'sha512-WRONG' })]
    const actions = computeResumeActions(lock, snapshots)
    expect(actions).toHaveLength(1)
    expect(actions[0]!.kind).toBe('block')
  })

  it('blocks on missing snapshot for changed plugin', () => {
    const lock = fakeLock([
      { id: 'a', changed: true, tarball: 'a.tgz', integrity: 'sha512-aaa', sha256: sha256('tarball-a') },
    ])
    const actions = computeResumeActions(lock, [])
    expect(actions[0]!.kind).toBe('block')
  })

  it('blocks on missing draft asset', () => {
    const lock = fakeLock([
      { id: 'a', changed: true, tarball: 'a.tgz', integrity: 'sha512-aaa', sha256: sha256('tarball-a') },
    ])
    const snapshots = [snapshot('a', { draftAssetPresent: false })]
    const actions = computeResumeActions(lock, snapshots)
    expect(actions[0]!.kind).toBe('block')
  })

  it('blocks on draft asset SHA-256 mismatch', () => {
    const lock = fakeLock([
      { id: 'a', changed: true, tarball: 'a.tgz', integrity: 'sha512-aaa', sha256: sha256('tarball-a') },
    ])
    const snapshots = [snapshot('a', { draftAssetSha256: 'wrong'.repeat(13) })]
    const actions = computeResumeActions(lock, snapshots)
    expect(actions[0]!.kind).toBe('block')
  })

  it('handles partial publication (mix of published and unpublished)', () => {
    const lock = fakeLock([
      { id: 'a', changed: true, tarball: 'a.tgz', integrity: 'sha512-aaa', sha256: sha256('tarball-a') },
      { id: 'b', changed: true, tarball: 'b.tgz', integrity: 'sha512-bbb', sha256: sha256('tarball-b') },
      { id: 'c', changed: false, tarball: 'c.tgz', integrity: 'sha512-ccc', sha256: sha256('tarball-c') },
    ])
    const snapshots = [
      snapshot('a', { state: 'present', observedIntegrity: 'sha512-aaa' }),
      snapshot('b'),
    ]
    const actions = computeResumeActions(lock, snapshots)
    expect(actions[0]).toEqual({ kind: 'accept-existing', plugin: 'a' })
    expect(actions[1]).toEqual({ kind: 'publish', plugin: 'b', tarball: 'b.tgz' })
    expect(actions[2]).toEqual({ kind: 'accept-existing', plugin: 'c' })
  })
})

describe('hasBlockingActions', () => {
  it('returns false for all-publish actions', () => {
    const actions = [{ kind: 'publish' as const, plugin: 'a', tarball: 'a.tgz' }]
    expect(hasBlockingActions(actions)).toBe(false)
  })

  it('returns true for blocked actions', () => {
    const actions = [{ kind: 'block' as const, code: 'X', message: 'x' }]
    expect(hasBlockingActions(actions)).toBe(true)
  })
})

describe('publishableActions', () => {
  it('filters to publish actions', () => {
    const actions = [
      { kind: 'publish' as const, plugin: 'a', tarball: 'a.tgz' },
      { kind: 'accept-existing' as const, plugin: 'b' },
    ]
    const publishable = publishableActions(actions)
    expect(publishable).toHaveLength(1)
    expect(publishable[0]!.plugin).toBe('a')
  })
})
