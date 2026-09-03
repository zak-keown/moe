import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { cp, lstat, mkdir, mkdtemp, open, readFile, readdir, realpath, rm } from 'node:fs/promises'
import { gunzipSync } from 'node:zlib'
import { spawn } from 'node:child_process'
import { basename, isAbsolute, join, posix, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { MintError } from '../diagnostics.js'
import { validateArtifact, type ExpectedArtifactContext } from './artifact-manifest.js'
import { artifactCollisionKey, artifactPath, type ArtifactPath } from './paths.js'

export interface PackedArtifact {
  readonly tarballPath: string
  readonly filename: string
  readonly bytes: number
  readonly sha256: string
  readonly integrity: `sha512-${string}`
}

export interface OfflineDependencyRoot {
  readonly name: string
  readonly root: string
}

export type PackedProbe =
  | {
      readonly kind: 'import'
      readonly subpath: '.' | './server'
      readonly dependencies: readonly string[]
    }
  | {
      readonly kind: 'bin'
      readonly path: string
      readonly args: readonly string[]
      readonly dependencies: readonly string[]
    }

export interface PackedProbeOptions {
  readonly probes: readonly PackedProbe[]
  readonly offlineDependencies: readonly OfflineDependencyRoot[]
}

export const PACK_LIMITS = Object.freeze({
  compressedBytes: 64 * 1024 * 1024,
  expandedBytes: 256 * 1024 * 1024,
  members: 10_000,
  memberBytes: 64 * 1024 * 1024,
  pathBytes: 4096,
  commandOutputBytes: 1024 * 1024,
  probeMilliseconds: 30_000,
})

interface TarMember {
  readonly path: ArtifactPath
  readonly directory: boolean
  readonly executable: boolean
  readonly bytes: Buffer
}

interface NpmPackRecord {
  readonly filename: string
  readonly size: number
  readonly integrity: string
  readonly name: string
  readonly version: string
}

function packError(code: string, message: string, action: string, path?: string, cause?: unknown): MintError {
  return new MintError({
    severity: 'error',
    code,
    source: 'artifact pack',
    ...(path === undefined ? {} : { path }),
    message,
    action,
  }, { cause })
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function checkedFilename(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value !== basename(value) || value.includes('\\') || !value.endsWith('.tgz')) {
    throw packError('PACK_NPM_OUTPUT_INVALID', 'npm pack returned an unsafe tarball filename', 'Require npm pack to return one basename ending in .tgz.')
  }
  return value
}

function parseNpmOutput(output: string, expected: ExpectedArtifactContext): NpmPackRecord {
  let parsed: unknown
  try {
    parsed = JSON.parse(output)
  } catch (error) {
    throw packError('PACK_NPM_OUTPUT_INVALID', 'npm pack did not return JSON output', 'Run npm pack with --json and inspect its output.', undefined, error)
  }
  if (!Array.isArray(parsed) || parsed.length !== 1) {
    throw packError('PACK_NPM_OUTPUT_INVALID', 'npm pack must return exactly one JSON result', 'Ensure one artifact is packed into a fresh destination.')
  }
  const value = record(parsed[0])
  const filename = checkedFilename(value?.filename)
  const size = value?.size
  const integrity = value?.integrity
  const name = value?.name
  const version = value?.version
  if (typeof size !== 'number' || !Number.isSafeInteger(size) || size < 0 || typeof integrity !== 'string' || !/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(integrity) || typeof name !== 'string' || typeof version !== 'string') {
    throw packError('PACK_NPM_OUTPUT_INVALID', 'npm pack returned incomplete tarball metadata', 'Require filename, size, SHA-512 integrity, package name, and version in npm JSON output.')
  }
  if (name !== expected.plugin.package || version !== expected.plugin.version) {
    throw packError('PACK_NPM_SUBJECT_MISMATCH', 'npm pack output subject differs from caller-supplied artifact identity', 'Pack the resolved artifact matching the supplied expected context.')
  }
  return { filename, size, integrity, name, version }
}

function hashes(bytes: Buffer): Pick<PackedArtifact, 'bytes' | 'sha256' | 'integrity'> {
  return {
    bytes: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`,
  }
}

async function physicalDirectory(path: string, source: string): Promise<string> {
  const absolute = resolve(path)
  let physical: string
  try {
    physical = await realpath(absolute)
  } catch (error) {
    throw packError('PACK_PATH_UNAVAILABLE', `${source} is not accessible`, 'Use an existing readable physical directory.', absolute, error)
  }
  let details
  try {
    details = await lstat(physical)
  } catch (error) {
    throw packError('PACK_PATH_UNAVAILABLE', `${source} is not accessible`, 'Use an existing readable physical directory.', physical, error)
  }
  if (!details.isDirectory() || details.isSymbolicLink()) {
    throw packError('PACK_PATH_UNSAFE', `${source} must be a physical directory`, 'Use a real directory rather than a symbolic link.', physical)
  }
  return physical
}

async function outputSnapshot(root: string): Promise<readonly string[]> {
  let names: Buffer[]
  try {
    names = await readdir(root, { encoding: 'buffer' }) as Buffer[]
  } catch (error) {
    throw packError('PACK_OUTPUT_READ_FAILED', 'cannot inspect npm pack destination', 'Use a readable fresh output directory.', root, error)
  }
  return names.map(decodePackedFilename).sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)))
}

/** Decode an npm output filename without replacing invalid filesystem bytes. */
export function decodePackedFilename(value: Buffer): string {
  let decoded: string
  try {
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(value)
  } catch (error) {
    throw packError('PACK_OUTPUT_INVALID', 'npm pack destination contains a filename that is not valid UTF-8', 'Use a fresh output directory with valid UTF-8 names only.', undefined, error)
  }
  if (!Buffer.from(decoded, 'utf8').equals(value) || decoded.includes('\0')) {
    throw packError('PACK_OUTPUT_INVALID', 'npm pack destination contains an unsafe filename', 'Use a fresh output directory with valid UTF-8 names only.')
  }
  return decoded
}

async function runNpmPack(artifactRoot: string, outputRoot: string): Promise<string> {
  const args = ['pack', '--offline', '--ignore-scripts', '--json', '--pack-destination', outputRoot]
  return await new Promise<string>((resolveOutput, reject) => {
    const child = spawn('npm', args, {
      cwd: artifactRoot,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        NPM_CONFIG_OFFLINE: 'true',
        NPM_CONFIG_IGNORE_SCRIPTS: 'true',
        NPM_CONFIG_AUDIT: 'false',
        NPM_CONFIG_FUND: 'false',
        NPM_CONFIG_UPDATE_NOTIFIER: 'false',
      },
    })
    let stdout = ''
    let stderr = ''
    let overLimit = false
    const capture = (append: (chunk: string) => void) => (chunk: Buffer) => {
      if (overLimit) return
      append(chunk.toString('utf8'))
      if (Buffer.byteLength(stdout) + Buffer.byteLength(stderr) > PACK_LIMITS.commandOutputBytes) {
        overLimit = true
        child.kill()
      }
    }
    child.stdout.on('data', capture((chunk) => { stdout += chunk }))
    child.stderr.on('data', capture((chunk) => { stderr += chunk }))
    child.once('error', (error) => reject(packError('PACK_NPM_EXEC_FAILED', 'cannot start npm pack', 'Install npm and retry packing the artifact.', artifactRoot, error)))
    child.once('close', (status) => {
      if (overLimit) {
        reject(packError('PACK_NPM_OUTPUT_LIMIT', 'npm pack exceeded the diagnostic output limit', 'Fix npm pack output before retrying.', artifactRoot))
      } else if (status !== 0) {
        reject(packError('PACK_NPM_FAILED', `npm pack failed with exit status ${String(status)}${stderr ? `: ${stderr.trim()}` : ''}`, 'Fix the artifact package metadata and retry.', artifactRoot))
      } else {
        resolveOutput(stdout)
      }
    })
  })
}

function allZero(block: Buffer): boolean {
  return block.every((byte) => byte === 0)
}

function tarText(block: Buffer, start: number, length: number): string {
  const value = block.subarray(start, start + length)
  const end = value.indexOf(0)
  const bytes = end === -1 ? value : value.subarray(0, end)
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch (error) {
    throw packError('PACK_TARBALL_INVALID', 'tar header contains a non-UTF-8 path', 'Repack the artifact using valid UTF-8 paths.', undefined, error)
  }
  if (!Buffer.from(text, 'utf8').equals(bytes)) {
    throw packError('PACK_TARBALL_INVALID', 'tar header path does not round-trip as UTF-8', 'Repack the artifact using valid UTF-8 paths.')
  }
  return text
}

function tarNumber(block: Buffer, start: number, length: number, label: string): number {
  const text = tarText(block, start, length).trim()
  if (!/^[0-7]*$/.test(text)) throw packError('PACK_TARBALL_INVALID', `tar ${label} is not an octal integer`, 'Repack the artifact with a standards-compliant tar writer.')
  const value = text.length === 0 ? 0 : Number.parseInt(text, 8)
  if (!Number.isSafeInteger(value) || value < 0) throw packError('PACK_TARBALL_INVALID', `tar ${label} is outside the supported range`, 'Repack the artifact with bounded member metadata.')
  return value
}

function verifyHeaderChecksum(header: Buffer): void {
  const declared = tarNumber(header, 148, 8, 'checksum')
  let sum = 0
  for (let index = 0; index < header.length; index += 1) sum += index >= 148 && index < 156 ? 32 : header[index] ?? 0
  if (sum !== declared) throw packError('PACK_TARBALL_INVALID', 'tar header checksum does not match its contents', 'Use an unmodified tarball from npm pack.')
}

function verifyUstarHeader(header: Buffer): void {
  if (!header.subarray(257, 263).equals(Buffer.from('ustar\0', 'ascii')) || !header.subarray(263, 265).equals(Buffer.from('00', 'ascii'))) {
    throw packError('PACK_TARBALL_INVALID', 'tarball member is not a USTAR version 00 entry', 'Use a standards-compliant npm .tgz artifact.')
  }
}

function tarPath(header: Buffer, directory: boolean): ArtifactPath | undefined {
  const name = tarText(header, 0, 100)
  const prefix = tarText(header, 345, 155)
  const full = prefix ? `${prefix}/${name}` : name
  if (Buffer.byteLength(full, 'utf8') > PACK_LIMITS.pathBytes) {
    throw packError('PACK_TARBALL_LIMIT', 'tar member path exceeds the configured limit', 'Use shorter package paths.')
  }
  if (full === 'package/' && directory) return undefined
  if (!full.startsWith('package/')) {
    throw packError('PACK_TARBALL_PATH_ESCAPE', 'tarball members must be nested beneath package/', 'Use an npm tarball with one package/ root.')
  }
  const relative = full.slice('package/'.length).replace(/\/$/u, '')
  if (
    relative.length === 0
    || relative.includes('\\')
    || isAbsolute(relative)
    || posix.isAbsolute(relative)
    || /^[A-Za-z]:\//.test(relative)
    || relative.split('/').some((segment) => segment.length === 0 || segment === '.' || segment === '..')
  ) {
    throw packError('PACK_TARBALL_PATH_ESCAPE', `tar member path "${full}" escapes the package root`, 'Use canonical package-relative POSIX paths.')
  }
  try {
    return artifactPath(relative)
  } catch (error) {
    throw packError('PACK_TARBALL_PATH_ESCAPE', `tar member path "${full}" is not a safe artifact path`, 'Use canonical package-relative POSIX paths.', relative, error)
  }
}

function parseTarball(raw: Buffer): readonly TarMember[] {
  let expanded: Buffer
  try {
    expanded = gunzipSync(raw, { maxOutputLength: PACK_LIMITS.expandedBytes })
  } catch (error) {
    throw packError('PACK_TARBALL_INVALID', 'tarball is not a bounded gzip stream', 'Use an unmodified npm .tgz artifact.', undefined, error)
  }
  const members: TarMember[] = []
  const collisions = new Map<string, ArtifactPath>()
  let offset = 0
  let terminal = false
  while (offset < expanded.length) {
    if (offset + 512 > expanded.length) throw packError('PACK_TARBALL_INVALID', 'tarball ends in a partial header', 'Use an unmodified npm .tgz artifact.')
    const header = expanded.subarray(offset, offset + 512)
    offset += 512
    if (allZero(header)) {
      terminal = true
      if (offset + 512 > expanded.length || !allZero(expanded.subarray(offset, offset + 512)) || expanded.subarray(offset + 512).some((byte) => byte !== 0)) {
        throw packError('PACK_TARBALL_INVALID', 'tarball has an invalid terminal block sequence', 'Use an unmodified npm .tgz artifact.')
      }
      break
    }
    verifyHeaderChecksum(header)
    verifyUstarHeader(header)
    const size = tarNumber(header, 124, 12, 'member size')
    const type = String.fromCharCode(header[156] ?? 0)
    if (type !== '\0' && type !== '0' && type !== '5') {
      throw packError('PACK_TARBALL_UNSAFE_TYPE', `tarball contains unsupported member type ${JSON.stringify(type)}`, 'Remove links, devices, FIFOs, sparse files, and extended tar entries.')
    }
    if (size > PACK_LIMITS.memberBytes || members.length >= PACK_LIMITS.members) {
      throw packError('PACK_TARBALL_LIMIT', 'tarball exceeds configured member limits', 'Reduce the package file count or member size.')
    }
    const padded = Math.ceil(size / 512) * 512
    if (offset + padded > expanded.length) throw packError('PACK_TARBALL_INVALID', 'tarball member extends past end of archive', 'Use an unmodified npm .tgz artifact.')
    const directory = type === '5'
    if (directory && size !== 0) throw packError('PACK_TARBALL_INVALID', 'tarball directory carries file data', 'Use a standards-compliant npm tarball.')
    const path = tarPath(header, directory)
    const bytes = Buffer.from(expanded.subarray(offset, offset + size))
    if (expanded.subarray(offset + size, offset + padded).some((byte) => byte !== 0)) {
      throw packError('PACK_TARBALL_INVALID', 'tarball member padding contains nonzero data', 'Use an unmodified npm .tgz artifact.')
    }
    offset += padded
    if (path === undefined) continue
    const key = artifactCollisionKey(path)
    const previous = collisions.get(key)
    if (previous !== undefined) {
      throw packError('PACK_TARBALL_PATH_COLLISION', `tarball paths "${previous}" and "${path}" collide`, 'Use unique NFC and Unicode-case-folded paths.', path)
    }
    collisions.set(key, path)
    members.push({ path, directory, executable: (tarNumber(header, 100, 8, 'mode') & 0o111) !== 0, bytes })
  }
  if (!terminal) throw packError('PACK_TARBALL_INVALID', 'tarball is missing its terminal block', 'Use an unmodified npm .tgz artifact.')
  const byPath = new Map(members.map((member) => [member.path, member]))
  for (const member of members) {
    if (member.directory) continue
    const segments = member.path.split('/')
    for (let index = 1; index < segments.length; index += 1) {
      const parent = segments.slice(0, index).join('/') as ArtifactPath
      if (byPath.get(parent)?.directory === false) {
        throw packError('PACK_TARBALL_SHAPE_CONFLICT', `tarball file "${parent}" conflicts with descendant "${member.path}"`, 'Use either a file or a directory at each artifact path prefix.', member.path)
      }
    }
  }
  return members
}

async function ensureDirectory(root: string, path: string): Promise<void> {
  let current = root
  for (const segment of path.split('/')) {
    current = join(current, segment)
    try {
      await mkdir(current)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw packError('PACK_EXTRACT_WRITE_FAILED', 'cannot create extraction directory', 'Use a writable private extraction directory.', current, error)
    }
    const details = await lstat(current)
    if (!details.isDirectory() || details.isSymbolicLink()) throw packError('PACK_EXTRACT_UNSAFE_PATH', 'refusing to extract through a non-directory', 'Use a fresh private extraction directory.', current)
  }
}

async function extractMembers(members: readonly TarMember[], root: string): Promise<string> {
  const packageRoot = join(root, 'package')
  await mkdir(packageRoot)
  for (const member of members.filter((member) => member.directory)) await ensureDirectory(packageRoot, member.path)
  for (const member of members.filter((member) => !member.directory)) {
    const parent = posix.dirname(member.path)
    if (parent !== '.') await ensureDirectory(packageRoot, parent)
    const destination = join(packageRoot, member.path)
    let handle
    try {
      handle = await open(destination, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
      await handle.writeFile(member.bytes)
      await handle.chmod(member.executable ? 0o755 : 0o644)
    } catch (error) {
      throw packError('PACK_EXTRACT_WRITE_FAILED', 'cannot safely materialize a tarball member', 'Use an archive containing unique regular package files.', member.path, error)
    } finally {
      await handle?.close()
    }
  }
  return packageRoot
}

async function readTarball(path: string): Promise<Buffer> {
  let details
  try {
    details = await lstat(path)
  } catch (error) {
    throw packError('PACK_TARBALL_READ_FAILED', 'cannot inspect tarball', 'Pass an existing readable regular .tgz file.', path, error)
  }
  if (!details.isFile() || details.isSymbolicLink() || details.nlink > 1 || details.size > PACK_LIMITS.compressedBytes) {
    throw packError('PACK_TARBALL_UNSAFE', 'tarball must be one regular bounded file with no symbolic or hard links', 'Pass a fresh npm .tgz output within the configured size limit.', path)
  }
  try {
    return await readFile(path)
  } catch (error) {
    throw packError('PACK_TARBALL_READ_FAILED', 'cannot read tarball', 'Pass a readable npm .tgz file.', path, error)
  }
}

function packageLocation(consumerRoot: string, name: string): string {
  if (!/^@[^/\s]+\/[^/\s]+$/.test(name) && !/^[^@/\s][^/\s]*$/.test(name)) {
    throw packError('PACK_PROBE_INVALID', `package name "${name}" is not safe for an isolated consumer`, 'Use a valid npm package name in caller-supplied probe options.')
  }
  return join(consumerRoot, 'node_modules', ...name.split('/'))
}

async function packageIdentity(root: string, context: string): Promise<{ name: string; version: string }> {
  let parsed: unknown
  try {
    parsed = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  } catch (error) {
    throw packError('PACK_PROBE_INVALID', `${context} has no readable package.json`, 'Provide a physical package root with a valid package manifest.', root, error)
  }
  const value = record(parsed)
  if (typeof value?.name !== 'string' || value.name.length === 0 || typeof value.version !== 'string' || value.version.length === 0) {
    throw packError('PACK_PROBE_INVALID', `${context} package.json must have non-empty name and version`, 'Provide a valid package manifest for the isolated probe.', root)
  }
  return { name: value.name, version: value.version }
}

async function provisionDependencies(
  consumerRoot: string,
  packageManifest: Record<string, unknown>,
  options: PackedProbeOptions,
): Promise<ReadonlyMap<string, string>> {
  const production = new Set<string>()
  for (const field of ['dependencies', 'optionalDependencies']) {
    const value = record(packageManifest[field])
    if (value !== undefined) for (const name of Object.keys(value)) production.add(name)
  }
  const roots = new Map<string, string>()
  for (const dependency of options.offlineDependencies) {
    if (roots.has(dependency.name) || !production.has(dependency.name)) {
      throw packError('PACK_PROBE_DEPENDENCY_INVALID', `offline dependency "${dependency.name}" is duplicate or not declared by the packed package`, 'Provide each declared production dependency root at most once.')
    }
    let physical: string
    try {
      physical = await realpath(dependency.root)
    } catch (error) {
      throw packError('PACK_PROBE_DEPENDENCY_MISSING', `offline dependency "${dependency.name}" is unavailable`, 'Provide the required dependency from the frozen workspace install.', dependency.root, error)
    }
    await physicalDirectory(physical, `offline dependency "${dependency.name}"`)
    const identity = await packageIdentity(physical, `offline dependency "${dependency.name}"`)
    if (identity.name !== dependency.name) {
      throw packError('PACK_PROBE_DEPENDENCY_INVALID', `offline dependency root for "${dependency.name}" declares "${identity.name}"`, 'Provide the matching physical dependency package root.', physical)
    }
    const destination = packageLocation(consumerRoot, dependency.name)
    await mkdir(join(destination, '..'), { recursive: true })
    await cp(physical, destination, { recursive: true, dereference: true, errorOnExist: true })
    roots.set(dependency.name, destination)
  }
  return roots
}

async function runProbe(command: string, args: readonly string[], cwd: string, label: string): Promise<void> {
  await new Promise<void>((resolveProbe, reject) => {
    const child = spawn(command, args, {
      cwd,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { PATH: process.env.PATH ?? '', HOME: cwd, NODE_OPTIONS: '' },
    })
    let output = ''
    let overLimit = false
    let timedOut = false
    const timeout = setTimeout(() => {
      timedOut = true
      child.kill()
    }, PACK_LIMITS.probeMilliseconds)
    const append = (chunk: Buffer) => {
      if (overLimit) return
      output += chunk.toString('utf8')
      if (Buffer.byteLength(output) > PACK_LIMITS.commandOutputBytes) {
        overLimit = true
        child.kill()
      }
    }
    child.stdout.on('data', append)
    child.stderr.on('data', append)
    child.once('error', (error) => {
      clearTimeout(timeout)
      reject(packError('PACK_PROBE_FAILED', `${label} could not start`, 'Use a supported safe probe entry point.', undefined, error))
    })
    child.once('close', (status) => {
      clearTimeout(timeout)
      if (timedOut) {
        reject(packError('PACK_PROBE_TIMEOUT', `${label} exceeded the probe time limit`, 'Keep trusted packed probes bounded and non-interactive.'))
      } else if (overLimit) {
        reject(packError('PACK_PROBE_OUTPUT_LIMIT', `${label} exceeded the probe output limit`, 'Keep trusted packed probes quiet and bounded.'))
      } else if (status === 0) resolveProbe()
      else reject(packError('PACK_PROBE_FAILED', `${label} exited with status ${String(status)}${output ? `: ${output.trim()}` : ''}`, 'Repair the packed entry point or remove it from the trusted probe list.'))
    })
  })
}

async function validatePiMetadata(packageRoot: string): Promise<void> {
  let parsed: unknown
  try {
    parsed = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'))
  } catch (error) {
    throw packError('PACK_PI_REFERENCE_INVALID', 'packed package.json could not be read for Pi discovery validation', 'Repack a valid package manifest.', join(packageRoot, 'package.json'), error)
  }
  const pi = record(record(parsed)?.pi)
  if (pi === undefined) return
  for (const key of ['extensions', 'skills', 'prompts', 'themes']) {
    const values = pi[key]
    if (values === undefined) continue
    if (!Array.isArray(values) || values.some((value) => typeof value !== 'string')) {
      throw packError('PACK_PI_REFERENCE_INVALID', `Pi metadata field "${key}" must be an array of local paths`, 'Use artifact-relative Pi discovery paths.')
    }
    for (const value of values) {
      if (!value.startsWith('./')) {
        throw packError('PACK_PI_REFERENCE_INVALID', `Pi discovery path "${value}" is not package-relative`, 'Use ./ paths inside the packed artifact.', value)
      }
      let path: ArtifactPath
      try { path = artifactPath(value.slice(2)) } catch (error) {
        throw packError('PACK_PI_REFERENCE_INVALID', `Pi discovery path "${value}" escapes the packed artifact`, 'Use a non-traversing ./ path inside the packed artifact.', value, error)
      }
      let details
      try {
        details = await lstat(join(packageRoot, path))
      } catch (error) {
        throw packError('PACK_PI_REFERENCE_MISSING', `Pi discovery path "${value}" is missing from the packed artifact`, 'Stage the referenced Pi discovery path before packing.', path, error)
      }
      if (details.isSymbolicLink() || (!details.isFile() && !details.isDirectory())) {
        throw packError('PACK_PI_REFERENCE_INVALID', `Pi discovery path "${value}" is not a regular artifact entry`, 'Use a regular file or directory inside the packed artifact.', path)
      }
    }
  }
}

async function runPackedProbes(
  packageRoot: string,
  expected: ExpectedArtifactContext,
  options: PackedProbeOptions | undefined,
): Promise<void> {
  if (options === undefined || options.probes.length === 0) return
  const parsed = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8')) as unknown
  const packageManifest = record(parsed)
  if (packageManifest === undefined) throw packError('PACK_PROBE_INVALID', 'packed package.json must contain an object', 'Repack a valid artifact.')
  if (packageManifest.name !== expected.plugin.package || packageManifest.version !== expected.plugin.version) {
    throw packError('PACK_PROBE_SUBJECT_MISMATCH', 'packed package.json differs from caller-supplied identity', 'Use the expected context resolved from the live registry.')
  }
  const consumer = await mkdtemp(join(tmpdir(), 'moe-packed-consumer-'))
  try {
    const installed = packageLocation(consumer, expected.plugin.package)
    await mkdir(join(installed, '..'), { recursive: true })
    await cp(packageRoot, installed, { recursive: true, dereference: true })
    const dependencies = await provisionDependencies(consumer, packageManifest, options)
    for (const [index, probe] of options.probes.entries()) {
      for (const dependency of probe.dependencies) {
        if (!dependencies.has(dependency)) {
          throw packError('PACK_PROBE_DEPENDENCY_MISSING', `probe requires unprovisioned dependency "${dependency}"`, 'Supply that declared dependency root explicitly for this probe.')
        }
      }
      if (probe.kind === 'import') {
        const specifier = probe.subpath === '.' ? expected.plugin.package : `${expected.plugin.package}/server`
        const script = join(consumer, `probe-${index}.mjs`)
        await open(script, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600).then(async (handle) => {
          try { await handle.writeFile(`await import(${JSON.stringify(specifier)})\n`) } finally { await handle.close() }
        })
        await runProbe(process.execPath, [script], consumer, `packed import ${specifier}`)
      } else {
        let path: ArtifactPath
        try { path = artifactPath(probe.path) } catch (error) {
          throw packError('PACK_PROBE_INVALID', 'packed bin probe path must be artifact-relative', 'Use a non-traversing path inside the artifact.', probe.path, error)
        }
        const bin = join(installed, path)
        const details = await lstat(bin)
        if (!details.isFile() || details.isSymbolicLink() || (details.mode & 0o111) === 0) {
          throw packError('PACK_PROBE_INVALID', `packed bin "${path}" is not an executable regular file`, 'Use a verified executable artifact path.', path)
        }
        await runProbe(process.execPath, [bin, ...probe.args], consumer, `packed bin ${path}`)
      }
    }
  } finally {
    await rm(consumer, { recursive: true, force: true })
  }
}

export async function verifyPackedArtifact(
  tarballPath: string,
  expected: ExpectedArtifactContext,
  options?: PackedProbeOptions,
): Promise<PackedArtifact> {
  const absolute = resolve(tarballPath)
  const bytes = await readTarball(absolute)
  const members = parseTarball(bytes)
  const workspace = await mkdtemp(join(tmpdir(), 'moe-packed-artifact-'))
  try {
    const extracted = await extractMembers(members, workspace)
    await validateArtifact(extracted, expected)
    await validatePiMetadata(extracted)
    await runPackedProbes(extracted, expected, options)
  } finally {
    await rm(workspace, { recursive: true, force: true })
  }
  return Object.freeze({ tarballPath: absolute, filename: basename(absolute), ...hashes(bytes) })
}

export async function packArtifactOnce(
  artifactRoot: string,
  outputDir: string,
  expected: ExpectedArtifactContext,
): Promise<PackedArtifact> {
  const source = await physicalDirectory(artifactRoot, 'artifact root')
  const output = await physicalDirectory(outputDir, 'npm pack destination')
  await validateArtifact(source, expected)
  const before = await outputSnapshot(output)
  if (before.length !== 0) throw packError('PACK_OUTPUT_NOT_FRESH', 'npm pack destination must be empty', 'Use a fresh empty output directory.', output)
  const outputJson = await runNpmPack(source, output)
  const npm = parseNpmOutput(outputJson, expected)
  const after = await outputSnapshot(output)
  if (after.length !== 1 || after[0] !== npm.filename) {
    throw packError('PACK_OUTPUT_AMBIGUOUS', 'npm pack did not create exactly the declared tarball', 'Use a fresh output directory and require one npm pack result.', output)
  }
  const tarballPath = join(output, npm.filename)
  const bytes = await readTarball(tarballPath)
  const packed = Object.freeze({ tarballPath, filename: npm.filename, ...hashes(bytes) })
  if (packed.bytes !== npm.size || packed.integrity !== npm.integrity) {
    throw packError('PACK_INTEGRITY_MISMATCH', 'npm pack metadata does not match raw tarball bytes', 'Discard the tarball and rerun npm pack.', tarballPath)
  }
  await verifyPackedArtifact(tarballPath, expected)
  return packed
}
