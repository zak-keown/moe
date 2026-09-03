import { execFile as execFileCallback } from 'node:child_process'
import { promises as fs } from 'node:fs'
import { chmod, cp, link, mkdir, mkdtemp, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  computeTreeDigest,
  scanArtifact,
  serializeTreeRow,
  type ArtifactEntry,
  type ArtifactManifestV1,
} from '../src/artifact/artifact-manifest.js'

const execFile = promisify(execFileCallback)
const fixtureRoot = fileURLToPath(new URL('./fixtures/artifact-manifest/basic', import.meta.url))
const workspaces: string[] = []

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map((workspace) => rm(workspace, { recursive: true, force: true })))
})

async function workspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'moe-artifact-manifest-'))
  workspaces.push(root)
  return root
}

async function fixture(): Promise<string> {
  const root = await workspace()
  await cp(fixtureRoot, root, { recursive: true })
  await chmod(join(root, 'text.txt'), 0o644)
  await chmod(join(root, 'run.sh'), 0o755)
  return root
}

const zeroHash = '0'.repeat(64)

describe('artifact tree manifest', () => {
  it('scans raw text and binary bytes with exact hashes, normalized modes, sorting, and self-exclusion', async () => {
    const root = await fixture()
    await writeFile(join(root, 'opaque.bin'), Uint8Array.from([0, 255, 1, 128, 10]))
    await chmod(join(root, 'opaque.bin'), 0o644)
    await mkdir(join(root, '.moe'))
    await writeFile(join(root, '.moe', 'artifact.json'), '{"ignored":true}\n')
    await writeFile(join(root, '.moe', 'artifact.json.bak'), 'included\n')
    await chmod(join(root, '.moe', 'artifact.json'), 0o644)
    await chmod(join(root, '.moe', 'artifact.json.bak'), 0o644)
    await writeFile(join(root, '\u{e000}'), 'bmp')
    await writeFile(join(root, '\u{1f600}'), 'non-bmp')
    await writeFile(join(root, 'z'), 'ascii')
    await writeFile(join(root, 'ä'), 'latin')
    await chmod(join(root, '\u{e000}'), 0o644)
    await chmod(join(root, '\u{1f600}'), 0o644)
    await chmod(join(root, 'z'), 0o644)
    await chmod(join(root, 'ä'), 0o644)

    const entries = await scanArtifact(root)

    expect(entries.map((entry) => entry.path)).toEqual([
      '.moe/artifact.json.bak',
      'opaque.bin',
      'run.sh',
      'text.txt',
      'z',
      'ä',
      '\u{e000}',
      '\u{1f600}',
    ])
    expect(entries).toContainEqual({
      path: 'opaque.bin',
      size: 5,
      sha256: '6d1dc71fb8c1d9f7786ddddd833d3f60835dd60e3b86b652e4458f780c6532f6',
      mode: '0644',
    })
    expect(entries.find((entry) => entry.path === 'text.txt')).toMatchObject({
      size: 8,
      sha256: 'db076a0e89361301d7ee57bd51c77181288d2c0c3c0bf21387d4a13861c4dcff',
      mode: '0644',
    })
    expect(entries.find((entry) => entry.path === 'run.sh')).toMatchObject({ mode: '0755' })
    expect(entries.every((entry) => /^[0-9a-f]{64}$/.test(entry.sha256))).toBe(true)
  })

  it('serializes exact canonical row bytes and matches hand-verifiable digest vectors', () => {
    const entry: ArtifactEntry = { path: 'a.txt', mode: '0644', size: 0, sha256: zeroHash }

    expect([...serializeTreeRow(entry)]).toEqual([
      ...Buffer.from('a.txt'), 0,
      ...Buffer.from('0644'), 0,
      ...Buffer.from('0'), 0,
      ...Buffer.from(zeroHash), 10,
    ])
    expect(computeTreeDigest([entry])).toBe('2f6175aab95e1b7db5023fc82f697cbc3f2e198769b8dc197f9f2c3204e4c748')
    expect(computeTreeDigest([
      { path: 'z', mode: '0644', size: 0, sha256: zeroHash },
      entry,
    ])).toBe(computeTreeDigest([
      entry,
      { path: 'z', mode: '0644', size: 0, sha256: zeroHash },
    ]))
    expect(computeTreeDigest([])).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  })

  it('makes path, content hash, size, and mode independent inputs to the tree digest', () => {
    const baseline: ArtifactEntry = { path: 'a', mode: '0644', size: 1, sha256: zeroHash }
    const digest = computeTreeDigest([baseline])
    const mutations: ArtifactEntry[] = [
      { ...baseline, path: 'b' },
      { ...baseline, sha256: `1${zeroHash.slice(1)}` },
      { ...baseline, size: 2 },
      { ...baseline, mode: '0755' },
    ]

    expect(mutations.map((entry) => computeTreeDigest([entry]))).not.toContain(digest)
    expect(new Set(mutations.map((entry) => computeTreeDigest([entry]))).size).toBe(mutations.length)
  })

  it.each([
    ['/absolute', 'path must be relative'],
    ['../escape', 'parent segments'],
    ['dir/../escape', 'parent segments'],
  ])('rejects invalid logical path %s before digesting', (path, message) => {
    expect(() => computeTreeDigest([{ path, mode: '0644', size: 0, sha256: zeroHash }]))
      .toThrow(message)
  })

  it.each([
    ['the NUL row delimiter', 'safe\0forged', /NUL row delimiter/],
    ['a lone UTF-16 surrogate', 'safe\ud800forged', /unpaired UTF-16 surrogate/],
  ])('rejects a path containing %s at both canonical row boundaries', (_name, path, message) => {
    const entry: ArtifactEntry = { path, mode: '0644', size: 0, sha256: zeroHash }
    expect(() => serializeTreeRow(entry)).toThrow(message)
    expect(() => computeTreeDigest([entry])).toThrow(message)
  })

  it('exports the task-1 manifest shape with partial target coverage', () => {
    const manifest: ArtifactManifestV1 = {
      schema: 1,
      plugin: { id: 'fixture', package: '@bubstack/fixture', version: '1.0.0' },
      files: [],
      tree_sha256: computeTreeDigest([]),
      targets: { codex: { emitted_capabilities: ['skill-discovery'] } },
    }
    expect(manifest.targets.codex?.emitted_capabilities).toEqual(['skill-discovery'])
    expect(manifest.targets['claude-code']).toBeUndefined()
  })

  it('rejects symlinks and detectable hard links without following them', async () => {
    const root = await fixture()
    await symlink(join(root, 'text.txt'), join(root, 'linked.txt'))
    await expect(scanArtifact(root)).rejects.toMatchObject({ diagnostic: { code: 'ARTIFACT_UNSAFE_FILE_TYPE' } })

    await rm(join(root, 'linked.txt'))
    await link(join(root, 'text.txt'), join(root, 'alias.txt'))
    await expect(scanArtifact(root)).rejects.toMatchObject({ diagnostic: { code: 'ARTIFACT_HARD_LINK' } })
  })

  it('rejects a symlinked artifact root', async () => {
    const root = await fixture()
    const linkedRoot = `${root}-link`
    workspaces.push(linkedRoot)
    await symlink(root, linkedRoot)

    await expect(scanArtifact(linkedRoot)).rejects.toMatchObject({ diagnostic: { code: 'ARTIFACT_UNSAFE_FILE_TYPE' } })
  })

  it.runIf(process.platform !== 'win32')('rejects a device artifact root where supported', async () => {
    await expect(scanArtifact('/dev/null')).rejects.toMatchObject({ diagnostic: { code: 'ARTIFACT_UNSAFE_FILE_TYPE' } })
  })

  it('rejects a file whose identity changes between inspection and no-follow open', async () => {
    const root = await fixture()
    const target = join(root, 'text.txt')
    let replaced = false
    const realOpen = fs.open.bind(fs)
    const open = vi.spyOn(fs, 'open').mockImplementation(async (path, flags, mode) => {
      if (path === target && !replaced) {
        replaced = true
        await rename(target, join(root, 'original.txt'))
        await writeFile(target, 'replacement\n', { mode: 0o644 })
      }
      return realOpen(path, flags, mode)
    })

    try {
      await expect(scanArtifact(root)).rejects.toMatchObject({ diagnostic: { code: 'ARTIFACT_FILE_CHANGED', path: 'text.txt' } })
    } finally {
      open.mockRestore()
    }
  })

  it('rejects modes outside 0644 and 0755 instead of normalizing during the scan', async () => {
    const root = await fixture()
    await chmod(join(root, 'text.txt'), 0o600)

    await expect(scanArtifact(root)).rejects.toMatchObject({ diagnostic: { code: 'ARTIFACT_MODE_INVALID' } })
  })

  it.runIf(process.platform === 'linux')('rejects full-Unicode case-fold collisions found during a scan', async () => {
    const root = await workspace()
    await writeFile(join(root, 'Straße'), 'one', { mode: 0o644 })
    await writeFile(join(root, 'STRASSE'), 'two', { mode: 0o644 })
    await expect(scanArtifact(root)).rejects.toMatchObject({ diagnostic: { code: 'ARTIFACT_PATH_COLLISION' } })
  })

  it('rejects full-Unicode case-fold and NFC collisions in logical manifest entries', () => {
    expect(() => computeTreeDigest([
      { path: 'Straße', size: 0, sha256: zeroHash, mode: '0644' },
      { path: 'STRASSE', size: 0, sha256: zeroHash, mode: '0644' },
    ])).toThrow(/Unicode case folding/)
    expect(() => computeTreeDigest([
      { path: 'café', size: 0, sha256: zeroHash, mode: '0644' },
      { path: 'cafe\u0301', size: 0, sha256: zeroHash, mode: '0644' },
    ])).toThrow(/collide after NFC normalization/)
  })

  it.runIf(process.platform !== 'win32')('rejects a FIFO and socket where supported', async () => {
    const fifoRoot = await fixture()
    await execFile('mkfifo', [join(fifoRoot, 'pipe')])
    await expect(scanArtifact(fifoRoot)).rejects.toMatchObject({ diagnostic: { code: 'ARTIFACT_UNSAFE_FILE_TYPE' } })

    const socketRoot = await fixture()
    const socketPath = join(socketRoot, 'service.sock')
    const server = createServer()
    try {
      await new Promise<void>((resolve, reject) => server.once('error', reject).listen(socketPath, resolve))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EPERM') return
      throw error
    }
    try {
      await expect(scanArtifact(socketRoot)).rejects.toMatchObject({ diagnostic: { code: 'ARTIFACT_UNSAFE_FILE_TYPE' } })
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    }
  })
})
