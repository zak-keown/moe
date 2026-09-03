import { chmod, lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile, link, rename } from 'node:fs/promises'
import { execFile as execFileCallback } from 'node:child_process'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import type { ArtifactPayload } from '../src/config.js'
import { inspectPayloads, stagePayloads } from '../src/artifact/payload.js'
import { artifactCollisionKey, artifactPath } from '../src/artifact/paths.js'
import { FULL_CASE_FOLD, UNICODE_CASE_FOLD_VERSION } from '../src/artifact/unicode-casefold.js'

const workspaces: string[] = []
const execFile = promisify(execFileCallback)
const caseFoldingFixture = fileURLToPath(new URL('./fixtures/casefold/CaseFolding-16.0.0.txt', import.meta.url))

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map((workspace) => rm(workspace, { recursive: true, force: true })))
})

async function workspace(): Promise<{ source: string; artifact: string }> {
  const root = await mkdtemp(join(tmpdir(), 'moe-mint-payload-'))
  workspaces.push(root)
  const source = join(root, 'source')
  const artifact = join(root, 'artifact')
  await Promise.all([mkdir(source), mkdir(artifact)])
  return { source, artifact }
}

async function stagedTree(root: string): Promise<readonly { path: string; type: 'directory' | 'file'; bytes?: Uint8Array; mode?: number }[]> {
  const entries: { path: string; type: 'directory' | 'file'; bytes?: Uint8Array; mode?: number }[] = []
  async function walk(relative: string): Promise<void> {
    const directory = join(root, relative)
    const names = await (await import('node:fs/promises')).readdir(directory, { encoding: 'buffer' })
    names.sort(Buffer.compare)
    for (const name of names) {
      const decoded = new TextDecoder('utf-8', { fatal: true }).decode(name)
      const child = relative ? `${relative}/${decoded}` : decoded
      const stats = await lstat(join(root, child))
      if (stats.isDirectory()) {
        entries.push({ path: child, type: 'directory' })
        await walk(child)
      } else entries.push({ path: child, type: 'file', bytes: await readFile(join(root, child)), mode: stats.mode & 0o777 })
    }
  }
  await walk('')
  return entries
}

describe('declared artifact payload staging', () => {
  it('copies raw bytes deterministically and normalizes regular-file modes', async () => {
    const first = await workspace()
    const second = await workspace()
    for (const { source } of [first, second]) {
      await mkdir(join(source, 'dist', 'empty'), { recursive: true })
      await writeFile(join(source, 'dist', 'hello.txt'), 'héllö\n', 'utf8')
      await writeFile(join(source, 'dist', 'opaque.bin'), Uint8Array.from([0, 255, 1, 128, 10]))
      await writeFile(join(source, 'dist', 'runner'), '#!/bin/sh\necho hi\n')
      await writeFile(join(source, 'dist', '\u{e000}'), 'bmp')
      await writeFile(join(source, 'dist', '\ud83d\ude00'), 'non-bmp')
      await chmod(join(source, 'dist', 'hello.txt'), 0o640)
      await chmod(join(source, 'dist', 'opaque.bin'), 0o600)
      await chmod(join(source, 'dist', 'runner'), 0o711)
    }
    const payloads: ArtifactPayload[] = [
      { from: 'dist', to: 'runtime', required: true },
      { from: 'vendor', to: 'vendor', required: false },
    ]

    const firstResult = await stagePayloads(first.source, first.artifact, payloads)
    const secondResult = await stagePayloads(second.source, second.artifact, payloads)

    expect(firstResult).toEqual([
      { source: 'dist', destination: 'runtime', files: ['runtime/hello.txt', 'runtime/opaque.bin', 'runtime/runner', 'runtime/\u{e000}', 'runtime/\ud83d\ude00'], omitted: false },
      { source: 'vendor', destination: 'vendor', files: [], omitted: true },
    ])
    expect(secondResult).toEqual(firstResult)
    expect([...await readFile(join(first.artifact, 'runtime', 'opaque.bin'))]).toEqual([0, 255, 1, 128, 10])
    expect((await lstat(join(first.artifact, 'runtime', 'hello.txt'))).mode & 0o777).toBe(0o644)
    expect((await lstat(join(first.artifact, 'runtime', 'opaque.bin'))).mode & 0o777).toBe(0o644)
    expect((await lstat(join(first.artifact, 'runtime', 'runner'))).mode & 0o777).toBe(0o755)
    expect(await stagedTree(first.artifact)).toEqual(await stagedTree(second.artifact))
  })

  it('retains an empty declared directory without inventing a file inventory entry', async () => {
    const { source, artifact } = await workspace()
    await mkdir(join(source, 'empty'))

    await expect(stagePayloads(source, artifact, [{ from: 'empty', to: 'empty', required: true }])).resolves.toEqual([
      { source: 'empty', destination: 'empty', files: [], omitted: false },
    ])
    await expect(lstat(join(artifact, 'empty'))).resolves.toMatchObject({ isDirectory: expect.any(Function) })
  })

  it('fails a missing required root but records a missing optional root', async () => {
    const { source, artifact } = await workspace()

    await expect(inspectPayloads(source, [{ from: 'missing', to: 'missing', required: false }])).resolves.toEqual([
      { source: 'missing', destination: 'missing', files: [], omitted: true },
    ])
    await expect(stagePayloads(source, artifact, [{ from: 'missing', to: 'missing', required: true }]))
      .rejects.toMatchObject({ diagnostic: { code: 'ARTIFACT_PAYLOAD_MISSING' } })
  })

  it('rejects duplicate destinations even when both optional roots are absent', async () => {
    const { source } = await workspace()
    await expect(inspectPayloads(source, [
      { from: 'optional-one', to: 'vendor', required: false },
      { from: 'optional-two', to: 'vendor', required: false },
    ])).rejects.toMatchObject({ diagnostic: { code: 'ARTIFACT_PATH_COLLISION' } })
  })

  it.each([
    ['absolute source', { from: '/dist', to: 'dist', required: true }],
    ['Windows absolute source', { from: 'C:/dist', to: 'dist', required: true }],
    ['parent traversal', { from: '../dist', to: 'dist', required: true }],
    ['glob', { from: 'dist/*', to: 'dist', required: true }],
    ['package manifest', { from: 'dist', to: 'package.json', required: true }],
    ['artifact manifest root', { from: 'dist', to: '.moe/runtime', required: true }],
    ['adapter ledger root', { from: 'dist', to: '.moe-mint/files', required: true }],
    ['legal payload', { from: 'dist', to: 'LICENSE', required: true }],
    ['NOTICE legal payload', { from: 'dist', to: 'NOTICE', required: true }],
    ['third-party notice legal payload', { from: 'dist', to: 'THIRD_PARTY_NOTICES', required: true }],
    ['reserved case alias', { from: 'dist', to: 'PACKAGE.JSON/child', required: true }],
    ['reserved legal descendant', { from: 'dist', to: 'license/child', required: true }],
  ] as const)('rejects a declared %s before copying', async (_name, payload) => {
    const { source } = await workspace()
    await mkdir(join(source, 'dist'))

    await expect(inspectPayloads(source, [payload])).rejects.toMatchObject({ diagnostic: { code: 'ARTIFACT_PATH_INVALID' } })
  })

  it('uses pinned full Unicode case folding with post-fold NFC normalization', () => {
    expect(artifactCollisionKey(artifactPath('Straße'))).toBe(artifactCollisionKey(artifactPath('STRAẞE')))
    expect(artifactCollisionKey(artifactPath('ı'))).not.toBe(artifactCollisionKey(artifactPath('i')))
    expect(artifactCollisionKey(artifactPath('ŉ'))).toBe(artifactCollisionKey(artifactPath('ʼn')))
    expect(artifactCollisionKey(artifactPath('ǰ'))).toBe(artifactCollisionKey(artifactPath('ǰ')))
  })

  it('conforms to the independent pinned Unicode common/full CaseFolding fixture', async () => {
    expect(UNICODE_CASE_FOLD_VERSION).toBe('16.0.0')
    const expected = new Map<number, string>()
    for (const line of (await readFile(caseFoldingFixture, 'utf8')).split(/\r?\n/)) {
      const fields = line.split('#', 1)[0]?.split(';').map((field) => field.trim())
      if (fields === undefined || fields.length < 3 || !['C', 'F'].includes(fields[1] ?? '')) continue
      expected.set(Number.parseInt(fields[0]!, 16), (fields[2] ?? '').split(' ').map((part) => String.fromCodePoint(Number.parseInt(part, 16))).join(''))
    }
    expect(expected.size).toBe(1557)
    expect([...FULL_CASE_FOLD]).toEqual([...expected])
    for (const [codePoint, folded] of expected) {
      expect(artifactCollisionKey(artifactPath(String.fromCodePoint(codePoint)))).toBe(folded.normalize('NFC'))
    }
  })

  it('rejects source maps rather than silently filtering a declared root', async () => {
    const { source } = await workspace()
    await mkdir(join(source, 'dist'))
    await writeFile(join(source, 'dist', 'index.d.ts.map'), '{}')

    await expect(inspectPayloads(source, [{ from: 'dist', to: 'dist', required: true }]))
      .rejects.toMatchObject({ diagnostic: { code: 'ARTIFACT_SOURCE_MAP' } })
  })

  it('rejects a source filename that cannot be a portable artifact path', async () => {
    const { source } = await workspace()
    await mkdir(join(source, 'dist'))
    await writeFile(join(source, 'dist', 'back\\slash.txt'), 'not portable')

    await expect(inspectPayloads(source, [{ from: 'dist', to: 'dist', required: true }]))
      .rejects.toMatchObject({ diagnostic: { code: 'ARTIFACT_PATH_INVALID' } })
  })

  it('rejects a symlink and detectable hard link in a declared root', async () => {
    const { source } = await workspace()
    await mkdir(join(source, 'dist'))
    await writeFile(join(source, 'outside.txt'), 'outside')
    await symlink(join(source, 'outside.txt'), join(source, 'dist', 'linked.txt'))

    await expect(inspectPayloads(source, [{ from: 'dist', to: 'dist', required: true }]))
      .rejects.toMatchObject({ diagnostic: { code: 'ARTIFACT_UNSAFE_FILE_TYPE' } })

    await rm(join(source, 'dist', 'linked.txt'))
    await writeFile(join(source, 'dist', 'original.txt'), 'same inode')
    await link(join(source, 'dist', 'original.txt'), join(source, 'dist', 'alias.txt'))
    await expect(inspectPayloads(source, [{ from: 'dist', to: 'dist', required: true }]))
      .rejects.toMatchObject({ diagnostic: { code: 'ARTIFACT_HARD_LINK' } })
  })

  it('rejects duplicate, case-folded, and NFC-equivalent destinations before writing', async () => {
    const { source } = await workspace()
    for (const root of ['one', 'two', 'three']) {
      await mkdir(join(source, root))
      await writeFile(join(source, root, 'file.txt'), root)
    }

    await expect(inspectPayloads(source, [
      { from: 'one', to: 'same', required: true },
      { from: 'two', to: 'same', required: true },
    ])).rejects.toMatchObject({ diagnostic: { code: 'ARTIFACT_PATH_COLLISION' } })
    await expect(inspectPayloads(source, [
      { from: 'one', to: 'DIST', required: true },
      { from: 'two', to: 'dist', required: true },
    ])).rejects.toMatchObject({ diagnostic: { code: 'ARTIFACT_PATH_COLLISION' } })
    await expect(inspectPayloads(source, [
      { from: 'one', to: 'caf\u00e9', required: true },
      { from: 'three', to: 'cafe\u0301', required: true },
    ])).rejects.toMatchObject({ diagnostic: { code: 'ARTIFACT_PATH_COLLISION' } })
    await expect(inspectPayloads(source, [
      { from: 'one', to: 'Stra\u00dfe', required: true },
      { from: 'three', to: 'STRASSE', required: true },
    ])).rejects.toMatchObject({ diagnostic: { code: 'ARTIFACT_PATH_COLLISION' } })
  })

  it('rejects colliding empty destination directories from overlapping declared roots', async () => {
    const { source } = await workspace()
    await mkdir(join(source, 'one', 'Foo'), { recursive: true })
    await mkdir(join(source, 'two'))

    await expect(inspectPayloads(source, [
      { from: 'one', to: 'bundle', required: true },
      { from: 'two', to: 'bundle/foo', required: true },
    ])).rejects.toMatchObject({ diagnostic: { code: 'ARTIFACT_PATH_COLLISION' } })
  })

  it('rejects an existing directory/file conflict during preflight', async () => {
    const { source, artifact } = await workspace()
    await mkdir(join(source, 'dist'))
    await writeFile(join(source, 'dist', 'file'), 'payload')
    await mkdir(join(artifact, 'runtime', 'file'), { recursive: true })
    await expect(stagePayloads(source, artifact, [{ from: 'dist', to: 'runtime', required: true }]))
      .rejects.toMatchObject({ diagnostic: { code: 'ARTIFACT_PATH_COLLISION' } })
    await expect((await import('node:fs/promises')).readdir(join(artifact, 'runtime'))).resolves.toEqual(['file'])
  })

  it('leaves the artifact byte-identical when a later empty directory conflicts with an existing file', async () => {
    const { source, artifact } = await workspace()
    await mkdir(join(source, 'first'))
    await writeFile(join(source, 'first', 'file'), 'first')
    await mkdir(join(source, 'later', 'nested'), { recursive: true })
    await mkdir(join(artifact, 'later'))
    await writeFile(join(artifact, 'later', 'nested'), 'existing')
    const before = await stagedTree(artifact)
    await expect(stagePayloads(source, artifact, [
      { from: 'first', to: 'first', required: true },
      { from: 'later', to: 'later', required: true },
    ])).rejects.toMatchObject({ diagnostic: { code: 'ARTIFACT_PATH_COLLISION' } })
    expect(await stagedTree(artifact)).toEqual(before)
  })

  it('rejects payload directories that case-fold or NFC-alias existing directories', async () => {
    const { source, artifact } = await workspace()
    await mkdir(join(source, 'dist'))
    await writeFile(join(source, 'dist', 'new'), 'payload')
    await mkdir(join(artifact, 'Runtime'))
    const before = await stagedTree(artifact)
    await expect(stagePayloads(source, artifact, [{ from: 'dist', to: 'runtime', required: true }]))
      .rejects.toMatchObject({ diagnostic: { code: 'ARTIFACT_PATH_COLLISION' } })
    expect(await stagedTree(artifact)).toEqual(before)
  })

  it.skipIf(process.platform === 'win32')('rejects FIFO and socket entries where the host supports them', async () => {
    const { source } = await workspace()
    const fifoRoot = join(source, 'fifo')
    await mkdir(fifoRoot)
    await execFile('mkfifo', [join(fifoRoot, 'stream')])
    await expect(inspectPayloads(source, [{ from: 'fifo', to: 'fifo', required: true }]))
      .rejects.toMatchObject({ diagnostic: { code: 'ARTIFACT_UNSAFE_FILE_TYPE' } })

    const socketRoot = join(source, 'socket')
    await mkdir(socketRoot)
    const socketPath = join(socketRoot, 'listener')
    const server = createServer()
    await new Promise<void>((resolveListen, rejectListen) => {
      server.once('error', rejectListen)
      server.listen(socketPath, resolveListen)
    })
    try {
      await expect(inspectPayloads(source, [{ from: 'socket', to: 'socket', required: true }]))
        .rejects.toMatchObject({ diagnostic: { code: 'ARTIFACT_UNSAFE_FILE_TYPE' } })
    } finally {
      await new Promise<void>((resolveClose, rejectClose) => server.close((error) => error === undefined ? resolveClose() : rejectClose(error)))
      await rm(socketPath, { force: true })
    }
  })

  it('does not write any payload file when a later root fails preflight', async () => {
    const { source, artifact } = await workspace()
    await mkdir(join(source, 'safe'))
    await writeFile(join(source, 'safe', 'kept.txt'), 'would be copied without transactional preflight')
    await mkdir(join(source, 'unsafe'))
    await symlink(join(source, 'safe', 'kept.txt'), join(source, 'unsafe', 'linked.txt'))

    await expect(stagePayloads(source, artifact, [
      { from: 'safe', to: 'safe', required: true },
      { from: 'unsafe', to: 'unsafe', required: true },
    ])).rejects.toMatchObject({ diagnostic: { code: 'ARTIFACT_UNSAFE_FILE_TYPE' } })
    await expect((await import('node:fs/promises')).readdir(artifact)).resolves.toEqual([])
  })

  it('uses preflight byte snapshots and rejects a swapped artifact parent before writing through it', async () => {
    const { source, artifact } = await workspace()
    await mkdir(join(source, 'dist'))
    await writeFile(join(source, 'dist', 'file'), 'before')
    await mkdir(join(artifact, 'runtime'))
    await stagePayloads(source, artifact, [{ from: 'dist', to: 'stable', required: true }], {
      afterPreflight: async () => { await writeFile(join(source, 'dist', 'file'), 'after') },
    })
    await expect(readFile(join(artifact, 'stable', 'file'), 'utf8')).resolves.toBe('before')

    const outside = join(source, 'outside')
    await mkdir(outside)
    await expect(stagePayloads(source, artifact, [{ from: 'dist', to: 'runtime', required: true }], {
      afterPreflight: async () => {
        await rename(join(artifact, 'runtime'), join(artifact, 'runtime-saved'))
        await symlink(outside, join(artifact, 'runtime'))
      },
    })).rejects.toMatchObject({ diagnostic: { code: 'ARTIFACT_UNSAFE_DESTINATION' } })
    await expect((await import('node:fs/promises')).readdir(outside)).resolves.toEqual([])
  })
})
