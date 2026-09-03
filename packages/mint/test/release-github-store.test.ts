import { describe, it, expect } from 'vitest'
import { createFakeReleaseStore } from './helpers/fake-release-store.js'

describe('FakeReleaseStore', () => {
  it('creates and finds a draft', async () => {
    const store = createFakeReleaseStore()
    const ref = await store.createDraft({ tag: 'v0.1.5-rc.1', sourceSha: '0'.repeat(40), title: 'Test' })
    expect(ref.draft).toBe(true)
    const found = await store.findByTag('v0.1.5-rc.1')
    expect(found?.id).toBe(ref.id)
  })

  it('returns undefined for unknown tags', async () => {
    const store = createFakeReleaseStore()
    expect(await store.findByTag('v99.0.0')).toBeUndefined()
  })

  it('tracks uploaded assets', async () => {
    const store = createFakeReleaseStore()
    const ref = await store.createDraft({ tag: 'v1.0.0', sourceSha: '0'.repeat(40), title: 'Test' })
    const { mkdtemp, writeFile, rm } = await import('node:fs/promises')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const dir = await mkdtemp(join(tmpdir(), 'gh-test-'))
    try {
      await writeFile(join(dir, 'test.tgz'), 'fake tarball')
      await store.uploadExact(ref, join(dir, 'test.tgz'), 'ignored')
      const assets = await store.listAssets(ref)
      expect(assets).toHaveLength(1)
      expect(assets[0]!.name).toBe('test.tgz')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('finalizes as prerelease', async () => {
    const store = createFakeReleaseStore()
    const ref = await store.createDraft({ tag: 'v1.0.0-rc.1', sourceSha: '0'.repeat(40), title: 'Test' })
    await store.finalize(ref, 'prerelease')
    const found = store.releases.get('v1.0.0-rc.1')
    expect(found?.draft).toBe(false)
    expect(found?.prerelease).toBe(true)
  })
})
