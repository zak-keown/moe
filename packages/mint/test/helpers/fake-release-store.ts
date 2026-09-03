import type { ReleaseStorePort, ReleaseRef, ReleaseAsset, DraftReleaseInput, StableReleaseInput } from '../../src/release/github-release.js'

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

    async uploadExact(release: ReleaseRef, file: string, _sha256: string): Promise<void> {
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
