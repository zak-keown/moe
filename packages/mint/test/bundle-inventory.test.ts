import { execFile as execFileCallback } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import {
  type BundleInput,
  readBundleMetafiles,
  resolveBundledPackages,
} from '../src/artifact/bundle-inventory.js'

const fixtureRoot = fileURLToPath(new URL('./fixtures/bundle-metafiles/', import.meta.url))
const repositoryRoot = fileURLToPath(new URL('../../..', import.meta.url))
const inventoryScript = join(repositoryRoot, 'scripts', 'write-bundle-inventory.mjs')
const workspaces: string[] = []
const execFile = promisify(execFileCallback)

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('bundle inventory evidence', () => {
  it('resolves esbuild and tsup inputs through the nearest package manifest and aggregates duplicate inputs across outputs', async () => {
    const inputs = await readBundleMetafiles({
      repositoryRoot: fixtureRoot,
      packageRoot: join(fixtureRoot, 'source'),
      metafiles: [
        join(fixtureRoot, 'esbuild.json'),
        join(fixtureRoot, 'tsup-cjs.json'),
        join(fixtureRoot, 'tsup-esm.json'),
      ],
    })

    expect(inputs).toEqual([
      {
        output: 'source/dist/extension.mjs',
        input: 'modules/outer/nested/index.js',
        packageName: '@fixture/nested',
        packageVersion: '3.1.0',
        packageManifest: 'modules/outer/nested/package.json',
      },
      {
        output: 'source/dist/index.js',
        input: 'modules/outer/nested/index.js',
        packageName: '@fixture/nested',
        packageVersion: '3.1.0',
        packageManifest: 'modules/outer/nested/package.json',
      },
      {
        output: 'source/dist/hook.cjs',
        input: 'modules/plain/lib/a.js',
        packageName: 'plain-dependency',
        packageVersion: '2.0.0',
        packageManifest: 'modules/plain/package.json',
      },
      {
        output: 'source/dist/index.js',
        input: 'modules/plain/lib/a.js',
        packageName: 'plain-dependency',
        packageVersion: '2.0.0',
        packageManifest: 'modules/plain/package.json',
      },
      {
        output: 'source/dist/secondary.js',
        input: 'modules/plain/lib/a.js',
        packageName: 'plain-dependency',
        packageVersion: '2.0.0',
        packageManifest: 'modules/plain/package.json',
      },
    ])

    expect(resolveBundledPackages(inputs)).toEqual([
      {
        name: '@fixture/nested',
        version: '3.1.0',
        package_manifest: 'modules/outer/nested/package.json',
        inputs: ['modules/outer/nested/index.js'],
        outputs: ['source/dist/extension.mjs', 'source/dist/index.js'],
      },
      {
        name: 'plain-dependency',
        version: '2.0.0',
        package_manifest: 'modules/plain/package.json',
        inputs: ['modules/plain/lib/a.js'],
        outputs: ['source/dist/hook.cjs', 'source/dist/index.js', 'source/dist/secondary.js'],
      },
    ])
  })

  it('excludes source-owned inputs and imports the bundler marks external', async () => {
    const inputs = await readBundleMetafiles({
      repositoryRoot: fixtureRoot,
      packageRoot: join(fixtureRoot, 'source'),
      metafiles: [join(fixtureRoot, 'esbuild.json')],
    })

    expect(inputs.map(({ packageName }) => packageName)).toEqual(['@fixture/nested', 'plain-dependency', 'plain-dependency'])
    expect(inputs.some(({ input }) => input.includes('external-only'))).toBe(false)
  })

  it('fails when a bundled third-party input has no nearest package manifest', async () => {
    await expect(readBundleMetafiles({
      repositoryRoot: fixtureRoot,
      packageRoot: join(fixtureRoot, 'source'),
      metafiles: [join(fixtureRoot, 'unresolved.json')],
    })).rejects.toThrow(/cannot resolve bundled input .*modules\/missing\/index\.js.*package\.json/i)
  })

  it('fails when one package identity resolves to conflicting versions', () => {
    const conflicting: BundleInput[] = [
      { output: 'dist/a.js', input: 'node_modules/demo/a.js', packageName: 'demo', packageVersion: '1.0.0', packageManifest: 'node_modules/demo/package.json' },
      { output: 'dist/b.js', input: 'node_modules/.pnpm/demo@2.0.0/node_modules/demo/b.js', packageName: 'demo', packageVersion: '2.0.0', packageManifest: 'node_modules/.pnpm/demo@2.0.0/node_modules/demo/package.json' },
    ]

    expect(() => resolveBundledPackages(conflicting)).toThrow(/conflicting versions.*demo.*1\.0\.0.*2\.0\.0/i)
  })

  it('sorts package identities, versions, inputs, and outputs by raw UTF-8 bytes', () => {
    const bmp = '\u{e000}'
    const nonBmp = '\u{1f600}'
    const inputs: BundleInput[] = [
      { output: `dist/${bmp}.js`, input: `node_modules/${bmp}/z.js`, packageName: bmp, packageVersion: '1.0.0', packageManifest: `node_modules/${bmp}/package.json` },
      { output: `dist/${nonBmp}.js`, input: `node_modules/${nonBmp}/b.js`, packageName: nonBmp, packageVersion: '1.0.0', packageManifest: `node_modules/${nonBmp}/package.json` },
      { output: `dist/a.js`, input: `node_modules/${nonBmp}/a.js`, packageName: nonBmp, packageVersion: '1.0.0', packageManifest: `node_modules/${nonBmp}/package.json` },
    ]

    expect(resolveBundledPackages(inputs)).toEqual([
      { name: bmp, version: '1.0.0', package_manifest: `node_modules/${bmp}/package.json`, inputs: [`node_modules/${bmp}/z.js`], outputs: [`dist/${bmp}.js`] },
      { name: nonBmp, version: '1.0.0', package_manifest: `node_modules/${nonBmp}/package.json`, inputs: [`node_modules/${nonBmp}/a.js`, `node_modules/${nonBmp}/b.js`], outputs: ['dist/a.js', `dist/${nonBmp}.js`] },
    ])
  })

  it('rejects malformed metafiles instead of silently producing incomplete evidence', async () => {
    const root = await mkdtemp(join(tmpdir(), 'moe-bundle-metafile-'))
    workspaces.push(root)
    await mkdir(join(root, 'source'))
    await writeFile(join(root, 'bad.json'), '{"outputs":{"dist/a.js":{"inputs":[]}}}\n')

    await expect(readBundleMetafiles({
      repositoryRoot: root,
      packageRoot: join(root, 'source'),
      metafiles: [join(root, 'bad.json')],
    })).rejects.toThrow(/invalid bundler metafile/i)
  })

  it('writes deterministic package evidence without absolute machine paths or dist metafiles', async () => {
    const root = await mkdtemp(join(tmpdir(), 'moe-bundle-writer-'))
    workspaces.push(root)
    const packageRoot = join(root, 'packages', 'demo')
    const dependencyRoot = join(root, 'node_modules', 'dependency')
    const rawMetafile = join(packageRoot, 'dist', 'metafile-cjs.json')
    await mkdir(join(packageRoot, 'src'), { recursive: true })
    await mkdir(join(packageRoot, 'dist'), { recursive: true })
    await mkdir(dependencyRoot, { recursive: true })
    await writeFile(join(packageRoot, 'package.json'), '{"name":"demo","version":"1.0.0"}\n')
    await writeFile(join(dependencyRoot, 'package.json'), '{"name":"dependency","version":"2.0.0"}\n')
    const metafile = JSON.stringify({
      inputs: {
        'src/index.ts': { bytes: 1, imports: [] },
        '../../node_modules/dependency/index.js': { bytes: 1, imports: [] },
      },
      outputs: {
        'dist/index.cjs': {
          imports: [], exports: [], entryPoint: 'src/index.ts',
          inputs: {
            'src/index.ts': { bytesInOutput: 1 },
            '../../node_modules/dependency/index.js': { bytesInOutput: 1 },
          }, bytes: 2,
        },
      },
    })

    const runWriter = async () => {
      await execFile(process.execPath, ['--experimental-strip-types', inventoryScript, '--repository-root', root, '--prepare', packageRoot])
      await writeFile(rawMetafile, metafile)
      await execFile(process.execPath, ['--experimental-strip-types', inventoryScript, '--repository-root', root, packageRoot, rawMetafile])
      return readFile(join(packageRoot, '.moe-build', 'bundle-inventory.json'))
    }

    const first = await runWriter()
    const second = await runWriter()
    expect(second).toEqual(first)
    expect(JSON.parse(first.toString('utf8'))).toEqual([
      {
        name: 'dependency',
        version: '2.0.0',
        package_manifest: 'node_modules/dependency/package.json',
        inputs: ['node_modules/dependency/index.js'],
        outputs: ['packages/demo/dist/index.cjs'],
      },
    ])
    expect(first.toString('utf8')).not.toContain(root)
    await expect(readFile(rawMetafile)).rejects.toMatchObject({ code: 'ENOENT' })
    const canonicalMetafile = await readFile(join(packageRoot, '.moe-build', 'metafile-cjs.json'), 'utf8')
    expect(canonicalMetafile).not.toContain(root)
    expect(dirname(rawMetafile)).toBe(join(packageRoot, 'dist'))
  })
})
