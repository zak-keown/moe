import { describe, it, expect } from 'vitest'
import {
  renderChecksumFile,
  parseChecksumFile,
  validateChecksumFile,
  buildReleaseAssetRecords,
  verifyLockAssets,
  verifyTarballAssets,
  type ChecksumRow,
} from '../src/release/assets.js'
import { sha256, REGISTRY_PLUGIN_COUNT, type CandidateLockV1 } from '../src/release/catalog.js'

function fakeTarballs(count = REGISTRY_PLUGIN_COUNT) {
  return Array.from({ length: count }, (_, i) => ({
    filename: `bubstack-moe-plugin-${i}-0.1.5.tgz`,
    bytes: 1024 + i,
    sha256: sha256(`tarball-${i}`),
  }))
}

describe('renderChecksumFile', () => {
  it('renders lowercase hex + two-space separator + filename', () => {
    const rows: ChecksumRow[] = [
      { hash: 'a'.repeat(64), filename: 'foo.tgz' },
      { hash: 'b'.repeat(64), filename: 'bar.tgz' },
    ]
    const result = renderChecksumFile(rows)
    expect(result).toBe(`${'a'.repeat(64)}  foo.tgz\n${'b'.repeat(64)}  bar.tgz\n`)
  })
})

describe('parseChecksumFile', () => {
  it('parses valid checksum lines', () => {
    const content = `${'a'.repeat(64)}  foo.tgz\n${'b'.repeat(64)}  bar.tgz\n`
    const rows = parseChecksumFile(content)
    expect(rows).toHaveLength(2)
    expect(rows[0]!.hash).toBe('a'.repeat(64))
    expect(rows[0]!.filename).toBe('foo.tgz')
  })

  it('rejects invalid lines', () => {
    expect(() => parseChecksumFile('bad line\n')).toThrow()
  })

  it('handles empty content', () => {
    expect(parseChecksumFile('')).toHaveLength(0)
  })
})

describe('validateChecksumFile', () => {
  it('accepts valid six-tarball checksum file in registry order', () => {
    const tarballs = fakeTarballs()
    const rows = tarballs.map((t) => ({ hash: t.sha256, filename: t.filename }))
    const content = renderChecksumFile(rows)
    expect(() => validateChecksumFile(content, tarballs)).not.toThrow()
  })

  it('rejects wrong row count', () => {
    const tarballs = fakeTarballs()
    const rows = tarballs.slice(0, 3).map((t) => ({ hash: t.sha256, filename: t.filename }))
    const content = renderChecksumFile(rows)
    expect(() => validateChecksumFile(content, tarballs)).toThrow(/exactly/)
  })

  it('rejects duplicate filenames', () => {
    const tarballs = fakeTarballs()
    const rows = tarballs.map((t) => ({ hash: t.sha256, filename: t.filename }))
    rows[1] = { ...rows[0]! }
    const content = renderChecksumFile(rows)
    expect(() => validateChecksumFile(content, tarballs)).toThrow(/duplicate/)
  })

  it('rejects wrong order', () => {
    const tarballs = fakeTarballs()
    const rows = tarballs.map((t) => ({ hash: t.sha256, filename: t.filename }))
    const swapped = [...rows]
    ;[swapped[0], swapped[1]] = [swapped[1]!, swapped[0]!]
    const content = renderChecksumFile(swapped)
    expect(() => validateChecksumFile(content, tarballs)).toThrow(/order/)
  })
})

describe('buildReleaseAssetRecords', () => {
  it('creates tarball + bundle-inventory + checksums + catalog records', () => {
    const tarballs = fakeTarballs()
    const inventories = tarballs.map((t) => ({
      filename: t.filename.replace('.tgz', '-bundle-inventory.json'),
      content: '{}',
    }))
    const records = buildReleaseAssetRecords(
      tarballs,
      inventories,
      'sha256sums content',
      'sha512sums content',
      '{"platform_version":"0.1.5-rc.1"}',
    )
    const tarballRecords = records.filter((r) => r.kind === 'tarball')
    const inventoryRecords = records.filter((r) => r.kind === 'bundle-inventory')
    const checksumRecords = records.filter((r) => r.kind === 'checksums')
    const catalogRecords = records.filter((r) => r.kind === 'catalog')
    expect(tarballRecords).toHaveLength(REGISTRY_PLUGIN_COUNT)
    expect(inventoryRecords).toHaveLength(REGISTRY_PLUGIN_COUNT)
    expect(checksumRecords).toHaveLength(2)
    expect(catalogRecords).toHaveLength(1)
    expect(catalogRecords[0]!.name).toBe('moe-platform-v0.1.5-rc.1.json')
  })
})

describe('verifyLockAssets', () => {
  it('passes when all non-tarball assets match', () => {
    const lock = {
      release_assets: [
        { name: 'SHA256SUMS', bytes: 10, sha256: 'a'.repeat(64), kind: 'checksums' as const },
        { name: 'foo.tgz', bytes: 100, sha256: 'b'.repeat(64), kind: 'tarball' as const },
      ],
    } as unknown as CandidateLockV1
    const actual = new Map([['SHA256SUMS', { bytes: 10, sha256: 'a'.repeat(64) }]])
    expect(() => verifyLockAssets(lock, actual)).not.toThrow()
  })

  it('rejects missing non-tarball asset', () => {
    const lock = {
      release_assets: [
        { name: 'SHA256SUMS', bytes: 10, sha256: 'a'.repeat(64), kind: 'checksums' as const },
      ],
    } as unknown as CandidateLockV1
    expect(() => verifyLockAssets(lock, new Map())).toThrow(/missing/)
  })

  it('rejects SHA-256 mismatch', () => {
    const lock = {
      release_assets: [
        { name: 'SHA256SUMS', bytes: 10, sha256: 'a'.repeat(64), kind: 'checksums' as const },
      ],
    } as unknown as CandidateLockV1
    const actual = new Map([['SHA256SUMS', { bytes: 10, sha256: 'b'.repeat(64) }]])
    expect(() => verifyLockAssets(lock, actual)).toThrow(/does not match/)
  })
})

describe('verifyTarballAssets', () => {
  it('passes when all six tarballs match', () => {
    const tarballs = fakeTarballs()
    const lock = {
      release_assets: tarballs.map((t) => ({
        name: t.filename,
        bytes: t.bytes,
        sha256: t.sha256,
        kind: 'tarball' as const,
      })),
    } as unknown as CandidateLockV1
    const actual = new Map(tarballs.map((t) => [t.filename, { bytes: t.bytes, sha256: t.sha256, integrity: `sha512-xxx` as const }]))
    expect(() => verifyTarballAssets(lock, actual)).not.toThrow()
  })

  it('rejects wrong tarball count', () => {
    const lock = {
      release_assets: [{ name: 'a.tgz', bytes: 10, sha256: 'a'.repeat(64), kind: 'tarball' as const }],
    } as unknown as CandidateLockV1
    expect(() => verifyTarballAssets(lock, new Map())).toThrow(/exactly/)
  })

  it('rejects missing tarball', () => {
    const tarballs = fakeTarballs()
    const lock = {
      release_assets: tarballs.map((t) => ({
        name: t.filename,
        bytes: t.bytes,
        sha256: t.sha256,
        kind: 'tarball' as const,
      })),
    } as unknown as CandidateLockV1
    expect(() => verifyTarballAssets(lock, new Map())).toThrow(/missing/)
  })
})
