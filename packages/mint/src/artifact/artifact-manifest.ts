import { createHash } from 'node:crypto'
import { constants, promises as fs } from 'node:fs'
import { join, resolve } from 'node:path'
import { MintError } from '../diagnostics.js'
import type { CapabilityId, TargetId } from '../vocabulary.js'
import {
  artifactCollisionKey,
  artifactPath,
  ArtifactPathError,
  compareArtifactPaths,
  type ArtifactPath,
} from './paths.js'

export interface ArtifactEntry {
  readonly path: string
  readonly size: number
  readonly sha256: string
  readonly mode: '0644' | '0755'
}

export interface ArtifactManifestV1 {
  readonly schema: 1
  readonly plugin: { readonly id: string; readonly package: string; readonly version: string }
  readonly files: readonly ArtifactEntry[]
  readonly tree_sha256: string
  readonly targets: Readonly<Partial<Record<TargetId, {
    readonly emitted_capabilities: readonly CapabilityId[]
  }>>>
  readonly omitted_optional_payloads?: readonly string[]
}

const ARTIFACT_MANIFEST_PATH = '.moe/artifact.json'
const SHA256_RE = /^[0-9a-f]{64}$/

function manifestError(code: string, message: string, action: string, path?: string, cause?: unknown): MintError {
  return new MintError({
    severity: 'error',
    code,
    source: 'artifact tree',
    ...(path === undefined ? {} : { path }),
    message,
    action,
  }, { cause })
}

function checkedArtifactPath(value: string): ArtifactPath {
  if (value.includes('\0')) {
    throw manifestError(
      'ARTIFACT_PATH_INVALID',
      `artifact path "${value}" is invalid: path must not contain the NUL row delimiter`,
      'Use a path containing only Unicode scalar values and no NUL bytes.',
      value,
    )
  }
  if (/[\uD800-\uDFFF]/u.test(value)) {
    throw manifestError(
      'ARTIFACT_PATH_INVALID',
      `artifact path "${value}" is invalid: path must not contain an unpaired UTF-16 surrogate`,
      'Use a path containing only Unicode scalar values and no NUL bytes.',
      value,
    )
  }
  try {
    return artifactPath(value)
  } catch (error) {
    if (error instanceof ArtifactPathError) {
      throw manifestError(
        'ARTIFACT_PATH_INVALID',
        `artifact path "${value}" is invalid: ${error.reason}`,
        'Use normalized, relative, slash-separated UTF-8 paths without dot or parent segments.',
        value,
        error,
      )
    }
    throw error
  }
}

function assertEntry(entry: ArtifactEntry): ArtifactPath {
  const path = checkedArtifactPath(entry.path)
  if (!Number.isSafeInteger(entry.size) || entry.size < 0) {
    throw manifestError('ARTIFACT_SIZE_INVALID', `artifact entry "${path}" has invalid size ${entry.size}`, 'Use the exact non-negative raw byte length.', path)
  }
  if (!SHA256_RE.test(entry.sha256)) {
    throw manifestError('ARTIFACT_HASH_INVALID', `artifact entry "${path}" has an invalid SHA-256`, 'Use a 64-character lowercase hexadecimal SHA-256.', path)
  }
  if (entry.mode !== '0644' && entry.mode !== '0755') {
    throw manifestError('ARTIFACT_MODE_INVALID', `artifact entry "${path}" has invalid mode "${entry.mode}"`, 'Normalize regular files to 0644 or 0755 before manifest creation.', path)
  }
  return path
}

function assertUniquePaths(entries: readonly ArtifactEntry[]): void {
  const collisions = new Map<string, string>()
  for (const entry of entries) {
    const path = assertEntry(entry)
    const key = artifactCollisionKey(path)
    const previous = collisions.get(key)
    if (previous !== undefined) {
      throw manifestError(
        'ARTIFACT_PATH_COLLISION',
        `artifact paths "${previous}" and "${path}" collide after NFC normalization and Unicode case folding`,
        'Rename one path so every artifact entry has a unique NFC/case-fold key.',
        path,
      )
    }
    collisions.set(key, path)
  }
}

export function serializeTreeRow(entry: ArtifactEntry): Uint8Array {
  assertEntry(entry)
  return Buffer.from(`${entry.path}\0${entry.mode}\0${entry.size}\0${entry.sha256}\n`, 'utf8')
}

export function computeTreeDigest(entries: readonly ArtifactEntry[]): string {
  assertUniquePaths(entries)
  const ordered = [...entries].sort((left, right) => compareArtifactPaths(checkedArtifactPath(left.path), checkedArtifactPath(right.path)))
  const digest = createHash('sha256')
  for (const entry of ordered) digest.update(serializeTreeRow(entry))
  return digest.digest('hex')
}

function decodeUtf8Name(name: Buffer, parent: string): string {
  try {
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(name)
    if (!Buffer.from(decoded, 'utf8').equals(name)) throw new Error('filename does not round-trip as UTF-8')
    return decoded
  } catch (error) {
    throw manifestError(
      'ARTIFACT_PATH_INVALID',
      `artifact directory "${parent}" contains a filename that is not valid UTF-8`,
      'Rename the entry using a valid UTF-8 filename.',
      parent,
      error,
    )
  }
}

function normalizedMode(mode: number, path: ArtifactPath): '0644' | '0755' {
  const permissions = mode & 0o7777
  if (permissions === 0o644) return '0644'
  if (permissions === 0o755) return '0755'
  throw manifestError(
    'ARTIFACT_MODE_INVALID',
    `artifact entry "${path}" has mode ${permissions.toString(8).padStart(4, '0')}`,
    'Normalize regular files to 0644 or 0755 before manifest creation.',
    path,
  )
}

async function readRegularFile(absolute: string, path: ArtifactPath, initial: Awaited<ReturnType<typeof fs.lstat>>): Promise<Buffer> {
  if (!initial.isFile() || initial.isSymbolicLink()) {
    throw manifestError(
      'ARTIFACT_UNSAFE_FILE_TYPE',
      `artifact entry "${path}" is not a regular file`,
      'Remove symbolic links, devices, sockets, and named pipes from the artifact tree.',
      path,
    )
  }
  if (initial.nlink > 1) {
    throw manifestError('ARTIFACT_HARD_LINK', `artifact entry "${path}" has ${initial.nlink} hard links`, 'Copy the file so it has one independent filesystem link.', path)
  }

  let handle
  try {
    handle = await fs.open(absolute, constants.O_RDONLY | constants.O_NOFOLLOW)
    const before = await handle.stat()
    if (
      !before.isFile()
      || before.nlink > 1
      || before.dev !== initial.dev
      || before.ino !== initial.ino
      || before.mode !== initial.mode
      || before.size !== initial.size
      || before.mtimeMs !== initial.mtimeMs
      || before.ctimeMs !== initial.ctimeMs
    ) {
      throw manifestError('ARTIFACT_FILE_CHANGED', `artifact entry "${path}" changed while it was inspected`, 'Scan a stable artifact tree.', path)
    }
    normalizedMode(before.mode, path)
    const bytes = await handle.readFile()
    const after = await handle.stat()
    if (
      after.dev !== before.dev
      || after.ino !== before.ino
      || after.nlink !== before.nlink
      || after.mode !== before.mode
      || after.size !== before.size
      || after.mtimeMs !== before.mtimeMs
      || after.ctimeMs !== before.ctimeMs
      || bytes.byteLength !== after.size
    ) {
      throw manifestError('ARTIFACT_FILE_CHANGED', `artifact entry "${path}" changed while it was hashed`, 'Scan a stable artifact tree.', path)
    }
    return bytes
  } catch (error) {
    if (error instanceof MintError) throw error
    throw manifestError('ARTIFACT_READ_FAILED', `cannot safely read artifact entry "${path}"`, 'Ensure the artifact is readable and contains no symbolic links.', path, error)
  } finally {
    await handle?.close()
  }
}

export async function scanArtifact(root: string): Promise<readonly ArtifactEntry[]> {
  const absoluteRoot = resolve(root)
  let rootStats
  try {
    rootStats = await fs.lstat(absoluteRoot)
  } catch (error) {
    throw manifestError('ARTIFACT_READ_FAILED', `cannot inspect artifact root "${root}"`, 'Pass an existing readable artifact directory.', undefined, error)
  }
  if (!rootStats.isDirectory() || rootStats.isSymbolicLink()) {
    throw manifestError('ARTIFACT_UNSAFE_FILE_TYPE', 'artifact root must be a real directory', 'Pass a physical artifact directory, not a symbolic link.', root)
  }

  const entries: ArtifactEntry[] = []
  const collisions = new Map<string, ArtifactPath>()

  async function walk(absolute: string, parent: string): Promise<void> {
    let names: Buffer[]
    try {
      names = await fs.readdir(absolute, { encoding: 'buffer' }) as Buffer[]
    } catch (error) {
      throw manifestError('ARTIFACT_READ_FAILED', `cannot enumerate artifact directory "${parent || '.'}"`, 'Ensure the complete artifact tree is readable.', parent || undefined, error)
    }
    names.sort(Buffer.compare)
    for (const rawName of names) {
      const name = decodeUtf8Name(rawName, parent || '.')
      const logical = checkedArtifactPath(parent === '' ? name : `${parent}/${name}`)
      const collision = artifactCollisionKey(logical)
      const previous = collisions.get(collision)
      if (previous !== undefined) {
        throw manifestError(
          'ARTIFACT_PATH_COLLISION',
          `artifact paths "${previous}" and "${logical}" collide after NFC normalization and Unicode case folding`,
          'Rename one path so every artifact entry has a unique NFC/case-fold key.',
          logical,
        )
      }
      collisions.set(collision, logical)

      const absoluteChild = join(absolute, name)
      let stats
      try {
        stats = await fs.lstat(absoluteChild)
      } catch (error) {
        throw manifestError('ARTIFACT_READ_FAILED', `cannot inspect artifact entry "${logical}"`, 'Scan a stable, readable artifact tree.', logical, error)
      }
      if (stats.isDirectory() && !stats.isSymbolicLink()) {
        await walk(absoluteChild, logical)
        continue
      }
      if (!stats.isFile() || stats.isSymbolicLink()) {
        throw manifestError(
          'ARTIFACT_UNSAFE_FILE_TYPE',
          `artifact entry "${logical}" is not a regular file or directory`,
          'Remove symbolic links, devices, sockets, and named pipes from the artifact tree.',
          logical,
        )
      }
      const mode = normalizedMode(stats.mode, logical)
      const bytes = await readRegularFile(absoluteChild, logical, stats)
      if (logical === ARTIFACT_MANIFEST_PATH) continue
      entries.push({
        path: logical,
        size: bytes.byteLength,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        mode,
      })
    }
  }

  await walk(absoluteRoot, '')
  entries.sort((left, right) => compareArtifactPaths(checkedArtifactPath(left.path), checkedArtifactPath(right.path)))
  return entries
}
