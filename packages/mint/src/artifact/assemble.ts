import { constants } from 'node:fs'
import { lstat, mkdir, open, readdir, readFile, rm } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, posix, relative, resolve, sep } from 'node:path'
import { MintError } from '../diagnostics.js'
import {
  validateCanonicalGeneration,
  writeValidatedGeneration,
  type CanonicalGenerationIdentity,
} from '../generate.js'
import { composePackageManifest, validateManifestReferences } from '../package-manifest.js'
import {
  defaultProfileId,
  projectionRecordForCurrentGeneration,
  renderMarketplace,
  renderPublicCatalog,
  resolvePublishMatrix,
  type PluginProjectionRecord,
} from '../platform/projections.js'
import type { ResolvedPlatform, ResolvedPlugin } from '../platform/load.js'
import type { AdapterEmission } from '../adapters/types.js'
import type { TargetId } from '../vocabulary.js'
import { artifactCollisionKey, artifactPath, compareArtifactPaths, type ArtifactPath } from './paths.js'
import { stagePayloads } from './payload.js'
import { writeLicensePayload } from './license-payload.js'

export interface AssembledArtifact {
  readonly plugin: ResolvedPlugin
  readonly root: string
  readonly emissions: Readonly<Partial<Record<TargetId, AdapterEmission>>>
  readonly omittedOptionalPayloads: readonly string[]
  readonly projection: PluginProjectionRecord
}

export interface AssembleArtifactInput {
  readonly repoRoot: string
  readonly platform: ResolvedPlatform
  readonly plugin: ResolvedPlugin
  readonly destinationRoot: string
}

export interface AssembleArtifactSetInput {
  readonly repoRoot: string
  readonly platform: ResolvedPlatform
  readonly destinationRoot: string
}

interface ComponentFile {
  readonly destination: ArtifactPath
  readonly bytes: Buffer
  readonly executable: boolean
}

function assemblyError(
  code: string,
  plugin: ResolvedPlugin | undefined,
  source: string,
  message: string,
  action: string,
  path?: string,
  cause?: unknown,
): MintError {
  return new MintError({
    severity: 'error',
    code,
    source,
    ...(plugin === undefined ? {} : { plugin: plugin.id }),
    ...(path === undefined ? {} : { path }),
    message,
    action,
  }, { cause })
}

function isOutside(root: string, candidate: string): boolean {
  const path = relative(root, candidate)
  return path === '..' || path.startsWith(`..${sep}`) || isAbsolute(path)
}

function forbiddenTreeSegment(segment: string): boolean {
  return segment === 'node_modules'
    || segment === '.git'
    || segment === '.github'
    || segment === '.svn'
    || segment === '.hg'
    || segment === '.planning'
    || segment === '.cache'
    || segment === '__pycache__'
}

function isDeveloperHarness(path: string): boolean {
  const segments = path.split('/')
  const name = segments.at(-1) ?? ''
  return segments.some((segment) => segment === 'test' || segment === 'tests' || segment === '__tests__')
    || /(?:^|\.)test\.[^.]+$/i.test(name)
    || /(?:^|\.)spec\.[^.]+$/i.test(name)
    || name.toLowerCase().startsWith('test-')
}

function isExcludedComponentPath(path: string): boolean {
  const segments = path.split('/')
  const name = segments.at(-1) ?? ''
  return segments.some(forbiddenTreeSegment)
    || name === '.gitignore'
    || name === '.gitattributes'
    || name === '.gitmodules'
    || name === '.DS_Store'
    || name === 'moe-mint.yaml'
    || name === 'moe-mint.yml'
}

function markdownTargets(contents: string): readonly string[] {
  const targets: string[] = []
  const expression = /!?\[[^\]]*\]\(([^)]+)\)/g
  for (const match of contents.matchAll(expression)) {
    let target = match[1]?.trim() ?? ''
    if (target.startsWith('<') && target.endsWith('>')) target = target.slice(1, -1)
    target = target.split(/\s+["']/u, 1)[0] ?? ''
    target = target.split('#', 1)[0]?.split('?', 1)[0] ?? ''
    if (target.length === 0 || target.startsWith('/') || /^[A-Za-z][A-Za-z\d+.-]*:/.test(target)) continue
    try {
      targets.push(decodeURIComponent(target))
    } catch {
      // A malformed URI is not a valid relative link and therefore cannot
      // authorize a developer-harness-shaped file for distribution.
    }
  }
  return targets
}

async function collectComponentFiles(plugin: ResolvedPlugin): Promise<readonly ComponentFile[]> {
  const roots = [
    plugin.config.components.skills,
    plugin.config.components.commands,
    plugin.config.components.agents,
    plugin.config.components.hooks,
    plugin.config.components.mcp,
  ]
  const candidates = new Map<string, ComponentFile>()
  const byCollision = new Map<string, ArtifactPath>()

  async function collect(sourceAbsolute: string, destination: ArtifactPath): Promise<void> {
    if (isExcludedComponentPath(destination)) return
    let stats
    try {
      stats = await lstat(sourceAbsolute)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
      throw assemblyError('ARTIFACT_COMPONENT_READ', plugin, plugin.config.source, `cannot inspect component "${destination}"`, 'Make the declared component readable.', destination, error)
    }
    if (stats.isSymbolicLink()) {
      throw assemblyError('ARTIFACT_COMPONENT_UNSAFE_TYPE', plugin, plugin.config.source, `component "${destination}" is a symbolic link`, 'Replace component links with regular files and directories.', destination)
    }
    if (stats.isDirectory()) {
      const names = await readdir(sourceAbsolute, { encoding: 'buffer' }) as Buffer[]
      names.sort(Buffer.compare)
      for (const rawName of names) {
        const name = new TextDecoder('utf-8', { fatal: true }).decode(rawName)
        await collect(join(sourceAbsolute, name), artifactPath(`${destination}/${name}`))
      }
      return
    }
    if (!stats.isFile() || stats.nlink > 1) {
      throw assemblyError('ARTIFACT_COMPONENT_UNSAFE_TYPE', plugin, plugin.config.source, `component "${destination}" is not an independent regular file`, 'Use regular files with one filesystem link.', destination)
    }
    if (destination.endsWith('.map')) {
      throw assemblyError('ARTIFACT_COMPONENT_FORBIDDEN', plugin, plugin.config.source, `component "${destination}" is forbidden in a generated artifact`, 'Remove source maps, caches, VCS/planning data, and Mint input from declared components.', destination)
    }
    const collision = artifactCollisionKey(destination)
    const previous = byCollision.get(collision)
    if (previous !== undefined && previous !== destination) {
      throw assemblyError('ARTIFACT_PATH_COLLISION', plugin, plugin.config.source, `component paths "${previous}" and "${destination}" collide`, 'Rename one component path to a unique NFC/case-fold spelling.', destination)
    }
    byCollision.set(collision, destination)
    candidates.set(destination, {
      destination,
      bytes: await readFile(sourceAbsolute),
      executable: (stats.mode & 0o111) !== 0,
    })
  }

  for (const rootPath of new Set(roots)) {
    const sourceAbsolute = resolve(plugin.sourcePath, rootPath)
    if (isOutside(plugin.sourcePath, sourceAbsolute)) {
      throw assemblyError('ARTIFACT_COMPONENT_ESCAPE', plugin, plugin.config.source, `component "${rootPath}" escapes its source package`, 'Use a contained component path.', rootPath)
    }
    await collect(sourceAbsolute, artifactPath(rootPath))
  }

  const linked = new Set<string>()
  const pending = [...candidates.keys()].filter((path) => basename(path) === 'SKILL.md')
  for (const path of pending) linked.add(path)
  while (pending.length > 0) {
    const current = pending.shift()
    if (current === undefined) break
    const file = candidates.get(current)
    if (file === undefined || !current.toLowerCase().endsWith('.md')) continue
    const contents = file.bytes.toString('utf8')
    for (const target of markdownTargets(contents)) {
      const resolved = posix.normalize(posix.join(posix.dirname(current), target))
      if (resolved === '..' || resolved.startsWith('../') || !candidates.has(resolved) || linked.has(resolved)) continue
      linked.add(resolved)
      pending.push(resolved)
    }
  }

  return [...candidates.values()]
    .filter((file) => !isDeveloperHarness(file.destination) || linked.has(file.destination))
    .sort((left, right) => compareArtifactPaths(left.destination, right.destination))
}

async function writeNewFile(path: string, bytes: Uint8Array | string, executable = false): Promise<void> {
  const handle = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
  try {
    await handle.writeFile(bytes)
    await handle.chmod(executable ? 0o755 : 0o644)
  } finally {
    await handle.close()
  }
}

async function stageComponents(plugin: ResolvedPlugin, artifactRoot: string): Promise<void> {
  const files = await collectComponentFiles(plugin)
  for (const file of files) {
    await mkdir(dirname(join(artifactRoot, file.destination)), { recursive: true })
    await writeNewFile(join(artifactRoot, file.destination), file.bytes, file.executable)
  }
}

async function artifactFiles(plugin: ResolvedPlugin, root: string): Promise<ReadonlySet<string>> {
  const files = new Set<string>()
  const collisions = new Map<string, ArtifactPath>()
  async function walk(absolute: string, relativePath: string): Promise<void> {
    const names = await readdir(absolute, { encoding: 'buffer' }) as Buffer[]
    names.sort(Buffer.compare)
    for (const rawName of names) {
      const name = new TextDecoder('utf-8', { fatal: true }).decode(rawName)
      const path = artifactPath(relativePath === '' ? name : `${relativePath}/${name}`)
      const stats = await lstat(join(absolute, name))
      if (stats.isSymbolicLink() || (!stats.isDirectory() && (!stats.isFile() || stats.nlink > 1))) {
        throw assemblyError('ARTIFACT_UNSAFE_FILE_TYPE', plugin, plugin.config.source, `artifact entry "${path}" is not a safe regular file or directory`, 'Use a fresh artifact tree containing only real directories and independent regular files.', path)
      }
      if (stats.isDirectory()) {
        await walk(join(absolute, name), path)
        continue
      }
      if (path.endsWith('.map')) {
        throw assemblyError('ARTIFACT_SOURCE_MAP', plugin, plugin.config.source, `artifact includes source map "${path}"`, 'Disable source and declaration maps and rebuild from a clean dist directory.', path)
      }
      const key = artifactCollisionKey(path)
      const previous = collisions.get(key)
      if (previous !== undefined) {
        throw assemblyError('ARTIFACT_PATH_COLLISION', plugin, plugin.config.source, `artifact paths "${previous}" and "${path}" collide`, 'Use unique NFC/case-fold artifact paths.', path)
      }
      collisions.set(key, path)
      files.add(path)
    }
  }
  await walk(root, '')
  return files
}

function identity(plugin: ResolvedPlugin): CanonicalGenerationIdentity {
  return {
    sourcePath: plugin.sourcePath,
    sourcePackagePath: plugin.sourcePackagePath,
    configPath: plugin.configPath,
    configSource: plugin.config.source,
  }
}

async function assertRealDestinationRoot(input: AssembleArtifactInput): Promise<string> {
  const destinationRoot = resolve(input.destinationRoot)
  try {
    const stats = await lstat(destinationRoot)
    if (!stats.isDirectory() || stats.isSymbolicLink()) throw new Error('destination is not a real directory')
  } catch (error) {
    throw assemblyError(
      'ARTIFACT_STAGING_DESTINATION_INVALID',
      input.plugin,
      input.plugin.config.source,
      `artifact destination root "${destinationRoot}" is not a real directory`,
      'Use a fresh physical staging directory rather than a file or symbolic link.',
      destinationRoot,
      error,
    )
  }
  return destinationRoot
}

export async function assembleArtifact(input: AssembleArtifactInput): Promise<AssembledArtifact> {
  if (!input.platform.plugins.includes(input.plugin)) {
    throw assemblyError('ARTIFACT_PLUGIN_PROVENANCE', input.plugin, input.plugin.config.source, 'plugin does not belong to the supplied resolved platform', 'Use the exact ResolvedPlugin object from the producing ResolvedPlatform.')
  }
  const destinationRoot = await assertRealDestinationRoot(input)
  const root = join(destinationRoot, input.plugin.id)
  try {
    await mkdir(root)
  } catch (error) {
    throw assemblyError('ARTIFACT_ROOT_NOT_FRESH', input.plugin, input.plugin.config.source, `artifact root "${root}" is not fresh`, 'Use an empty nonce-bearing sibling staging tree.', root, error)
  }

  await stageComponents(input.plugin, root)
  const stagedPayloads = await stagePayloads(input.plugin.sourcePath, root, input.plugin.config.artifact.payloads)
  const validation = validateCanonicalGeneration(identity(input.plugin), { marketplaceName: defaultProfileId(input.platform) })
  writeValidatedGeneration(root, validation)
  await writeLicensePayload({
    repoRoot: input.repoRoot,
    artifactRoot: root,
    pluginId: input.plugin.id,
    license: input.plugin.config.license,
    importedWorks: input.plugin.config.importedWorks.map((work) => work.name),
  })
  const paths = await artifactFiles(input.plugin, root)
  const releaseVersions = Object.fromEntries(input.platform.plugins.map((plugin) => [plugin.npmPackage, plugin.version]))
  const manifest = composePackageManifest({
    source: input.plugin.packageJson,
    config: input.plugin.config,
    contributions: validation.packageContributions,
    artifactPaths: paths,
    registryUrl: input.platform.registry.release.origin.registry,
    releaseVersions,
  })
  validateManifestReferences(manifest, paths)
  await writeNewFile(join(root, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  const projection = projectionRecordForCurrentGeneration(input.platform, input.plugin, validation)
  return Object.freeze({
    plugin: input.plugin,
    root,
    emissions: projection.emissions,
    omittedOptionalPayloads: Object.freeze(stagedPayloads.filter((payload) => payload.omitted).map((payload) => payload.destination)),
    projection,
  })
}

function assertNonceSibling(input: AssembleArtifactSetInput): string {
  const destination = resolve(input.destinationRoot)
  const canonical = resolve(input.repoRoot, 'plugins')
  if (dirname(destination) !== dirname(canonical) || !/^plugins\.next-[A-Za-z0-9][A-Za-z0-9._-]*$/.test(basename(destination))) {
    throw assemblyError(
      'ARTIFACT_STAGING_DESTINATION_INVALID',
      undefined,
      'artifact assembly',
      `destination "${destination}" is not a nonce-bearing sibling of plugins/`,
      'Use <repo>/plugins.next-<nonce> on the same filesystem as canonical plugins/.',
      destination,
    )
  }
  return destination
}

export async function assembleArtifactSet(input: AssembleArtifactSetInput): Promise<readonly AssembledArtifact[]> {
  const destinationRoot = assertNonceSibling(input)
  let ownsDestination = false
  try {
    await mkdir(destinationRoot)
    ownsDestination = true
    const artifacts: AssembledArtifact[] = []
    for (const plugin of input.platform.plugins) {
      artifacts.push(await assembleArtifact({ ...input, plugin, destinationRoot }))
    }
    const records = artifacts.map((artifact) => artifact.projection)
    renderMarketplace(input.platform, records)
    renderPublicCatalog(input.platform, records)
    resolvePublishMatrix(input.platform, records)
    return Object.freeze(artifacts)
  } catch (error) {
    if (ownsDestination) await rm(destinationRoot, { recursive: true, force: true })
    throw error
  }
}
