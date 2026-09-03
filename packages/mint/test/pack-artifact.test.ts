import { chmod, lstat, mkdir, mkdtemp, readFile, realpath, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { afterEach, describe, expect, it } from 'vitest'
import { writeArtifactManifest, type ExpectedArtifactContext } from '../src/artifact/artifact-manifest.js'
import { decodePackedFilename, PACK_LIMITS, packArtifactOnce, verifyPackedArtifact } from '../src/artifact/pack.js'

const workspaces: string[] = []

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map((workspace) => rm(workspace, { recursive: true, force: true })))
})

const expected: ExpectedArtifactContext = {
  plugin: { id: 'npm-pack-fixture', package: '@example/npm-pack-fixture', version: '1.2.3' },
  targets: { opencode: { emitted_capabilities: ['skill-discovery'] } },
  omitted_optional_payloads: [],
}

async function artifactFixture(): Promise<{ workspace: string; root: string; output: string }> {
  const workspace = await mkdtemp(join(tmpdir(), 'moe-pack-artifact-'))
  workspaces.push(workspace)
  const root = join(workspace, 'artifact')
  const output = join(workspace, 'output')
  await Promise.all([
    mkdir(join(root, 'dist'), { recursive: true }),
    mkdir(join(root, 'bin'), { recursive: true }),
    mkdir(join(root, '.pi', 'extensions'), { recursive: true }),
    mkdir(join(root, '.claude-plugin'), { recursive: true }),
    mkdir(output),
  ])
  await Promise.all([
    writeFile(join(root, 'package.json'), `${JSON.stringify({
      name: '@example/npm-pack-fixture',
      version: '1.2.3',
      type: 'module',
      exports: { '.': './dist/index.js', './server': './dist/server.js' },
      bin: { 'npm-pack-fixture': './bin/npm-pack-fixture' },
      pi: { extensions: ['./.pi/extensions/npm-pack-fixture.js'] },
      scripts: { prepack: "node -e \"require('node:fs').writeFileSync('../lifecycle-ran', 'no')\"" },
      files: ['dist', 'bin', '.pi', '.claude-plugin', '.moe', 'LICENSE', 'NOTICE'],
    }, null, 2)}\n`),
    writeFile(join(root, 'dist', 'index.js'), "export const root = 'packed-root'\n"),
    writeFile(join(root, 'dist', 'server.js'), "export const server = 'packed-server'\n"),
    writeFile(join(root, 'bin', 'npm-pack-fixture'), "#!/usr/bin/env node\nprocess.stdout.write('packed-bin')\n"),
    writeFile(join(root, '.pi', 'extensions', 'npm-pack-fixture.js'), 'export default {}\n'),
    writeFile(join(root, '.claude-plugin', 'plugin.json'), '{"name":"npm-pack-fixture"}\n'),
    writeFile(join(root, 'LICENSE'), 'fixture license\n'),
    writeFile(join(root, 'NOTICE'), 'fixture notice\n'),
  ])
  await chmod(join(root, 'bin', 'npm-pack-fixture'), 0o755)
  await writeArtifactManifest(root, expected)
  return { workspace, root, output }
}

function tarNumber(value: number, width: number): Buffer {
  return Buffer.from(`${value.toString(8).padStart(width - 1, '0')}\0`, 'ascii')
}

function tarMember(path: string, type = '0', body = Buffer.alloc(0), padding = Buffer.alloc(0)): Buffer {
  const header = Buffer.alloc(512)
  header.write(path, 0, 'utf8')
  tarNumber(type === '5' ? 0o755 : 0o644, 8).copy(header, 100)
  tarNumber(0, 8).copy(header, 108)
  tarNumber(0, 8).copy(header, 116)
  tarNumber(body.byteLength, 12).copy(header, 124)
  tarNumber(0, 12).copy(header, 136)
  header.fill(0x20, 148, 156)
  header[156] = type.charCodeAt(0)
  Buffer.from('ustar\0', 'ascii').copy(header, 257)
  Buffer.from('00', 'ascii').copy(header, 263)
  const checksum = header.reduce((sum, byte) => sum + byte, 0)
  Buffer.from(`${checksum.toString(8).padStart(6, '0')}\0 `, 'ascii').copy(header, 148)
  const requiredPadding = Buffer.alloc((512 - (body.byteLength % 512)) % 512)
  if (padding.byteLength > 0) padding.copy(requiredPadding)
  return Buffer.concat([header, body, requiredPadding])
}

function rewriteChecksum(member: Buffer): void {
  member.fill(0x20, 148, 156)
  const checksum = member.subarray(0, 512).reduce((sum, byte) => sum + byte, 0)
  Buffer.from(`${checksum.toString(8).padStart(6, '0')}\0 `, 'ascii').copy(member, 148)
}

async function archive(root: string, members: readonly Buffer[]): Promise<string> {
  const path = join(root, 'invalid.tgz')
  await writeFile(path, gzipSync(Buffer.concat([...members, Buffer.alloc(1024)])))
  return path
}

async function unterminatedArchive(root: string, members: readonly Buffer[]): Promise<string> {
  const path = join(root, 'unterminated.tgz')
  await writeFile(path, gzipSync(Buffer.concat(members)))
  return path
}

describe('packed artifacts', () => {
  it('packs a validated artifact once and verifies the extracted package against caller authority', async () => {
    const { root, output } = await artifactFixture()

    const packed = await packArtifactOnce(root, output, expected)

    expect(packed).toMatchObject({
      filename: 'example-npm-pack-fixture-1.2.3.tgz',
      integrity: expect.stringMatching(/^sha512-[A-Za-z0-9+/]+=*$/),
    })
    expect(packed.bytes).toBeGreaterThan(0)
    expect(packed.sha256).toMatch(/^[0-9a-f]{64}$/)
    await expect(verifyPackedArtifact(packed.tarballPath, expected)).resolves.toMatchObject({
      sha256: packed.sha256,
      integrity: packed.integrity,
      bytes: packed.bytes,
    })
    expect((await stat(packed.tarballPath)).isFile()).toBe(true)
    expect(await readFile(packed.tarballPath)).toHaveLength(packed.bytes)
    await expect(lstat(join(root, '..', 'lifecycle-ran'))).rejects.toMatchObject({ code: 'ENOENT' })
    const expanded = (await import('node:zlib')).gunzipSync(await readFile(packed.tarballPath)).toString('utf8')
    expect(expanded).toContain('package/.claude-plugin/plugin.json')
    expect(expanded).toContain('package/.moe/artifact.json')
  })

  it('runs only a caller-declared packed probe and reports a failing safe bin', async () => {
    const { root, output } = await artifactFixture()
    await writeFile(join(root, 'bin', 'npm-pack-fixture'), '#!/usr/bin/env node\nprocess.exitCode = 9\n')
    await chmod(join(root, 'bin', 'npm-pack-fixture'), 0o755)
    await rm(join(root, '.moe', 'artifact.json'))
    await writeArtifactManifest(root, expected)
    const packed = await packArtifactOnce(root, output, expected)

    await expect(verifyPackedArtifact(packed.tarballPath, expected, {
      probes: [{ kind: 'bin', path: 'bin/npm-pack-fixture', args: [], dependencies: [] }],
      offlineDependencies: [],
    })).rejects.toMatchObject({ diagnostic: { code: 'PACK_PROBE_FAILED' } })
  })

  it('bounds output from a caller-declared packed probe', async () => {
    const { root, output } = await artifactFixture()
    await writeFile(join(root, 'bin', 'npm-pack-fixture'), "#!/usr/bin/env node\nprocess.stdout.write('x'.repeat(1024 * 1024 + 1))\n")
    await chmod(join(root, 'bin', 'npm-pack-fixture'), 0o755)
    await rm(join(root, '.moe', 'artifact.json'))
    await writeArtifactManifest(root, expected)
    const packed = await packArtifactOnce(root, output, expected)

    await expect(verifyPackedArtifact(packed.tarballPath, expected, {
      probes: [{ kind: 'bin', path: 'bin/npm-pack-fixture', args: [], dependencies: [] }],
      offlineDependencies: [],
    })).rejects.toMatchObject({ diagnostic: { code: 'PACK_PROBE_OUTPUT_LIMIT' } })
  })

  it('runs caller-declared root and server imports inside an isolated consumer', async () => {
    const { root, output } = await artifactFixture()
    const packed = await packArtifactOnce(root, output, expected)

    await expect(verifyPackedArtifact(packed.tarballPath, expected, {
      probes: [
        { kind: 'import', subpath: '.', dependencies: [] },
        { kind: 'import', subpath: './server', dependencies: [] },
      ],
      offlineDependencies: [],
    })).resolves.toMatchObject({ sha256: packed.sha256 })
  })

  it('rejects a Pi discovery path that is not present in the extracted artifact', async () => {
    const { root, output } = await artifactFixture()
    const packagePath = join(root, 'package.json')
    const packageJson = JSON.parse(await readFile(packagePath, 'utf8')) as Record<string, unknown>
    packageJson.pi = { extensions: ['./.pi/extensions/missing.js'] }
    await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`)
    await rm(join(root, '.moe', 'artifact.json'))
    await writeArtifactManifest(root, expected)

    await expect(packArtifactOnce(root, output, expected)).rejects.toMatchObject({ diagnostic: { code: 'PACK_PI_REFERENCE_MISSING' } })
  })

  it('canonicalizes artifact and output roots before packing through a symlinked parent', async () => {
    const { workspace, root, output } = await artifactFixture()
    const aliases = join(workspace, 'aliases')
    await mkdir(aliases)
    await symlink(workspace, join(aliases, 'workspace'))

    const packed = await packArtifactOnce(
      join(aliases, 'workspace', 'artifact'),
      join(aliases, 'workspace', 'output'),
      expected,
    )

    expect(packed.tarballPath.startsWith(`${await realpath(output)}/`)).toBe(true)
    expect(packed.tarballPath).not.toContain('/aliases/')
    expect(root).toBe(join(workspace, 'artifact'))
  })

  it('rejects a non-USTAR archive before materializing any package path', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'moe-pack-invalid-'))
    workspaces.push(workspace)
    const member = tarMember('package/file.txt', '0', Buffer.from('fixture\n'))
    member.fill(0, 257, 265)
    rewriteChecksum(member)
    const tarball = await archive(workspace, [member])

    await expect(verifyPackedArtifact(tarball, expected)).rejects.toMatchObject({ diagnostic: { code: 'PACK_TARBALL_INVALID' } })
  })

  it('rejects a regular file that conflicts with a descendant member before extraction', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'moe-pack-conflict-'))
    workspaces.push(workspace)
    const tarball = await archive(workspace, [
      tarMember('package/runtime', '0', Buffer.from('not-a-directory\n')),
      tarMember('package/runtime/index.js', '0', Buffer.from('export {}\n')),
    ])

    await expect(verifyPackedArtifact(tarball, expected)).rejects.toMatchObject({ diagnostic: { code: 'PACK_TARBALL_SHAPE_CONFLICT' } })
  })

  it('rejects nonzero tar padding instead of accepting hidden archive data', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'moe-pack-padding-'))
    workspaces.push(workspace)
    const tarball = await archive(workspace, [tarMember('package/file.txt', '0', Buffer.from('x'), Buffer.from([1]))])

    await expect(verifyPackedArtifact(tarball, expected)).rejects.toMatchObject({ diagnostic: { code: 'PACK_TARBALL_INVALID' } })
  })

  it.each([
    ['symbolic links', '2'],
    ['PAX entries', 'x'],
    ['character devices', '3'],
  ])('rejects %s before extraction', async (_label, type) => {
    const workspace = await mkdtemp(join(tmpdir(), 'moe-pack-unsafe-type-'))
    workspaces.push(workspace)
    const tarball = await archive(workspace, [tarMember('package/unsafe', type)])

    await expect(verifyPackedArtifact(tarball, expected)).rejects.toMatchObject({ diagnostic: { code: 'PACK_TARBALL_UNSAFE_TYPE' } })
  })

  it('rejects case-folded duplicate members before extraction', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'moe-pack-collision-'))
    workspaces.push(workspace)
    const tarball = await archive(workspace, [
      tarMember('package/Runtime.js', '0', Buffer.from('export {}\n')),
      tarMember('package/runtime.js', '0', Buffer.from('export {}\n')),
    ])

    await expect(verifyPackedArtifact(tarball, expected)).rejects.toMatchObject({ diagnostic: { code: 'PACK_TARBALL_PATH_COLLISION' } })
  })

  it('rejects NFC-equivalent duplicate members before extraction', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'moe-pack-nfc-collision-'))
    workspaces.push(workspace)
    const tarball = await archive(workspace, [
      tarMember('package/café.js', '0', Buffer.from('export {}\n')),
      tarMember('package/café.js', '0', Buffer.from('export {}\n')),
    ])

    await expect(verifyPackedArtifact(tarball, expected)).rejects.toMatchObject({ diagnostic: { code: 'PACK_TARBALL_PATH_COLLISION' } })
  })

  it('rejects an unterminated archive and a tampered checksum', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'moe-pack-malformed-'))
    workspaces.push(workspace)
    const unterminated = await unterminatedArchive(workspace, [tarMember('package/file.txt', '0', Buffer.from('x'))])
    const badChecksumMember = tarMember('package/checksum.txt', '0', Buffer.from('x'))
    badChecksumMember[0] = 'X'.charCodeAt(0)
    const badChecksum = await archive(workspace, [badChecksumMember])

    await expect(verifyPackedArtifact(unterminated, expected)).rejects.toMatchObject({ diagnostic: { code: 'PACK_TARBALL_INVALID' } })
    await expect(verifyPackedArtifact(badChecksum, expected)).rejects.toMatchObject({ diagnostic: { code: 'PACK_TARBALL_INVALID' } })
  })

  it('enforces a member-size limit before materializing its declared body', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'moe-pack-limit-'))
    workspaces.push(workspace)
    const member = tarMember('package/large.txt')
    tarNumber(PACK_LIMITS.memberBytes + 1, 12).copy(member, 124)
    rewriteChecksum(member)
    const tarball = await archive(workspace, [member])

    await expect(verifyPackedArtifact(tarball, expected)).rejects.toMatchObject({ diagnostic: { code: 'PACK_TARBALL_LIMIT' } })
  })

  it('rejects an output filename that is not valid UTF-8', () => {
    expect(() => decodePackedFilename(Buffer.from([0xff]))).toThrow('npm pack destination contains a filename that is not valid UTF-8')
  })

  it('round-trips a valid non-ASCII npm output filename as raw UTF-8 bytes', () => {
    expect(decodePackedFilename(Buffer.from('føø-1.2.3.tgz', 'utf8'))).toBe('føø-1.2.3.tgz')
  })
})
