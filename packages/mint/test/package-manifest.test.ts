import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { MintError, type MintDiagnostic } from '../src/diagnostics.js'
import type { MintConfig } from '../src/config.js'
import { loadConfig } from '../src/config.js'
import type { AdapterPackageContribution } from '../src/adapters/types.js'
import {
  composePackageManifest,
  mergeAdapterPackageContributions,
  normalizeExports,
  normalizeMetadata,
  validateManifestReferences,
} from '../src/package-manifest.js'

const fixturePath = fileURLToPath(new URL('./fixtures/manifests/metadata-source.json', import.meta.url))
const metadataSource = JSON.parse(readFileSync(fixturePath, 'utf8')) as Record<string, unknown>
const metadataMint = {
  npm: '@bubstack/moe-example',
  version: '1.2.3',
  description: 'Caf\u00e9 plugin\n  keeps intentional spacing',
  author: { name: 'Ada Lovelace', email: 'ada@example.com', url: 'https://example.com/ada' },
  license: 'MIT',
  repository: 'https://github.com/example/moe-example',
  homepage: 'https://example.com/moe-example',
  keywords: ['Mint', 'mint', 'plugin'],
}

const composeConfig = {
  source: 'packages/example/mint/example.yaml',
  name: 'moe-example',
  version: metadataMint.version,
  description: metadataMint.description,
  author: metadataMint.author,
  license: metadataMint.license,
  repository: metadataMint.repository,
  homepage: metadataMint.homepage,
  keywords: metadataMint.keywords,
  bootstrap: { kind: 'none' },
  components: { skills: 'skills', commands: 'commands', agents: 'agents', hooks: 'hooks/hooks.json', mcp: '.mcp.json' },
  harnesses: { exclude: [], settings: {} },
  distribution: { npm: metadataMint.npm },
  artifact: { payloads: [] },
  targets: {} as MintConfig['targets'],
  importedWorks: [],
} satisfies MintConfig

const completeArtifactPaths = new Set([
  '.codex-plugin/plugin.json',
  '.opencode/plugins/moe-example.js',
  '.pi/extensions/moe-example.ts',
  'bin/cli.js',
  'dist/index.d.ts',
  'dist/index.js',
  'dist/internal.js',
  'dist/register.js',
  'skills/remember/SKILL.md',
])

function compose(
  sourcePatch: Readonly<Record<string, unknown>> = {},
  contributions: readonly AdapterPackageContribution[] = [],
  artifactPaths: ReadonlySet<string> = completeArtifactPaths,
  releaseVersions: Readonly<Record<string, string>> = {},
): Readonly<Record<string, unknown>> {
  return composePackageManifest({
    source: { ...metadataSource, ...sourcePatch },
    config: composeConfig,
    contributions,
    artifactPaths,
    registryUrl: 'https://registry.npmjs.org/publish?ignored=true',
    releaseVersions,
  })
}

function expectFailure(run: () => unknown, diagnostic: Record<string, unknown>): MintDiagnostic {
  try {
    run()
    expect.unreachable('expected package-manifest validation to fail')
  } catch (error) {
    if (!(error instanceof MintError)) throw error
    expect(error).toMatchObject({ diagnostic })
    return error.diagnostic
  }
  throw new Error('unreachable')
}

describe('normalizeMetadata', () => {
  it('emits Mint metadata after approved source comparisons', () => {
    expect(normalizeMetadata(metadataSource, {
      npm: ' @bubstack/moe-example ',
      version: ' 1.2.3 ',
      description: 'Cafe\u0301 plugin\r\n  keeps intentional spacing',
      author: { name: ' Ada Lovelace ', email: 'ADA@EXAMPLE.COM ', url: ' https://example.com/ada ' },
      license: ' MIT ',
      repository: ' git+https://github.com/example/moe-example.git/ ',
      homepage: ' https://example.com/moe-example/ ',
        keywords: ['Mint', 'mint', 'Mint', 'plugin'],
    })).toEqual({
      name: '@bubstack/moe-example',
      version: '1.2.3',
      description: 'Caf\u00e9 plugin\n  keeps intentional spacing',
      author: { name: 'Ada Lovelace', email: 'ADA@EXAMPLE.COM', url: 'https://example.com/ada' },
      license: 'MIT',
      repository: 'https://github.com/example/moe-example',
      homepage: 'https://example.com/moe-example',
      keywords: ['Mint', 'mint', 'plugin'],
    })
  })

  it.each([
    ['npm name', { name: '@bubstack/other' }, { npm: '@bubstack/moe-example' }],
    ['version', { version: '9.9.9' }, { version: '1.2.3' }],
    ['SPDX license', { license: 'Apache-2.0' }, { license: 'MIT' }],
    ['description whitespace', { description: 'Cafe\u0301 plugin\r\n keeps intentional spacing' }, { description: 'Caf\u00e9 plugin\n  keeps intentional spacing' }],
    ['author identity', { author: { name: 'Grace Hopper', email: 'ada@example.com', url: 'https://example.com/ada' } }, { author: { name: 'Ada Lovelace', email: 'ADA@example.com', url: 'https://example.com/ada' } }],
    ['repository', { repository: 'https://github.com/example/other' }, { repository: 'https://github.com/example/moe-example' }],
    ['homepage', { homepage: 'https://example.com/other' }, { homepage: 'https://example.com/moe-example' }],
    ['keyword casing', { keywords: ['mint', 'plugin'] }, { keywords: ['Mint', 'plugin'] }],
  ])('rejects a mismatched %s', (_name, sourcePatch, mintPatch) => {
    expectFailure(() => normalizeMetadata(
      { ...metadataSource, ...sourcePatch },
      { ...metadataMint, ...mintPatch },
    ), { code: 'PACKAGE_METADATA_MISMATCH' })
  })

  it('rejects string authors and non-string keyword entries', () => {
    expectFailure(() => normalizeMetadata(
      { ...metadataSource, author: 'Ada <ada@example.com>' },
      metadataMint,
    ), { code: 'PACKAGE_METADATA_INVALID', field: 'author' })
    expectFailure(() => normalizeMetadata(
      { ...metadataSource, keywords: ['Mint', 1] },
      metadataMint,
    ), { code: 'PACKAGE_METADATA_INVALID', field: 'keywords' })
  })

  it.each([
    ['git suffix before query', 'git+https://github.com/example/moe-example.git?ref=v1', 'https://github.com/example/moe-example?ref=v1'],
    ['git slash suffix before query', 'https://github.com/example/moe-example.git/?ref=v1', 'https://github.com/example/moe-example?ref=v1'],
  ])('normalizes repository suffixes without losing a query: %s', (_name, sourceRepository, repository) => {
    expect(normalizeMetadata(
      { ...metadataSource, repository: sourceRepository },
      { ...metadataMint, repository },
    ).repository).toBe('https://github.com/example/moe-example?ref=v1')
  })
})

describe('normalizeExports', () => {
  it('synthesizes a canonical root export from main and types', () => {
    expect(normalizeExports({ main: 'dist/index.js', types: 'types/index.d.ts' })).toEqual({
      '.': { types: './types/index.d.ts', default: './dist/index.js' },
    })
  })

  it('canonicalizes the package root target to ./', () => {
    expect(normalizeExports({ main: '.', types: '.' })).toEqual({
      '.': { types: './', default: './' },
    })
  })

  it.each([
    ['whitespace-only', '   '],
    ['parent traversal', '../outside.js'],
    ['nested parent traversal', 'dist/../outside.js'],
    ['absolute path', '/outside.js'],
    ['URL-like target', 'https://example.com/index.js'],
    ['backslash path', 'dist\\index.js'],
  ])('rejects an invalid synthesized main target: %s', (_name, main) => {
    expectFailure(() => normalizeExports({ main }), {
      code: 'PACKAGE_EXPORTS_INVALID_SHAPE', field: 'main',
    })
  })

  it('rejects an invalid synthesized types target with the field context', () => {
    expectFailure(() => normalizeExports({ main: './index.js', types: '../outside.d.ts' }), {
      code: 'PACKAGE_EXPORTS_INVALID_SHAPE', field: 'types',
    })
  })

  it('leaves absent exports absent when main is absent', () => {
    expect(normalizeExports({ types: './types/index.d.ts' })).toEqual({})
  })

  it('wraps string and root-condition exports without rewriting source targets', () => {
    expect(normalizeExports({ exports: '.' })).toEqual({ '.': '.' })
    expect(normalizeExports({ exports: { types: './types.d.ts', import: './esm.js', default: './index.js' } })).toEqual({
      '.': { types: './types.d.ts', import: './esm.js', default: './index.js' },
    })
  })

  it('preserves source-owned root and unrelated subpaths', () => {
    expect(normalizeExports({
      exports: { '.': './index.js', './feature': './feature.js', './server': './.opencode/plugins/moe.js' },
    })).toEqual({
      '.': './index.js',
      './feature': './feature.js',
      './server': './.opencode/plugins/moe.js',
    })
  })

  it('rejects mixed, array, and scalar export shapes', () => {
    expectFailure(() => normalizeExports({ exports: { import: './esm.js', './feature': './feature.js' } }), { code: 'PACKAGE_EXPORTS_MIXED_SHAPE' })
    expectFailure(() => normalizeExports({ exports: ['./index.js'] }), { code: 'PACKAGE_EXPORTS_INVALID_SHAPE' })
    expectFailure(() => normalizeExports({ exports: 42 }), { code: 'PACKAGE_EXPORTS_INVALID_SHAPE' })
  })
})

describe('mergeAdapterPackageContributions', () => {
  it('adds the approved Pi namespace and OpenCode server after root normalization', () => {
    expect(mergeAdapterPackageContributions(
      normalizeExports({ main: './dist/index.js', types: './dist/index.d.ts' }),
      [
        { owner: 'pi', pi: { extensions: ['./.pi/extensions/moe.ts'], skills: ['./skills'] } },
        { owner: 'opencode', exports: { './server': './.opencode/plugins/moe.js' } },
      ],
    )).toEqual({
      pi: { extensions: ['./.pi/extensions/moe.ts'], skills: ['./skills'] },
      exports: {
        '.': { types: './dist/index.d.ts', default: './dist/index.js' },
        './server': './.opencode/plugins/moe.js',
      },
    })
  })

  it('accepts an equal source-owned server target', () => {
    expect(mergeAdapterPackageContributions(
      normalizeExports({ exports: { '.': './index.js', './server': './.opencode/plugins/moe.js' } }),
      [{ owner: 'opencode', exports: { './server': './.opencode/plugins/moe.js' } }],
    ).exports['./server']).toBe('./.opencode/plugins/moe.js')
  })

  it.each([
    ['already canonical', './.opencode/plugins/moe.js', './.opencode/plugins/moe.js'],
    ['unprefixed local path', '.opencode/plugins/moe.js', './.opencode/plugins/moe.js'],
    ['package root', '.', './'],
  ])('normalizes an OpenCode server target: %s', (_name, server, expected) => {
    expect(mergeAdapterPackageContributions({}, [
      { owner: 'opencode', exports: { './server': server } },
    ]).exports['./server']).toBe(expected)
  })

  it.each([
    ['empty', ''],
    ['whitespace-only', '  '],
    ['parent traversal', '../server.js'],
    ['nested parent traversal', 'dist/../server.js'],
    ['absolute path', '/server.js'],
    ['URL-like target', 'https://example.com/server.js'],
    ['backslash path', 'dist\\server.js'],
  ])('rejects an invalid OpenCode server target: %s', (_name, server) => {
    expectFailure(() => mergeAdapterPackageContributions({}, [
      { owner: 'opencode', exports: { './server': server } },
    ]), {
      code: 'PACKAGE_EXPORTS_INVALID_SHAPE', field: 'exports./server',
    })
  })

  it('compares a canonicalized OpenCode target with the source-owned server export', () => {
    expect(mergeAdapterPackageContributions(
      { './server': './.opencode/plugins/moe.js' },
      [{ owner: 'opencode', exports: { './server': '.opencode/plugins/moe.js' } }],
    ).exports['./server']).toBe('./.opencode/plugins/moe.js')
  })

  it('identifies both OpenCode emissions when their server targets disagree', () => {
    const error = expectFailure(() => mergeAdapterPackageContributions({}, [
      { owner: 'opencode', exports: { './server': './first.js' } },
      { owner: 'opencode', exports: { './server': './second.js' } },
    ]), {
      code: 'PACKAGE_MANIFEST_COLLISION',
      owners: ['opencode', 'opencode'],
    })
    expect(error.owners).toEqual(['opencode', 'opencode'])
  })

  it.each([
    ['an unequal source-owned server', normalizeExports({ exports: { './server': './other.js' } }), [{ owner: 'opencode', exports: { './server': './.opencode/plugins/moe.js' } }], ['source', 'opencode']],
    ['an unauthorized owner', {}, [{ owner: 'cursor', pi: {} }], ['cursor', 'field-policy']],
    ['an unauthorized namespace', {}, [{ owner: 'pi', exports: { './server': './server.js' } }], ['pi', 'exports']],
    ['an unauthorized export key', {}, [{ owner: 'opencode', exports: { '.': './index.js' } }], ['opencode', 'exports']],
    ['an unclassified field', {}, [{ owner: 'pi', pi: {}, unexpected: true }], ['pi', 'field-policy']],
  ])('reports complete collision owners for %s', (_name, exports, contributions, owners) => {
    const error = expectFailure(() => mergeAdapterPackageContributions(exports, contributions as readonly AdapterPackageContribution[]), {
      code: 'PACKAGE_MANIFEST_COLLISION', source: 'package-manifest', field: expect.any(String),
    })
    expect(error.owners).toEqual(owners)
  })

  it('identifies both Pi emissions when their metadata disagrees', () => {
    const error = expectFailure(() => mergeAdapterPackageContributions({}, [
      { owner: 'pi', pi: { extensions: ['./first.ts'] } },
      { owner: 'pi', pi: { extensions: ['./second.ts'] } },
    ]), {
      code: 'PACKAGE_MANIFEST_COLLISION', owners: ['pi', 'pi'],
    })
    expect(error.owners).toEqual(['pi', 'pi'])
  })

  it.each([
    ['null', null],
    ['array', []],
    ['scalar', 'pi'],
    ['missing owner', { pi: {} }],
    ['non-string owner', { owner: 42, pi: {} }],
  ])('rejects a malformed contribution entry: %s', (_name, contribution) => {
    const error = expectFailure(() => mergeAdapterPackageContributions({}, [contribution] as unknown as readonly AdapterPackageContribution[]), {
      code: 'PACKAGE_MANIFEST_COLLISION', source: 'package-manifest', field: expect.any(String),
    })
    expect(error.owners).toEqual(['invalid-contribution', 'field-policy'])
  })

  it('deep-clones nested source exports and Pi metadata before returning', () => {
    const sourceExports = {
      '.': { import: { node: './node.js' }, default: './index.js' },
    }
    const pi = { extensions: ['./.pi/extensions/moe.ts'], nested: { enabled: true } }
    const result = mergeAdapterPackageContributions(sourceExports, [{ owner: 'pi', pi }])

    const sourceRoot = sourceExports['.'] as { import: { node: string } }
    sourceRoot.import.node = './mutated.js'
    pi.extensions[0] = './mutated.ts'
    pi.nested.enabled = false

    expect(result).toEqual({
      exports: { '.': { import: { node: './node.js' }, default: './index.js' } },
      pi: { extensions: ['./.pi/extensions/moe.ts'], nested: { enabled: true } },
    })
  })
})

describe('composePackageManifest', () => {
  it('preserves every version-1 runtime field and emits compositor-owned fields', () => {
    const sourceRuntime = {
      type: 'module',
      main: './dist/index.js',
      exports: { '.': { types: './dist/index.d.ts', import: './dist/index.js', default: 'dependency/entry' } },
      imports: { '#internal': './dist/internal.js', '#external': 'dependency/subpath' },
      types: './dist/index.d.ts',
      bin: { 'moe-example': './bin/cli.js' },
      engines: { node: '>=24' },
      os: ['darwin', 'linux'],
      cpu: ['arm64', 'x64'],
      sideEffects: ['./dist/register.js'],
      dependencies: { dependency: '^1.0.0' },
      optionalDependencies: { optional: '^2.0.0' },
      peerDependencies: { peer: '^3.0.0' },
      peerDependenciesMeta: { peer: { optional: true } },
    }

    const manifest = compose(sourceRuntime)

    expect(manifest).toEqual({
      name: '@bubstack/moe-example',
      version: '1.2.3',
      description: 'Café plugin\n  keeps intentional spacing',
      author: { name: 'Ada Lovelace', email: 'ada@example.com', url: 'https://example.com/ada' },
      license: 'MIT',
      repository: 'https://github.com/example/moe-example',
      homepage: 'https://example.com/moe-example',
      keywords: ['Mint', 'mint', 'plugin'],
      ...sourceRuntime,
      files: [
        '.codex-plugin/plugin.json',
        '.moe/artifact.json',
        '.opencode/plugins/moe-example.js',
        '.pi/extensions/moe-example.ts',
        'bin/cli.js',
        'dist/index.d.ts',
        'dist/index.js',
        'dist/internal.js',
        'dist/register.js',
        'skills/remember/SKILL.md',
      ],
      publishConfig: { access: 'public', registry: 'https://registry.npmjs.org' },
    })
  })

  it.each([
    ['scripts', { prepack: 'exfiltrate' }],
    ['devDependencies', { secret: '1.0.0' }],
    ['private', true],
    ['workspaces', ['packages/*']],
    ['packageManager', 'pnpm@11.23.0'],
    ['overrides', { dependency: '0.0.0' }],
    ['pnpm', { onlyBuiltDependencies: ['dependency'] }],
  ])('does not inherit source field %s', (field, value) => {
    const manifest = compose({ [field]: value, main: './dist/index.js' })
    expect(manifest).not.toHaveProperty(field)
  })

  it('replaces source files and publishConfig with compositor and platform authority', () => {
    expect(compose({
      files: ['source-only'],
      publishConfig: { access: 'restricted', registry: 'https://untrusted.example' },
    })).toMatchObject({
      files: expect.not.arrayContaining(['source-only']),
      publishConfig: { access: 'public', registry: 'https://registry.npmjs.org' },
    })
  })

  it.each([
    ['bundledDependencies', ['dependency']],
    ['bundleDependencies', ['dependency']],
    ['unclassifiedField', { smuggled: true }],
    ['pi', { extensions: ['./foreign.ts'] }],
  ])('rejects source field %s because it has no source authority', (field, value) => {
    expectFailure(() => compose({ [field]: value }), {
      code: field === 'bundledDependencies' || field === 'bundleDependencies'
        ? 'PACKAGE_BUNDLED_DEPENDENCIES_FORBIDDEN'
        : 'PACKAGE_MANIFEST_FIELD_UNCLASSIFIED',
      field,
    })
  })

  it('composes normalized exports with Pi and OpenCode contributions', () => {
    expect(compose(
      { main: './dist/index.js', types: './dist/index.d.ts', bin: './bin/cli.js' },
      [
        { owner: 'pi', pi: { extensions: ['./.pi/extensions/moe-example.ts'], skills: ['./skills'] } },
        { owner: 'opencode', exports: { './server': './.opencode/plugins/moe-example.js' } },
      ],
    )).toMatchObject({
      exports: {
        '.': { types: './dist/index.d.ts', default: './dist/index.js' },
        './server': './.opencode/plugins/moe-example.js',
      },
      pi: { extensions: ['./.pi/extensions/moe-example.ts'], skills: ['./skills'] },
    })
  })

  it('keeps package.json outside the exhaustive files allowlist', () => {
    expect(compose({}, [], new Set(['package.json', 'dist/index.js']))).toMatchObject({
      files: ['.moe/artifact.json', 'dist/index.js'],
    })
  })

  it.each([
    ['dependencies', 'workspace:*', '2.3.4'],
    ['dependencies', 'workspace:^', '^2.3.4'],
    ['dependencies', 'workspace:~', '~2.3.4'],
    ['optionalDependencies', 'workspace:*', '2.3.4'],
    ['optionalDependencies', 'workspace:^', '^2.3.4'],
    ['optionalDependencies', 'workspace:~', '~2.3.4'],
    ['peerDependencies', 'workspace:*', '2.3.4'],
    ['peerDependencies', 'workspace:^', '^2.3.4'],
    ['peerDependencies', 'workspace:~', '~2.3.4'],
  ] as const)('resolves %s %s from the release version map', (field, protocol, expected) => {
    expect(compose(
      { [field]: { '@bubstack/runtime': protocol } },
      [],
      completeArtifactPaths,
      { '@bubstack/runtime': '2.3.4' },
    )).toHaveProperty(`${field}.@bubstack/runtime`, expected)
  })

  it.each([
    ['missing release version', 'workspace:*', {}, 'PACKAGE_WORKSPACE_VERSION_MISSING'],
    ['invalid release version', 'workspace:*', { '@bubstack/runtime': 'next' }, 'PACKAGE_WORKSPACE_VERSION_INVALID'],
    ['unsupported relative form', 'workspace:../runtime', { '@bubstack/runtime': '2.3.4' }, 'PACKAGE_WORKSPACE_PROTOCOL_UNSUPPORTED'],
    ['unsupported explicit range', 'workspace:>=2', { '@bubstack/runtime': '2.3.4' }, 'PACKAGE_WORKSPACE_PROTOCOL_UNSUPPORTED'],
  ])('rejects %s', (_name, protocol, releaseVersions, code) => {
    expectFailure(() => compose(
      { dependencies: { '@bubstack/runtime': protocol } },
      [],
      completeArtifactPaths,
      releaseVersions,
    ), { code, field: 'dependencies.@bubstack/runtime' })
  })

  it('composes all six real platform source manifests while replacing their files and publishConfig', () => {
    const repoRoot = resolve(fileURLToPath(new URL('../../../', import.meta.url)))
    const packages = [
      ['backstory', 'moe-backstory.yaml'],
      ['core', 'moe.yaml'],
      ['crew', 'moe-crew.yaml'],
      ['glass', 'moe-glass.yaml'],
      ['memory', 'moe-memory.yaml'],
      ['statusline', 'moe-statusline.yaml'],
    ] as const

    for (const [packageName, configFile] of packages) {
      const packageRoot = resolve(repoRoot, 'packages', packageName)
      const source = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8')) as Record<string, unknown>
      const config = loadConfig(packageRoot, `mint/${configFile}`)
      const referencedFiles = new Set<string>(['README.md'])
      for (const field of ['main', 'types'] as const) {
        if (typeof source[field] === 'string') referencedFiles.add(source[field].replace(/^\.\//, ''))
      }
      if (typeof source.bin === 'string') referencedFiles.add(source.bin.replace(/^\.\//, ''))
      else if (source.bin && typeof source.bin === 'object') {
        for (const target of Object.values(source.bin)) {
          if (typeof target === 'string') referencedFiles.add(target.replace(/^\.\//, ''))
        }
      }

      const releaseVersions: Record<string, string> = {}
      for (const dir of readdirSync(resolve(repoRoot, 'packages'), { withFileTypes: true })) {
        if (!dir.isDirectory()) continue
        const pkgPath = resolve(repoRoot, 'packages', dir.name, 'package.json')
        try {
          const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as Record<string, unknown>
          if (typeof pkg.name === 'string' && typeof pkg.version === 'string') {
            releaseVersions[pkg.name] = pkg.version
          }
        } catch {}
      }

      const manifest = composePackageManifest({
        source,
        config,
        contributions: [],
        artifactPaths: referencedFiles,
        registryUrl: 'https://registry.npmjs.org',
        releaseVersions,
      })
      expect(manifest.files).toEqual(['.moe/artifact.json', ...referencedFiles].sort())
      expect(manifest.publishConfig).toEqual({ access: 'public', registry: 'https://registry.npmjs.org' })
    }
  })
})

describe('validateManifestReferences', () => {
  it.each([
    ['missing main', { main: './missing.js' }, completeArtifactPaths, 'main', 'PACKAGE_REFERENCE_MISSING'],
    ['escaping main', { main: '../outside.js' }, completeArtifactPaths, 'main', 'PACKAGE_REFERENCE_ESCAPE'],
    ['missing types', { types: './missing.d.ts' }, completeArtifactPaths, 'types', 'PACKAGE_REFERENCE_MISSING'],
    ['escaping types', { types: '/outside.d.ts' }, completeArtifactPaths, 'types', 'PACKAGE_REFERENCE_ESCAPE'],
    ['missing bin', { bin: { demo: './missing.js' } }, completeArtifactPaths, 'bin.demo', 'PACKAGE_REFERENCE_MISSING'],
    ['escaping bin', { bin: '../outside.js' }, completeArtifactPaths, 'bin', 'PACKAGE_REFERENCE_ESCAPE'],
    ['missing local export', { exports: { '.': './missing.js' } }, completeArtifactPaths, 'exports..', 'PACKAGE_REFERENCE_MISSING'],
    ['escaping local export', { exports: { '.': '../outside.js' } }, completeArtifactPaths, 'exports..', 'PACKAGE_REFERENCE_ESCAPE'],
    ['missing local import', { imports: { '#internal': './missing.js' } }, completeArtifactPaths, 'imports.#internal', 'PACKAGE_REFERENCE_MISSING'],
    ['escaping local import', { imports: { '#internal': '../outside.js' } }, completeArtifactPaths, 'imports.#internal', 'PACKAGE_REFERENCE_ESCAPE'],
    ['missing Pi extension', { pi: { extensions: ['./.pi/extensions/missing.ts'] } }, completeArtifactPaths, 'pi.extensions[0]', 'PACKAGE_REFERENCE_MISSING'],
    ['escaping Pi skills', { pi: { skills: ['../skills'] } }, completeArtifactPaths, 'pi.skills[0]', 'PACKAGE_REFERENCE_ESCAPE'],
    ['missing OpenCode server', { exports: { './server': './.opencode/plugins/missing.js' } }, completeArtifactPaths, 'exports../server', 'PACKAGE_REFERENCE_MISSING'],
    ['escaping OpenCode server', { exports: { './server': '../server.js' } }, completeArtifactPaths, 'exports../server', 'PACKAGE_REFERENCE_ESCAPE'],
    ['URL OpenCode server', { exports: { './server': 'https://example.com/server.js' } }, completeArtifactPaths, 'exports../server', 'PACKAGE_REFERENCE_ESCAPE'],
  ] as const)('rejects %s', (_name, manifest, paths, field, code) => {
    expectFailure(() => validateManifestReferences(manifest, paths), { code, field })
  })

  it('treats bare package targets as dependencies and accepts staged directories', () => {
    expect(() => validateManifestReferences({
      exports: { '.': { import: 'dependency/entry', default: './dist/index.js' } },
      imports: { '#external': '@scope/dependency/server', '#builtin': 'node:path' },
      pi: { skills: ['./skills'] },
    }, completeArtifactPaths)).not.toThrow()
  })

  it('allows only the reserved artifact manifest to remain pending', () => {
    expect(() => validateManifestReferences({ main: './.moe/artifact.json' }, new Set())).not.toThrow()
    expectFailure(() => validateManifestReferences({ main: './.moe/other.json' }, new Set()), {
      code: 'PACKAGE_REFERENCE_MISSING', field: 'main',
    })
  })

  it.each([
    ['main directory', { main: './dist' }, 'main'],
    ['types directory', { types: './dist' }, 'types'],
    ['bin directory', { bin: './dist' }, 'bin'],
    ['OpenCode server directory', { exports: { './server': './dist' } }, 'exports../server'],
  ])('rejects a descendant-only match for %s', (_name, manifest, field) => {
    expectFailure(() => validateManifestReferences(manifest, new Set(['dist/index.js'])), {
      code: 'PACKAGE_REFERENCE_MISSING', field,
    })
  })

  it.each([
    ['main', { main: './dist/*.js' }, 'main'],
    ['types', { types: './dist/*.d.ts' }, 'types'],
    ['bin', { bin: './dist/*.js' }, 'bin'],
    ['non-pattern export', { exports: { '.': './dist/*.js' } }, 'exports..'],
  ])('rejects wildcard syntax in non-pattern %s', (_name, manifest, field) => {
    expectFailure(() => validateManifestReferences(manifest, new Set(['dist/index.js', 'dist/index.d.ts'])), {
      code: 'PACKAGE_REFERENCE_PATTERN_INVALID', field,
    })
  })

  it.each([
    ['missing side-effect file', { sideEffects: ['./dist/missing.js'] }, 'PACKAGE_REFERENCE_MISSING'],
    ['escaping side-effect file', { sideEffects: ['../outside.js'] }, 'PACKAGE_REFERENCE_ESCAPE'],
    ['unmatched side-effect pattern', { sideEffects: ['./dist/*.css'] }, 'PACKAGE_REFERENCE_MISSING'],
  ])('rejects %s', (_name, manifest, code) => {
    expectFailure(() => validateManifestReferences(manifest, completeArtifactPaths), {
      code, field: 'sideEffects[0]',
    })
  })

  it('matches export, import, and side-effect patterns only against staged files', () => {
    expect(() => validateManifestReferences({
      exports: { './feature/*': './dist/features/*.js' },
      imports: { '#internal/*': './dist/internal/*.js' },
      sideEffects: ['./dist/**/*.css'],
    }, new Set([
      'dist/features/one.js',
      'dist/internal/two.js',
      'dist/styles/nested/theme.css',
    ]))).not.toThrow()
  })
})
