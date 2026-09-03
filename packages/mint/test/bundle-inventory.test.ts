import { execFile as execFileCallback } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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
        output: 'dist/extension.mjs',
        input: 'modules/outer/nested/index.js',
        packageName: '@fixture/nested',
        packageVersion: '3.1.0',
        packageManifest: 'modules/outer/nested/package.json',
      },
      {
        output: 'dist/index.js',
        input: 'modules/outer/nested/index.js',
        packageName: '@fixture/nested',
        packageVersion: '3.1.0',
        packageManifest: 'modules/outer/nested/package.json',
      },
      {
        output: 'dist/hook.cjs',
        input: 'modules/plain/lib/a.js',
        packageName: 'plain-dependency',
        packageVersion: '2.0.0',
        packageManifest: 'modules/plain/package.json',
      },
      {
        output: 'dist/index.js',
        input: 'modules/plain/lib/a.js',
        packageName: 'plain-dependency',
        packageVersion: '2.0.0',
        packageManifest: 'modules/plain/package.json',
      },
      {
        output: 'dist/secondary.js',
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
        outputs: ['dist/extension.mjs', 'dist/index.js'],
      },
      {
        name: 'plain-dependency',
        version: '2.0.0',
        package_manifest: 'modules/plain/package.json',
        inputs: ['modules/plain/lib/a.js'],
        outputs: ['dist/hook.cjs', 'dist/index.js', 'dist/secondary.js'],
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

  it('keeps physical copies with the same name and version in separate provenance rows', () => {
    const copies: BundleInput[] = [
      { output: 'dist/a.js', input: 'node_modules/one/index.js', packageName: 'demo', packageVersion: '1.0.0', packageManifest: 'node_modules/one/package.json' },
      { output: 'dist/b.js', input: 'node_modules/two/index.js', packageName: 'demo', packageVersion: '1.0.0', packageManifest: 'node_modules/two/package.json' },
    ]

    expect(resolveBundledPackages(copies)).toEqual([
      { name: 'demo', version: '1.0.0', package_manifest: 'node_modules/one/package.json', inputs: ['node_modules/one/index.js'], outputs: ['dist/a.js'] },
      { name: 'demo', version: '1.0.0', package_manifest: 'node_modules/two/package.json', inputs: ['node_modules/two/index.js'], outputs: ['dist/b.js'] },
    ])
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
    await writeFile(join(root, 'source', 'package.json'), '{"name":"source","version":"1.0.0"}\n')
    await writeFile(join(root, 'bad.json'), '{"outputs":{"dist/a.js":{"inputs":[]}}}\n')

    await expect(readBundleMetafiles({
      repositoryRoot: root,
      packageRoot: join(root, 'source'),
      metafiles: [join(root, 'bad.json')],
    })).rejects.toThrow(/invalid bundler metafile/i)
  })

  it('rejects symlinked and missing bundled inputs outside the physical repository', async () => {
    const root = await mkdtemp(join(tmpdir(), 'moe-bundle-physical-root-'))
    workspaces.push(root)
    const packageRoot = join(root, 'packages', 'demo')
    const outside = await mkdtemp(join(tmpdir(), 'moe-bundle-outside-'))
    workspaces.push(outside)
    await mkdir(join(packageRoot, 'dist'), { recursive: true })
    await writeFile(join(packageRoot, 'package.json'), '{"name":"demo","version":"1.0.0"}\n')
    await writeFile(join(outside, 'package.json'), '{"name":"outside","version":"1.0.0"}\n')
    await writeFile(join(outside, 'index.js'), 'export {}\n')
    await symlink(outside, join(root, 'linked-dependency'))
    const metafile = join(root, 'metafile.json')
    await writeFile(metafile, JSON.stringify({
      outputs: { 'packages/demo/dist/index.js': { inputs: { 'linked-dependency/index.js': {} } } },
    }))

    await expect(readBundleMetafiles({ repositoryRoot: root, packageRoot, metafiles: [metafile] }))
      .rejects.toThrow(/physical.*repository|outside repository/i)
    await writeFile(metafile, JSON.stringify({
      outputs: { 'packages/demo/dist/index.js': { inputs: { 'packages/demo/missing.js': {} } } },
    }))
    await expect(readBundleMetafiles({ repositoryRoot: root, packageRoot, metafiles: [metafile] }))
      .rejects.toThrow(/cannot resolve|does not exist/i)
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
    await writeFile(join(packageRoot, 'src', 'index.ts'), 'export {}\n')
    await writeFile(join(dependencyRoot, 'package.json'), '{"name":"dependency","version":"2.0.0"}\n')
    await writeFile(join(dependencyRoot, 'index.js'), 'export {}\n')
    const metafile = JSON.stringify({
      inputs: {
        'packages/demo/src/index.ts': { bytes: 1, imports: [] },
        'node_modules/dependency/index.js': { bytes: 1, imports: [] },
      },
      outputs: {
        'packages/demo/dist/index.cjs': {
          imports: [], exports: [], entryPoint: 'packages/demo/src/index.ts',
          inputs: {
            'packages/demo/src/index.ts': { bytesInOutput: 1 },
            'node_modules/dependency/index.js': { bytesInOutput: 1 },
          }, bytes: 2,
        },
      },
    })

    const runWriter = async () => {
      await execFile(process.execPath, ['--experimental-strip-types', inventoryScript, '--repository-root', root, '--prepare', packageRoot])
      await writeFile(rawMetafile, metafile)
      await execFile(process.execPath, ['--experimental-strip-types', inventoryScript, '--repository-root', root, packageRoot, rawMetafile])
      return {
        inventory: await readFile(join(packageRoot, '.moe-build', 'bundle-inventory.json')),
        metafile: await readFile(join(packageRoot, '.moe-build', 'metafile-cjs.json')),
      }
    }

    const first = await runWriter()
    const second = await runWriter()
    expect(second.inventory).toEqual(first.inventory)
    expect(second.metafile).toEqual(first.metafile)
    expect(JSON.parse(first.inventory.toString('utf8'))).toEqual([
      {
        name: 'dependency',
        version: '2.0.0',
        package_manifest: 'node_modules/dependency/package.json',
        inputs: ['node_modules/dependency/index.js'],
        outputs: ['dist/index.cjs'],
      },
    ])
    expect(first.inventory.toString('utf8')).not.toContain(root)
    await expect(readFile(rawMetafile)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(first.metafile.toString('utf8')).not.toContain(root)
  })

  it('rejects external metafiles, symlinked package roots, and unsafe persisted metafile fields', async () => {
    const root = await mkdtemp(join(tmpdir(), 'moe-bundle-writer-safety-'))
    workspaces.push(root)
    const packageRoot = join(root, 'packages', 'demo')
    const outside = await mkdtemp(join(tmpdir(), 'moe-bundle-writer-outside-'))
    workspaces.push(outside)
    await mkdir(join(packageRoot, 'dist'), { recursive: true })
    await writeFile(join(packageRoot, 'package.json'), '{"name":"demo","version":"1.0.0"}\n')
    await writeFile(join(outside, 'metafile-cjs.json'), '{"outputs":{}}\n')
    const insideMetafile = join(packageRoot, 'dist', 'metafile-cjs.json')
    await writeFile(insideMetafile, '{"timestamp":"2026-09-03T00:00:00Z","outputs":{}}\n')

    await expect(execFile(process.execPath, ['--experimental-strip-types', inventoryScript, '--repository-root', root, packageRoot, join(outside, 'metafile-cjs.json')]))
      .rejects.toThrow(/metafile.*safe package build location/i)
    expect(await readFile(join(outside, 'metafile-cjs.json'), 'utf8')).toBe('{"outputs":{}}\n')
    await expect(execFile(process.execPath, ['--experimental-strip-types', inventoryScript, '--repository-root', root, packageRoot, insideMetafile]))
      .rejects.toThrow(/timestamp|unknown metafile field/i)
    await writeFile(insideMetafile, '{"inputs":{"C:\\\\host\\\\input.js":{}},"outputs":{}}\n')
    await expect(execFile(process.execPath, ['--experimental-strip-types', inventoryScript, '--repository-root', root, packageRoot, insideMetafile]))
      .rejects.toThrow(/absolute machine path/i)
    await writeFile(insideMetafile, '{"inputs":{"\\\\\\\\host\\\\share\\\\input.js":{}},"outputs":{}}\n')
    await expect(execFile(process.execPath, ['--experimental-strip-types', inventoryScript, '--repository-root', root, packageRoot, insideMetafile]))
      .rejects.toThrow(/absolute machine path/i)
    const linkedRoot = join(root, 'linked-package')
    await symlink(outside, linkedRoot)
    await expect(execFile(process.execPath, ['--experimental-strip-types', inventoryScript, '--repository-root', root, '--prepare', linkedRoot]))
      .rejects.toThrow(/package root.*inside repository/i)
    await symlink(outside, join(packageRoot, '.moe-build'))
    await expect(execFile(process.execPath, ['--experimental-strip-types', inventoryScript, '--repository-root', root, '--prepare', packageRoot]))
      .rejects.toThrow(/evidence root.*symbolic link/i)
  })
})
