import { constants } from 'node:fs'
import { lstat, mkdir, open, readdir } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import type { ArtifactPayload } from '../config.js'
import { MintError } from '../diagnostics.js'
import {
  artifactCollisionKey,
  artifactPath,
  ArtifactPathError,
  compareArtifactPaths,
  isReservedArtifactDestination,
  type ArtifactPath,
} from './paths.js'

export interface StagedPayload {
  readonly source: string
  readonly destination: string
  readonly files: readonly ArtifactPath[]
  readonly omitted: boolean
}

/** Injectable only for deterministic filesystem-race regression tests. */
export interface PayloadStageHooks {
  readonly afterPreflight?: () => Promise<void> | void
}

interface PayloadFile {
  readonly sourceAbsolute: string
  readonly destination: ArtifactPath
  readonly executable: boolean
  readonly identity: { readonly dev: number; readonly ino: number }
  readonly bytes?: Buffer
}

interface PreflightPayload extends StagedPayload {
  readonly directories: readonly ArtifactPath[]
  readonly entries: readonly PayloadFile[]
}

interface ExistingArtifact {
  readonly files: readonly ArtifactPath[]
  readonly directories: ReadonlySet<ArtifactPath>
}

function payloadError(
  code: string,
  message: string,
  action: string,
  source: string,
  path?: string,
  cause?: unknown,
): MintError {
  return new MintError({
    severity: 'error',
    code,
    source,
    ...(path === undefined ? {} : { path }),
    message,
    action,
  }, { cause })
}

function asPayloadPath(value: string, source: string, field: 'from' | 'to'): ArtifactPath {
  try {
    return artifactPath(value)
  } catch (error) {
    if (error instanceof ArtifactPathError) {
      throw payloadError(
        'ARTIFACT_PATH_INVALID',
        `payload ${field} "${value}" is invalid: ${error.reason}`,
        'Use a normalized, relative, slash-separated path without globs.',
        source,
        value,
        error,
      )
    }
    throw error
  }
}

function safeArtifactPath(value: string, source: string): ArtifactPath {
  try {
    return artifactPath(value)
  } catch (error) {
    if (error instanceof ArtifactPathError) {
      throw payloadError(
        'ARTIFACT_PATH_INVALID',
        `payload entry "${value}" is invalid: ${error.reason}`,
        'Rename the source entry so its artifact path is portable and normalized.',
        source,
        value,
        error,
      )
    }
    throw error
  }
}

function assertPayloadDeclaration(payload: ArtifactPayload): { from: ArtifactPath; to: ArtifactPath } {
  const source = `artifact.payloads (${payload.from} -> ${payload.to})`
  const from = asPayloadPath(payload.from, source, 'from')
  const to = asPayloadPath(payload.to, source, 'to')
  if (isReservedArtifactDestination(to)) {
    throw payloadError(
      'ARTIFACT_PATH_INVALID',
      `payload destination "${to}" is reserved for compositor output`,
      'Choose a destination outside package metadata, legal payloads, and Mint-owned directories.',
      source,
      to,
    )
  }
  return { from, to }
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

async function checkedLstat(path: string, source: string, artifactPath?: string) {
  try {
    return await lstat(path)
  } catch (error) {
    throw payloadError(
      'ARTIFACT_PAYLOAD_READ',
      `cannot inspect declared payload path "${artifactPath ?? path}"`,
      'Ensure the declared payload is readable and remains inside the source package.',
      source,
      artifactPath,
      error,
    )
  }
}

async function assertSafeSourcePath(sourceRoot: string, relativePath: ArtifactPath, source: string): Promise<string> {
  const root = await checkedLstat(sourceRoot, source)
  if (!root.isDirectory() || root.isSymbolicLink()) {
    throw payloadError(
      'ARTIFACT_UNSAFE_FILE_TYPE',
      'payload source root must be a real directory',
      'Pass the physical source package root, not a symbolic link.',
      source,
    )
  }
  let absolute = sourceRoot
  for (const segment of relativePath.split('/')) {
    absolute = join(absolute, segment)
    const stats = await checkedLstat(absolute, source, relativePath)
    if (stats.isSymbolicLink()) {
      throw payloadError(
        'ARTIFACT_UNSAFE_FILE_TYPE',
        `declared payload traverses a symbolic link at "${relative(sourceRoot, absolute)}"`,
        'Replace symbolic links with regular files and directories in the declared payload.',
        source,
        relative(sourceRoot, absolute),
      )
    }
  }
  return absolute
}

function decodeUtf8Name(name: Buffer, source: string, root: string): string {
  try {
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(name)
    if (!Buffer.from(decoded, 'utf8').equals(name)) throw new Error('filename does not round-trip as UTF-8')
    return decoded
  } catch (error) {
    throw payloadError(
      'ARTIFACT_PATH_INVALID',
      'payload contains a filename that is not valid UTF-8',
      'Rename the file using a UTF-8 filename before staging it.',
      source,
      root,
      error,
    )
  }
}

function assertRegularFile(stats: Awaited<ReturnType<typeof lstat>>, source: string, path: string): void {
  if (stats.isSymbolicLink() || !stats.isFile()) {
    throw payloadError(
      'ARTIFACT_UNSAFE_FILE_TYPE',
      `payload entry "${path}" is not a regular file or directory`,
      'Remove symbolic links, devices, sockets, and named pipes from the declared payload.',
      source,
      path,
    )
  }
  if (stats.nlink > 1) {
    throw payloadError(
      'ARTIFACT_HARD_LINK',
      `payload entry "${path}" has ${stats.nlink} hard links`,
      'Copy the file so the declared payload contains one independent regular file.',
      source,
      path,
    )
  }
}

async function inspectDirectory(
  absolute: string,
  sourceRelative: ArtifactPath,
  destination: ArtifactPath,
  source: string,
  directories: ArtifactPath[],
  entries: PayloadFile[],
): Promise<void> {
  const stats = await checkedLstat(absolute, source, sourceRelative)
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw payloadError(
      'ARTIFACT_UNSAFE_FILE_TYPE',
      `payload entry "${sourceRelative}" is not a directory`,
      'Declared payload roots must be real directories.',
      source,
      sourceRelative,
    )
  }
  directories.push(destination)
  let names: Buffer[]
  try {
    names = await readdir(absolute, { encoding: 'buffer' }) as Buffer[]
  } catch (error) {
    throw payloadError(
      'ARTIFACT_PAYLOAD_READ',
      `cannot enumerate payload directory "${sourceRelative}"`,
      'Ensure the declared payload directory is readable.',
      source,
      sourceRelative,
      error,
    )
  }
  names.sort(Buffer.compare)
  for (const name of names) {
    const decoded = decodeUtf8Name(name, source, sourceRelative)
    const childSource = safeArtifactPath(`${sourceRelative}/${decoded}`, source)
    const childDestination = safeArtifactPath(`${destination}/${decoded}`, source)
    const childAbsolute = join(absolute, decoded)
    const childStats = await checkedLstat(childAbsolute, source, childSource)
    if (childStats.isDirectory() && !childStats.isSymbolicLink()) {
      await inspectDirectory(childAbsolute, childSource, childDestination, source, directories, entries)
      continue
    }
    assertRegularFile(childStats, source, childSource)
    if (childDestination.endsWith('.map')) {
      throw payloadError(
        'ARTIFACT_SOURCE_MAP',
        `payload includes source map "${childSource}"`,
        'Disable source and declaration maps and remove stale map output before staging.',
        source,
        childSource,
      )
    }
    entries.push({
      sourceAbsolute: childAbsolute,
      destination: childDestination,
      executable: (childStats.mode & 0o111) !== 0,
      identity: { dev: childStats.dev, ino: childStats.ino },
    })
  }
}

function assertNoCollisions(payloads: readonly PreflightPayload[], existing?: ExistingArtifact): void {
  const roots = new Map<string, ArtifactPath>()
  const directories = new Map<string, ArtifactPath>()
  const files = new Map<string, ArtifactPath>()
  const claim = (claims: Map<string, ArtifactPath>, path: ArtifactPath): void => {
    const key = artifactCollisionKey(path)
    const previous = claims.get(key)
    if (previous !== undefined) {
      throw payloadError(
        'ARTIFACT_PATH_COLLISION',
        `artifact paths "${previous}" and "${path}" collide after NFC normalization and Unicode case folding`,
        'Rename one destination so every artifact path has a unique NFC/case-fold key.',
        'artifact.payloads',
        path,
      )
    }
    claims.set(key, path)
  }
  for (const payload of payloads) {
    claim(roots, artifactPath(payload.destination))
    for (const directory of payload.directories) {
      const key = artifactCollisionKey(directory)
      const previous = directories.get(key)
      if (previous !== undefined && previous !== directory) {
        throw payloadError(
          'ARTIFACT_PATH_COLLISION',
          `artifact directories "${previous}" and "${directory}" collide after NFC normalization and Unicode case folding`,
          'Rename one destination so every artifact path has a unique NFC/case-fold key.',
          'artifact.payloads',
          directory,
        )
      }
      directories.set(key, directory)
    }
    for (const file of payload.files) claim(files, file)
  }
  for (const file of files.values()) {
    const directory = directories.get(artifactCollisionKey(file))
    if (directory !== undefined) {
      throw payloadError(
        'ARTIFACT_PATH_COLLISION',
        `artifact file "${file}" conflicts with destination directory "${directory}"`,
        'Choose destinations that do not use the same path for a file and a directory.',
        'artifact.payloads',
        file,
      )
    }
  }
  if (existing === undefined) return
  const existingClaims = new Map<string, { path: ArtifactPath; kind: 'file' | 'directory' }>()
  const claimExisting = (path: ArtifactPath, kind: 'file' | 'directory'): void => {
    const key = artifactCollisionKey(path)
    const previous = existingClaims.get(key)
    if (previous !== undefined) {
      throw payloadError(
        'ARTIFACT_PATH_COLLISION',
        `existing artifact ${previous.kind} "${previous.path}" conflicts with ${kind} "${path}"`,
        'Use an artifact staging root with unique NFC/case-fold paths.',
        'artifact root',
        path,
      )
    }
    existingClaims.set(key, { path, kind })
  }
  for (const directory of existing.directories) claimExisting(directory, 'directory')
  for (const file of existing.files) claimExisting(file, 'file')
  for (const file of existing.files) {
    const key = artifactCollisionKey(file)
    const payloadFile = files.get(key)
    if (payloadFile !== undefined) {
      throw payloadError(
        'ARTIFACT_PATH_COLLISION',
        `payload path "${payloadFile}" collides with existing artifact file "${file}"`,
        'Choose a destination not already owned by another artifact contributor.',
        'artifact.payloads',
        payloadFile,
      )
    }
  }
  for (const payload of payloads) {
    for (const directory of payload.directories) {
      const existingDirectory = [...existing.directories].find((candidate) => artifactCollisionKey(candidate) === artifactCollisionKey(directory))
      if (existingDirectory !== undefined && existingDirectory !== directory) {
        throw payloadError(
          'ARTIFACT_PATH_COLLISION',
          `payload directory "${directory}" aliases existing artifact directory "${existingDirectory}"`,
          'Use the exact existing directory spelling or choose a distinct destination.',
          'artifact.payloads',
          directory,
        )
      }
      if (existing.files.some((file) => artifactCollisionKey(file) === artifactCollisionKey(directory))) {
        throw payloadError(
          'ARTIFACT_PATH_COLLISION',
          `payload directory "${directory}" conflicts with an existing artifact file`,
          'Choose a destination not already owned as a file by another artifact contributor.',
          'artifact.payloads',
          directory,
        )
      }
    }
  }
  for (const payload of payloads) {
    for (const file of payload.files) {
      if ([...existing.directories].some((directory) => artifactCollisionKey(directory) === artifactCollisionKey(file))) {
        throw payloadError(
          'ARTIFACT_PATH_COLLISION',
          `payload file "${file}" conflicts with an existing artifact directory`,
          'Choose a destination not already owned as a directory by another artifact contributor.',
          'artifact.payloads',
          file,
        )
      }
    }
  }
  for (const payload of payloads) {
    if (!payload.omitted && existing.files.some((file) => artifactCollisionKey(file) === artifactCollisionKey(artifactPath(payload.destination)))) {
      throw payloadError(
        'ARTIFACT_PATH_COLLISION',
        `payload destination "${payload.destination}" conflicts with an existing artifact file`,
        'Choose a destination directory not already used as a file.',
        'artifact.payloads',
        payload.destination,
      )
    }
  }
}

async function preflightPayloads(sourceRoot: string, payloads: readonly ArtifactPayload[]): Promise<readonly PreflightPayload[]> {
  const absoluteSourceRoot = resolve(sourceRoot)
  const inspected: PreflightPayload[] = []
  for (const payload of payloads) {
    const { from, to } = assertPayloadDeclaration(payload)
    const declaredRoot = join(absoluteSourceRoot, from)
    try {
      await lstat(declaredRoot)
    } catch (error) {
      if (isMissing(error)) {
        if (!payload.required) {
          inspected.push({ source: from, destination: to, files: [], directories: [], entries: [], omitted: true })
          continue
        }
        throw payloadError(
          'ARTIFACT_PAYLOAD_MISSING',
          `required payload root "${from}" is absent`,
          'Build or restore the declared payload root before staging.',
          `artifact.payloads.${from}`,
          from,
          error,
        )
      }
      throw payloadError(
        'ARTIFACT_PAYLOAD_READ',
        `cannot inspect declared payload root "${from}"`,
        'Ensure the declared payload root is readable.',
        `artifact.payloads.${from}`,
        from,
        error,
      )
    }
    const root = await assertSafeSourcePath(absoluteSourceRoot, from, `artifact.payloads.${from}`)
    const rootStats = await checkedLstat(root, `artifact.payloads.${from}`, from)
    if (!rootStats.isDirectory()) {
      throw payloadError(
        'ARTIFACT_UNSAFE_FILE_TYPE',
        `declared payload root "${from}" is not a directory`,
        'Declare a real directory root.',
        `artifact.payloads.${from}`,
        from,
      )
    }
    const directories: ArtifactPath[] = []
    const entries: PayloadFile[] = []
    await inspectDirectory(root, from, to, `artifact.payloads.${from}`, directories, entries)
    entries.sort((left, right) => compareArtifactPaths(left.destination, right.destination))
    const snapshotted = await Promise.all(entries.map(async (entry) => ({ ...entry, bytes: await readCheckedFile(entry, `artifact.payloads.${from}`) })))
    inspected.push({
      source: from,
      destination: to,
      files: snapshotted.map((entry) => entry.destination),
      directories: directories.sort(compareArtifactPaths),
      entries: snapshotted,
      omitted: false,
    })
  }
  assertNoCollisions(inspected)
  return inspected
}

export async function inspectPayloads(sourceRoot: string, payloads: readonly ArtifactPayload[]): Promise<readonly StagedPayload[]> {
  const inspected = await preflightPayloads(sourceRoot, payloads)
  return inspected.map(({ source, destination, files, omitted }) => ({ source, destination, files, omitted }))
}

async function inspectExistingArtifact(artifactRoot: string): Promise<ExistingArtifact> {
  const root = resolve(artifactRoot)
  let rootStats
  try {
    rootStats = await lstat(root)
  } catch (error) {
    if (isMissing(error)) return { files: [], directories: new Set() }
    throw error
  }
  if (!rootStats.isDirectory() || rootStats.isSymbolicLink()) {
    throw payloadError('ARTIFACT_UNSAFE_DESTINATION', 'artifact root must be a real directory', 'Use a fresh real staging directory.', 'artifact root', root)
  }
  const files: ArtifactPath[] = []
  const directories = new Set<ArtifactPath>()
  async function walk(absolute: string, relativePath: string): Promise<void> {
    const names = await readdir(absolute, { encoding: 'buffer' }) as Buffer[]
    names.sort(Buffer.compare)
    for (const name of names) {
      const decoded = decodeUtf8Name(name, 'artifact root', relativePath || root)
      const relativeChild = relativePath === '' ? decoded : `${relativePath}/${decoded}`
      const path = safeArtifactPath(relativeChild, 'artifact root')
      const absoluteChild = join(absolute, decoded)
      const stats = await checkedLstat(absoluteChild, 'artifact root', path)
      if (stats.isSymbolicLink()) {
        throw payloadError('ARTIFACT_UNSAFE_DESTINATION', `artifact root contains symbolic link "${path}"`, 'Use a fresh staging directory without links.', 'artifact root', path)
      }
      if (stats.isDirectory()) {
        directories.add(path)
        await walk(absoluteChild, path)
      } else if (stats.isFile()) {
        files.push(path)
      } else {
        throw payloadError('ARTIFACT_UNSAFE_DESTINATION', `artifact root contains unsupported entry "${path}"`, 'Use a fresh staging directory containing only regular files and directories.', 'artifact root', path)
      }
    }
  }
  await walk(root, '')
  files.sort(compareArtifactPaths)
  return { files, directories }
}

async function ensureArtifactDirectory(root: string, relativePath: ArtifactPath): Promise<void> {
  let current = root
  for (const segment of relativePath.split('/')) {
    current = join(current, segment)
    try {
      await mkdir(current)
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error
    }
    const stats = await lstat(current)
    if (!stats.isDirectory() || stats.isSymbolicLink()) {
      throw payloadError('ARTIFACT_UNSAFE_DESTINATION', `refusing to write through non-directory "${relative(root, current)}"`, 'Use a fresh artifact staging directory.', 'artifact root', relative(root, current))
    }
  }
}

async function readCheckedFile(entry: PayloadFile, source: string): Promise<Buffer> {
  let handle
  try {
    handle = await open(entry.sourceAbsolute, constants.O_RDONLY | constants.O_NOFOLLOW)
    const stats = await handle.stat()
    if (!stats.isFile() || stats.nlink > 1 || stats.dev !== entry.identity.dev || stats.ino !== entry.identity.ino) {
      throw payloadError('ARTIFACT_PAYLOAD_CHANGED', `payload file "${entry.destination}" changed after preflight`, 'Re-run staging with stable regular-file inputs.', source, entry.destination)
    }
    return await handle.readFile()
  } catch (error) {
    if (error instanceof MintError) throw error
    throw payloadError('ARTIFACT_PAYLOAD_READ', `cannot safely read payload file "${entry.destination}"`, 'Remove links and retry staging.', source, entry.destination, error)
  } finally {
    await handle?.close()
  }
}

async function writeCheckedFile(root: string, entry: PayloadFile, source: string): Promise<void> {
  const bytes = entry.bytes ?? await readCheckedFile(entry, source)
  const destinationAbsolute = join(root, entry.destination)
  let handle
  try {
    handle = await open(destinationAbsolute, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
    await handle.writeFile(bytes)
    await handle.chmod(entry.executable ? 0o755 : 0o644)
  } catch (error) {
    throw payloadError('ARTIFACT_PAYLOAD_WRITE', `cannot safely create artifact file "${entry.destination}"`, 'Use a fresh artifact staging directory.', 'artifact root', entry.destination, error)
  } finally {
    await handle?.close()
  }
}

export async function stagePayloads(
  sourceRoot: string,
  artifactRoot: string,
  payloads: readonly ArtifactPayload[],
  hooks?: PayloadStageHooks,
): Promise<readonly StagedPayload[]> {
  // All source validation and collision detection happens before this function
  // creates a directory or opens a destination for writing.
  const inspected = await preflightPayloads(sourceRoot, payloads)
  const absoluteArtifactRoot = resolve(artifactRoot)
  const existing = await inspectExistingArtifact(absoluteArtifactRoot)
  assertNoCollisions(inspected, existing)
  await hooks?.afterPreflight?.()

  try {
    await mkdir(absoluteArtifactRoot, { recursive: true })
  } catch (error) {
    throw payloadError('ARTIFACT_PAYLOAD_WRITE', 'cannot create artifact staging root', 'Use a writable fresh artifact staging directory.', 'artifact root', absoluteArtifactRoot, error)
  }
  const rootStats = await lstat(absoluteArtifactRoot)
  if (!rootStats.isDirectory() || rootStats.isSymbolicLink()) {
    throw payloadError('ARTIFACT_UNSAFE_DESTINATION', 'artifact root must be a real directory', 'Use a fresh real staging directory.', 'artifact root', absoluteArtifactRoot)
  }
  const directories = inspected.flatMap((payload) => payload.directories).sort(compareArtifactPaths)
  for (const directory of directories) await ensureArtifactDirectory(absoluteArtifactRoot, directory)
  const entries = inspected.flatMap((payload) => payload.entries).sort((left, right) => compareArtifactPaths(left.destination, right.destination))
  for (const entry of entries) await writeCheckedFile(absoluteArtifactRoot, entry, 'artifact.payloads')
  return inspected.map(({ source, destination, files, omitted }) => ({ source, destination, files, omitted }))
}
