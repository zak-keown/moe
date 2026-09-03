import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { MintError, type MintDiagnostic } from '../src/diagnostics.js'
import {
  mergeAdapterPackageContributions,
  normalizeExports,
  normalizeMetadata,
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
    const error = expectFailure(() => mergeAdapterPackageContributions(exports, contributions), {
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
    const error = expectFailure(() => mergeAdapterPackageContributions({}, [contribution]), {
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
