import { createHash } from 'node:crypto'
import { constants, promises as fs } from 'node:fs'
import { join, resolve } from 'node:path'
import { z } from 'zod'
import { MintError } from '../diagnostics.js'
import { CAPABILITY_IDS, TARGET_IDS, type CapabilityId, type TargetId } from '../vocabulary.js'
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
  readonly mode: string
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

export interface ExpectedArtifactContext {
  readonly plugin: ArtifactManifestV1['plugin']
  readonly targets: ArtifactManifestV1['targets']
  readonly omitted_optional_payloads: readonly string[]
}

const ARTIFACT_MANIFEST_PATH = '.moe/artifact.json'
const SHA256_RE = /^[0-9a-f]{64}$/
const MODE_RE = /^0[0-7]{3}$/

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
  if (!MODE_RE.test(entry.mode)) {
    throw manifestError('ARTIFACT_MODE_INVALID', `artifact entry "${path}" has invalid mode "${entry.mode}"`, 'Use the exact four-digit regular-file permission mode from 0000 through 0777.', path)
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

/**
 * The mode recorded for an artifact entry: canonical, derived from the
 * executable bit alone.
 *
 * Recording the literal on-disk mode looks stricter, but it makes a committed
 * manifest unverifiable. Git stores exactly one permission bit, so a
 * checkout's remaining bits are whatever umask the clone ran under -- 0644 at
 * umask 022, 0666 at 000, 0600 at 077. Validating a committed artifact against
 * its committed manifest therefore fails on any host but the one that
 * generated it, and pack extraction normalizes to 0755/0644 regardless.
 *
 * Special bits are still rejected rather than normalized away: setuid on an
 * artifact entry is worth failing on, not quietly dropping.
 */
function exactMode(mode: number, path: ArtifactPath): string {
  const specialBits = mode & 0o7000
  if (specialBits !== 0) {
    throw manifestError(
      'ARTIFACT_MODE_INVALID',
      `artifact entry "${path}" has unsupported special mode bits ${specialBits.toString(8).padStart(4, '0')}`,
      'Remove setuid, setgid, and sticky bits from regular files before manifest creation.',
      path,
    )
  }
  return ((mode & 0o111) === 0 ? 0o644 : 0o755).toString(8).padStart(4, '0')
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
    exactMode(before.mode, path)
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
      const mode = exactMode(stats.mode, logical)
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

const pluginSchema = z.object({ id: z.string().min(1), package: z.string().min(1), version: z.string().min(1) }).strict()
const entrySchema = z.object({
  path: z.string().min(1),
  size: z.number().int().nonnegative(),
  sha256: z.string().regex(SHA256_RE),
  mode: z.string().regex(MODE_RE),
}).strict()
const emissionSchema = z.object({ emitted_capabilities: z.array(z.enum(CAPABILITY_IDS)) }).strict()
const manifestSchema = z.object({
  schema: z.literal(1),
  plugin: pluginSchema,
  files: z.array(entrySchema),
  tree_sha256: z.string().regex(SHA256_RE),
  targets: z.partialRecord(z.enum(TARGET_IDS), emissionSchema),
  omitted_optional_payloads: z.array(z.string().min(1)).optional(),
}).strict()

function canonicalStrings(values: readonly string[], label: string): string[] {
  const paths = values.map(checkedArtifactPath)
  assertUniquePaths(paths.map((path) => ({ path, size: 0, sha256: '0'.repeat(64), mode: '0644' })))
  const ordered = [...paths].sort(compareArtifactPaths)
  if (new Set(ordered).size !== ordered.length) {
    throw manifestError('ARTIFACT_MANIFEST_INVALID', `${label} contains a duplicate`, `List every ${label} value once.`)
  }
  return ordered
}

function canonicalTargets(targets: ArtifactManifestV1['targets']): ArtifactManifestV1['targets'] {
  const unknown = Object.keys(targets).find((target) => !TARGET_IDS.includes(target as TargetId))
  if (unknown !== undefined) throw manifestError('ARTIFACT_MANIFEST_INVALID', `unknown target "${unknown}"`, 'Use a target from the platform vocabulary.')
  const result: Partial<Record<TargetId, { emitted_capabilities: CapabilityId[] }>> = {}
  for (const target of TARGET_IDS) {
    const emission = targets[target]
    if (emission === undefined) continue
    const unique = new Set(emission.emitted_capabilities)
    if (unique.size !== emission.emitted_capabilities.length) {
      throw manifestError('ARTIFACT_MANIFEST_INVALID', `target "${target}" contains duplicate capabilities`, 'List each emitted capability once.')
    }
    for (const capability of unique) {
      if (!CAPABILITY_IDS.includes(capability)) throw manifestError('ARTIFACT_MANIFEST_INVALID', `unknown capability "${capability}"`, 'Use the capability vocabulary.')
    }
    result[target] = { emitted_capabilities: CAPABILITY_IDS.filter((capability) => unique.has(capability)) }
  }
  return result
}

function canonicalExpected(expected: ExpectedArtifactContext): ExpectedArtifactContext {
  const plugin = pluginSchema.parse(expected.plugin)
  return {
    plugin,
    targets: canonicalTargets(expected.targets),
    omitted_optional_payloads: canonicalStrings(expected.omitted_optional_payloads, 'optional payload omission'),
  }
}

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function assertCanonicalManifest(manifest: ArtifactManifestV1): void {
  try {
    assertUniquePaths(manifest.files)
  } catch (error) {
    throw manifestError('ARTIFACT_MANIFEST_INVALID', 'artifact manifest contains duplicate or colliding file rows', 'List every canonical artifact path exactly once.', undefined, error)
  }
  const orderedFiles = [...manifest.files].sort((left, right) => compareArtifactPaths(checkedArtifactPath(left.path), checkedArtifactPath(right.path)))
  if (!same(manifest.files, orderedFiles)) throw manifestError('ARTIFACT_MANIFEST_INVALID', 'artifact file rows are not in canonical order', 'Sort file rows by raw UTF-8 path bytes.')
  if (computeTreeDigest(manifest.files) !== manifest.tree_sha256) throw manifestError('ARTIFACT_MANIFEST_DIGEST_MISMATCH', 'artifact tree digest does not match its file rows', 'Regenerate the artifact manifest from the completed tree.')
  if (!same(manifest.targets, canonicalTargets(manifest.targets))) throw manifestError('ARTIFACT_MANIFEST_INVALID', 'artifact targets are not in canonical order', 'Order targets and capabilities by the shared vocabulary.')
  const omissions = canonicalStrings(manifest.omitted_optional_payloads ?? [], 'optional payload omission')
  if (!same(manifest.omitted_optional_payloads ?? [], omissions)) throw manifestError('ARTIFACT_MANIFEST_INVALID', 'optional payload omissions are not canonical', 'Sort unique canonical omission paths by raw UTF-8 bytes.')
}

export async function writeArtifactManifest(root: string, expected: ExpectedArtifactContext): Promise<ArtifactManifestV1> {
  const canonical = canonicalExpected(expected)
  const files = await scanArtifact(root)
  const manifest: ArtifactManifestV1 = {
    schema: 1,
    plugin: canonical.plugin,
    files,
    tree_sha256: computeTreeDigest(files),
    targets: canonical.targets,
    ...(canonical.omitted_optional_payloads.length === 0 ? {} : { omitted_optional_payloads: canonical.omitted_optional_payloads }),
  }
  await fs.mkdir(join(root, '.moe'), { recursive: true })
  let handle
  try {
    handle = await fs.open(join(root, ARTIFACT_MANIFEST_PATH), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
    await handle.writeFile(`${JSON.stringify(manifest, null, 2)}\n`)
    await handle.chmod(0o644)
  } catch (error) {
    throw manifestError('ARTIFACT_MANIFEST_WRITE_FAILED', 'cannot exclusively write the artifact manifest', 'Use a fresh artifact tree.', ARTIFACT_MANIFEST_PATH, error)
  } finally {
    await handle?.close()
  }
  return manifest
}

export async function readArtifactManifest(root: string): Promise<ArtifactManifestV1> {
  try {
    const parsed = manifestSchema.parse(JSON.parse(await fs.readFile(join(root, ARTIFACT_MANIFEST_PATH), 'utf8'))) as ArtifactManifestV1
    assertCanonicalManifest(parsed)
    return parsed
  } catch (error) {
    if (error instanceof MintError) throw error
    throw manifestError('ARTIFACT_MANIFEST_INVALID', 'artifact manifest is not valid schema-1 canonical JSON', 'Regenerate the artifact manifest.', ARTIFACT_MANIFEST_PATH, error)
  }
}

export async function validateArtifact(root: string, expected: ExpectedArtifactContext): Promise<void> {
  const [manifest, files] = await Promise.all([readArtifactManifest(root), scanArtifact(root)])
  if (!same(manifest.files, files)) throw manifestError('ARTIFACT_MANIFEST_FILES_MISMATCH', 'artifact manifest file rows differ from the completed tree', 'Regenerate the manifest after all artifact files are finalized.')
  if (manifest.tree_sha256 !== computeTreeDigest(files)) throw manifestError('ARTIFACT_MANIFEST_DIGEST_MISMATCH', 'artifact tree digest differs from the completed tree', 'Regenerate the manifest after all artifact files are finalized.')
  const canonical = canonicalExpected(expected)
  if (!same(manifest.plugin, canonical.plugin)) throw manifestError('ARTIFACT_MANIFEST_SUBJECT_MISMATCH', 'artifact manifest subject differs from resolved plugin identity', 'Use the resolved registry identity.')
  if (!same(manifest.targets, canonical.targets)) throw manifestError('ARTIFACT_MANIFEST_TARGETS_MISMATCH', 'artifact manifest target evidence differs from current emissions', 'Use the exact current projection emissions.')
  if (!same(manifest.omitted_optional_payloads ?? [], canonical.omitted_optional_payloads)) throw manifestError('ARTIFACT_MANIFEST_OMISSIONS_MISMATCH', 'artifact manifest omissions differ from staged payload evidence', 'Use exact staged optional-payload omissions.')
}
