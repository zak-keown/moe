import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
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

function expectFailure(run: () => unknown, diagnostic: Record<string, unknown>): void {
  try {
    run()
    expect.unreachable('expected package-manifest validation to fail')
  } catch (error) {
    expect(error).toMatchObject({ diagnostic })
  }
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
    expectFailure(() => mergeAdapterPackageContributions({}, [
      { owner: 'opencode', exports: { './server': './first.js' } },
      { owner: 'opencode', exports: { './server': './second.js' } },
    ]), {
      code: 'PACKAGE_MANIFEST_COLLISION',
      owners: ['opencode', 'opencode'],
    })
  })

  it.each([
    ['an unequal source-owned server', normalizeExports({ exports: { './server': './other.js' } }), [{ owner: 'opencode', exports: { './server': './.opencode/plugins/moe.js' } }]],
    ['an unauthorized owner', {}, [{ owner: 'cursor', pi: {} }]],
    ['an unauthorized namespace', {}, [{ owner: 'pi', exports: { './server': './server.js' } }]],
    ['an unauthorized export key', {}, [{ owner: 'opencode', exports: { '.': './index.js' } }]],
    ['an unclassified field', {}, [{ owner: 'pi', pi: {}, unexpected: true }]],
  ])('reports both owners for %s', (_name, exports, contributions) => {
    expectFailure(() => mergeAdapterPackageContributions(exports, contributions), {
      code: 'PACKAGE_MANIFEST_COLLISION', source: 'package-manifest', field: expect.any(String),
    })
  })
})
