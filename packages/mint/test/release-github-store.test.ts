import { describe, it, expect } from 'vitest'
import type { ReleaseStorePort, ReleaseRef, ReleaseAsset, DraftReleaseInput, StableReleaseInput } from '../src/release/github-release.js'

export function createFakeReleaseStore(): ReleaseStorePort & {
  releases: Map<string, ReleaseRef & { assets: Map<string, { bytes: number; content: Buffer }> }>
  nextId: number
  downloadLog: string[]
  uploadLog: string[]
} {
  const store = {
    releases: new Map<string, ReleaseRef & { assets: Map<string, { bytes: number; content: Buffer }> }>(),
    nextId: 1,
    downloadLog: [] as string[],
    uploadLog: [] as string[],

    async findByTag(tag: string): Promise<ReleaseRef | undefined> {
      return store.releases.get(tag)
    },

    async createDraft(input: DraftReleaseInput): Promise<ReleaseRef> {
      const ref: ReleaseRef & { assets: Map<string, { bytes: number; content: Buffer }> } = {
        id: store.nextId++,
        tag: input.tag,
        draft: true,
        prerelease: true,
        assets: new Map(),
      }
      store.releases.set(input.tag, ref)
      return ref
    },

    async listAssets(release: ReleaseRef): Promise<readonly ReleaseAsset[]> {
      const stored = store.releases.get(release.tag)
      if (stored === undefined) return []
      return [...stored.assets.entries()].map(([name, data]) => ({
        name,
        bytes: data.bytes,
        apiUrl: `https://api.example.com/assets/${name}`,
      }))
    },

    async uploadExact(release: ReleaseRef, file: string, sha256: string): Promise<void> {
      const { readFile } = await import('node:fs/promises')
      const { basename } = await import('node:path')
      const content = await readFile(file)
      const stored = store.releases.get(release.tag)
      if (stored === undefined) throw new Error(`no release for tag ${release.tag}`)
      stored.assets.set(basename(file), { bytes: content.length, content })
      store.uploadLog.push(basename(file))
    },

    async download(release: ReleaseRef, asset: string, destination: string): Promise<void> {
      const stored = store.releases.get(release.tag)
      const data = stored?.assets.get(asset)
      if (data === undefined) throw new Error(`asset ${asset} not found`)
      const { writeFile } = await import('node:fs/promises')
      const { join } = await import('node:path')
      await writeFile(join(destination, asset), data.content)
      store.downloadLog.push(asset)
    },

    async finalize(release: ReleaseRef, channel: 'prerelease' | 'stable'): Promise<void> {
      const stored = store.releases.get(release.tag)
      if (stored) {
        stored.draft = false
        stored.prerelease = channel === 'prerelease'
      }
    },

    async createStable(input: StableReleaseInput): Promise<ReleaseRef> {
      const ref: ReleaseRef & { assets: Map<string, { bytes: number; content: Buffer }> } = {
        id: store.nextId++,
        tag: input.tag,
        draft: true,
        prerelease: false,
        assets: new Map(),
      }
      store.releases.set(input.tag, ref)
      return ref
    },
  }
  return store
}

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
