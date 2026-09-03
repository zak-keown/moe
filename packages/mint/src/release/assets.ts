
import { MintError } from '../diagnostics.js'
import {
  sha256,
  REGISTRY_PLUGIN_COUNT,
  type CandidateLockV1,
} from './catalog.js'

function assetError(code: string, message: string, action: string, cause?: unknown): never {
  throw new MintError({
    severity: 'error',
    code,
    source: 'release assets',
    message,
    action,
  }, { cause })
}

export interface ChecksumRow {
  hash: string
  filename: string
}

export function renderChecksumFile(
  rows: readonly ChecksumRow[],
): string {
  return rows.map((row) => `${row.hash}  ${row.filename}\n`).join('')
}

export function parseChecksumFile(content: string): readonly ChecksumRow[] {
  const lines = content.split('\n').filter((line) => line.length > 0)
  return lines.map((line) => {
    const match = /^([0-9a-f]{64})  (.+)$/.exec(line)
    if (match === null) {
      assetError('ASSET_CHECKSUM_INVALID', `invalid checksum line: "${line}"`, 'Use lowercase hex SHA-256 followed by two spaces and a filename.')
    }
    return { hash: match[1]!, filename: match[2]! }
  })
}

export function buildTarballChecksumRows(
  plugins: readonly { filename: string; sha256: string }[],
  algorithm: 'sha256' | 'sha512',
  pluginHashes: ReadonlyMap<string, { sha256: string; sha512: string }>,
): readonly ChecksumRow[] {
  if (plugins.length !== REGISTRY_PLUGIN_COUNT) {
    assetError('ASSET_CHECKSUM_COUNT', `checksum files must contain exactly ${REGISTRY_PLUGIN_COUNT} tarball rows`, 'Include all six registry plugin tarballs.')
  }
  return plugins.map((plugin) => {
    const hashes = pluginHashes.get(plugin.filename)
    if (hashes === undefined) {
      assetError('ASSET_CHECKSUM_MISSING', `missing hash for tarball "${plugin.filename}"`, 'Provide hashes for all six tarballs.')
    }
    return {
      hash: algorithm === 'sha256' ? hashes.sha256 : hashes.sha512,
      filename: plugin.filename,
    }
  })
}

export function validateChecksumFile(
  content: string,
  expectedTarballs: readonly { filename: string; sha256: string }[],
): void {
  const rows = parseChecksumFile(content)
  if (rows.length !== REGISTRY_PLUGIN_COUNT) {
    assetError('ASSET_CHECKSUM_COUNT', `checksum file must contain exactly ${REGISTRY_PLUGIN_COUNT} rows`, 'Include only the six registry plugin tarballs.')
  }
  const seen = new Set<string>()
  for (const [index, row] of rows.entries()) {
    if (seen.has(row.filename)) {
      assetError('ASSET_CHECKSUM_DUPLICATE', `duplicate filename "${row.filename}" in checksum file`, 'Use unique filenames.')
    }
    seen.add(row.filename)
    const expected = expectedTarballs[index]
    if (expected === undefined || row.filename !== expected.filename) {
      assetError('ASSET_CHECKSUM_ORDER', 'checksum file entries must be in registry order', 'List tarballs in the same order as the registry plugin list.')
    }
  }
}

export interface ReleaseAssetRecord {
  name: string
  bytes: number
  sha256: string
  kind: 'tarball' | 'bundle-inventory' | 'checksums' | 'catalog'
}

export function buildReleaseAssetRecords(
  tarballs: readonly { filename: string; bytes: number; sha256: string }[],
  bundleInventories: readonly { filename: string; content: string }[],
  sha256sumsContent: string,
  sha512sumsContent: string,
  catalogContent: string,
): readonly ReleaseAssetRecord[] {
  const records: ReleaseAssetRecord[] = []

  for (const tarball of tarballs) {
    records.push({
      name: tarball.filename,
      bytes: tarball.bytes,
      sha256: tarball.sha256,
      kind: 'tarball',
    })
  }

  for (const inventory of bundleInventories) {
    const bytes = Buffer.byteLength(inventory.content, 'utf8')
    records.push({
      name: inventory.filename,
      bytes,
      sha256: sha256(inventory.content),
      kind: 'bundle-inventory',
    })
  }

  const sha256bytes = Buffer.byteLength(sha256sumsContent, 'utf8')
  records.push({
    name: 'SHA256SUMS',
    bytes: sha256bytes,
    sha256: sha256(sha256sumsContent),
    kind: 'checksums',
  })

  const sha512bytes = Buffer.byteLength(sha512sumsContent, 'utf8')
  records.push({
    name: 'SHA512SUMS',
    bytes: sha512bytes,
    sha256: sha256(sha512sumsContent),
    kind: 'checksums',
  })

  const catalogBytes = Buffer.byteLength(catalogContent, 'utf8')
  records.push({
    name: catalogAssetName(catalogContent),
    bytes: catalogBytes,
    sha256: sha256(catalogContent),
    kind: 'catalog',
  })

  return records
}

function catalogAssetName(content: string): string {
  try {
    const parsed = JSON.parse(content) as { platform_version?: string }
    if (typeof parsed.platform_version === 'string') {
      return `moe-platform-v${parsed.platform_version}.json`
    }
  } catch { /* fall through */ }
  return 'moe-platform-catalog.json'
}

export function verifyLockAssets(
  lock: CandidateLockV1,
  actualAssets: ReadonlyMap<string, { bytes: number; sha256: string }>,
): void {
  for (const expected of lock.release_assets) {
    if (expected.kind === 'tarball') continue
    const actual = actualAssets.get(expected.name)
    if (actual === undefined) {
      assetError('ASSET_LOCK_MISSING', `release asset "${expected.name}" is missing`, 'Upload all lock-bound assets before publication.')
    }
    if (actual.sha256 !== expected.sha256) {
      assetError('ASSET_LOCK_MISMATCH', `release asset "${expected.name}" SHA-256 does not match the lock`, 'Use exact lock-bound bytes for every release asset.')
    }
    if (actual.bytes !== expected.bytes) {
      assetError('ASSET_LOCK_MISMATCH', `release asset "${expected.name}" size does not match the lock`, 'Use exact lock-bound bytes for every release asset.')
    }
  }
}

export function verifyTarballAssets(
  lock: CandidateLockV1,
  actualTarballs: ReadonlyMap<string, { bytes: number; sha256: string; integrity: string }>,
): void {
  const tarballRecords = lock.release_assets.filter((a) => a.kind === 'tarball')
  if (tarballRecords.length !== REGISTRY_PLUGIN_COUNT) {
    assetError('ASSET_TARBALL_COUNT', `lock must record exactly ${REGISTRY_PLUGIN_COUNT} tarballs`, 'Include all six registry plugin tarballs in the release lock.')
  }
  for (const expected of tarballRecords) {
    const actual = actualTarballs.get(expected.name)
    if (actual === undefined) {
      assetError('ASSET_TARBALL_MISSING', `tarball "${expected.name}" is missing`, 'Provide all six tarballs.')
    }
    if (actual.sha256 !== expected.sha256) {
      assetError('ASSET_TARBALL_MISMATCH', `tarball "${expected.name}" SHA-256 does not match the lock`, 'Use the exact tarball bytes recorded in the release lock.')
    }
    if (actual.bytes !== expected.bytes) {
      assetError('ASSET_TARBALL_MISMATCH', `tarball "${expected.name}" size does not match the lock`, 'Use the exact tarball bytes recorded in the release lock.')
    }
  }
}
