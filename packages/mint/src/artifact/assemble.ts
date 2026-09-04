import { constants } from 'node:fs'
import { lstat, mkdir, open, readdir, readFile, realpath, rm } from 'node:fs/promises'
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
import { semanticResourceTargets, TARGET_IDS, type TargetId } from '../vocabulary.js'
import { readArtifactManifest, validateArtifact, writeArtifactManifest, type ExpectedArtifactContext } from './artifact-manifest.js'
import { validateArtifactReferences } from './references.js'
import { artifactCollisionKey, artifactPath, compareArtifactPaths, type ArtifactPath } from './paths.js'
import { stagePayloads } from './payload.js'
import { writeLicensePayload } from './license-payload.js'
import type { BundledPackage } from './bundle-inventory.js'
import { assertLegalClosure, parseNotice, readArtifactLicenseRecords, readBundledLicenseRecords } from './legal.js'
import { classifyStagedImports, type StagedEvidence } from './staged-imports.js'
import { assertValidSkillRuntime, validateSkillRuntime, type SkillRuntimeFile, type SkillRuntimeReport } from '../skill-runtime.js'

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
  readonly mode: number
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

function foldedPath(value: string): string {
  return artifactCollisionKey(artifactPath(value))
}

const FORBIDDEN_TREE_SEGMENTS = new Set([
  'node_modules', '.git', '.github', '.svn', '.hg', '.planning', '.cache', '__pycache__',
].map(foldedPath))
const BUILD_EVIDENCE_SEGMENT = foldedPath('.moe-build')
const TEST_TREE_SEGMENTS = new Set(['test', 'tests', '__tests__', 'spec', 'specs'].map(foldedPath))
const EXCLUDED_COMPONENT_NAMES = new Set([
  '.gitignore', '.gitattributes', '.gitmodules', '.DS_Store', 'moe-mint.yaml', 'moe-mint.yml',
].map(foldedPath))

function forbiddenTreeSegment(segment: string): boolean {
  return FORBIDDEN_TREE_SEGMENTS.has(foldedPath(segment))
}

function isDeveloperHarness(path: string): boolean {
  const segments = path.split('/')
  const name = foldedPath(segments.at(-1) ?? '')
  return segments.some((segment) => TEST_TREE_SEGMENTS.has(foldedPath(segment)))
    || /(?:^|\.)test\.[^.]+$/.test(name)
    || /(?:^|\.)spec\.[^.]+$/.test(name)
    || name.startsWith('test-')
    || (name.endsWith('.py') && (name.startsWith('test_') || /_test\.py$/.test(name)))
}

function isExcludedComponentPath(path: string, configKey: string | undefined): boolean {
  const segments = path.split('/')
  const name = foldedPath(segments.at(-1) ?? '')
  return segments.some(forbiddenTreeSegment)
    || EXCLUDED_COMPONENT_NAMES.has(name)
    || foldedPath(path) === configKey
}

function isSourceMap(path: ArtifactPath): boolean {
  return foldedPath(basename(path)).endsWith('.map')
}

function configArtifactKey(plugin: ResolvedPlugin): string | undefined {
  const relativeConfig = relative(plugin.sourcePath, plugin.configPath)
  if (isOutside(plugin.sourcePath, plugin.configPath) || relativeConfig.length === 0) return undefined
  return foldedPath(relativeConfig.split(sep).join('/'))
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

async function collectComponentFiles(plugin: ResolvedPlugin): Promise<{ candidates: readonly ComponentFile[]; staged: readonly ComponentFile[] }> {
  const roots = [
    plugin.config.components.skills,
    plugin.config.components.commands,
    plugin.config.components.agents,
    plugin.config.components.hooks,
    plugin.config.components.mcp,
  ]
  const candidates = new Map<string, ComponentFile>()
  const byCollision = new Map<string, ArtifactPath>()
  const configKey = configArtifactKey(plugin)

  async function collect(sourceAbsolute: string, destination: ArtifactPath): Promise<void> {
    if (destination.split('/').some((segment) => foldedPath(segment) === BUILD_EVIDENCE_SEGMENT)) {
      throw assemblyError('ARTIFACT_COMPONENT_FORBIDDEN', plugin, plugin.config.source, `component "${destination}" is reserved build evidence`, 'Remove .moe-build from declared components.', destination)
    }
    if (isExcludedComponentPath(destination, configKey)) return
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
    if (isSourceMap(destination)) {
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
      mode: stats.mode & 0o777,
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
    for (const target of semanticResourceTargets(contents)) {
      const resolved = posix.normalize(target)
      if (
        resolved === '..'
        || resolved.startsWith('../')
        || !resolved.startsWith('skills/')
        || !candidates.has(resolved)
        || linked.has(resolved)
      ) continue
      linked.add(resolved)
      pending.push(resolved)
    }
  }

  const allCandidates = [...candidates.values()]
    .sort((left, right) => compareArtifactPaths(left.destination, right.destination))
  const staged = allCandidates
    .filter((file) => !isDeveloperHarness(file.destination) || linked.has(file.destination))
  return { candidates: allCandidates, staged }
}

async function writeNewFile(path: string, bytes: Uint8Array | string, mode = 0o644): Promise<void> {
  const handle = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
  try {
    await handle.writeFile(bytes)
    await handle.chmod(mode)
  } finally {
    await handle.close()
  }
}

async function stageComponents(plugin: ResolvedPlugin, artifactRoot: string): Promise<readonly ComponentFile[]> {
  const { staged } = await collectComponentFiles(plugin)
  const runtimeFiles: SkillRuntimeFile[] = staged.map((file) => ({
    path: file.destination,
    content: file.bytes,
    executable: file.executable,
  }))
  assertValidSkillRuntime({
    plugin: plugin.id,
    source: plugin.config.source,
    skillsRoot: plugin.config.components.skills,
    files: runtimeFiles,
  })
  for (const file of staged) {
    await mkdir(dirname(join(artifactRoot, file.destination)), { recursive: true })
    await writeNewFile(join(artifactRoot, file.destination), file.bytes, file.mode)
  }
  return staged
}

type ArtifactEntryKind = 'directory' | 'file'
type ArtifactClaims = Map<string, { readonly path: ArtifactPath; readonly kind: ArtifactEntryKind }>

function claimArtifactEntry(
  plugin: ResolvedPlugin,
  claims: ArtifactClaims,
  path: ArtifactPath,
  kind: ArtifactEntryKind,
): void {
  const key = artifactCollisionKey(path)
  const previous = claims.get(key)
  if (previous !== undefined && !(previous.kind === 'directory' && kind === 'directory' && previous.path === path)) {
    throw assemblyError(
      'ARTIFACT_PATH_COLLISION',
      plugin,
      plugin.config.source,
      `artifact ${previous.kind} "${previous.path}" conflicts with ${kind} "${path}"`,
      'Use unique NFC/case-fold artifact paths for every file and directory.',
      path,
    )
  }
  claims.set(key, { path, kind })
}

function claimArtifactFile(plugin: ResolvedPlugin, claims: ArtifactClaims, value: string): void {
  const path = artifactPath(value)
  const segments = path.split('/')
  for (let length = 1; length < segments.length; length += 1) {
    claimArtifactEntry(plugin, claims, artifactPath(segments.slice(0, length).join('/')), 'directory')
  }
  claimArtifactEntry(plugin, claims, path, 'file')
}

export async function inspectArtifact(plugin: ResolvedPlugin, root: string): Promise<{
  readonly files: ReadonlySet<string>
  readonly claims: ArtifactClaims
}> {
  const files = new Set<string>()
  const claims: ArtifactClaims = new Map()
  async function walk(absolute: string, relativePath: string): Promise<void> {
    const names = await readdir(absolute, { encoding: 'buffer' }) as Buffer[]
    names.sort(Buffer.compare)
    for (const rawName of names) {
      const name = new TextDecoder('utf-8', { fatal: true }).decode(rawName)
      const path = artifactPath(relativePath === '' ? name : `${relativePath}/${name}`)
      if (path.split('/').some((segment) => foldedPath(segment) === BUILD_EVIDENCE_SEGMENT)) {
        throw assemblyError('ARTIFACT_COMPONENT_FORBIDDEN', plugin, plugin.config.source, `artifact entry "${path}" is reserved build evidence`, 'Remove .moe-build from the artifact tree.', path)
      }
      const stats = await lstat(join(absolute, name))
      if (stats.isSymbolicLink() || (!stats.isDirectory() && (!stats.isFile() || stats.nlink > 1))) {
        throw assemblyError('ARTIFACT_UNSAFE_FILE_TYPE', plugin, plugin.config.source, `artifact entry "${path}" is not a safe regular file or directory`, 'Use a fresh artifact tree containing only real directories and independent regular files.', path)
      }
      if (stats.isDirectory()) {
        claimArtifactEntry(plugin, claims, path, 'directory')
        await walk(join(absolute, name), path)
        continue
      }
      if (isSourceMap(path)) {
        throw assemblyError('ARTIFACT_SOURCE_MAP', plugin, plugin.config.source, `artifact includes source map "${path}"`, 'Disable source and declaration maps and rebuild from a clean dist directory.', path)
      }
      claimArtifactEntry(plugin, claims, path, 'file')
      files.add(path)
    }
  }
  await walk(root, '')
  return { files, claims }
}

async function assertGeneratedPathsCompatible(
  plugin: ResolvedPlugin,
  root: string,
  generatedPaths: readonly string[],
): Promise<void> {
  const { claims } = await inspectArtifact(plugin, root)
  for (const generatedPath of generatedPaths) {
    claimArtifactFile(plugin, claims, generatedPath)
  }
}

async function artifactFiles(plugin: ResolvedPlugin, root: string): Promise<ReadonlySet<string>> {
  const { files, claims } = await inspectArtifact(plugin, root)
  claimArtifactFile(plugin, claims, 'package.json')
  claimArtifactFile(plugin, claims, '.moe/artifact.json')
  return files
}

async function canonicalRepositoryRoot(
  repoRoot: string,
  platform: ResolvedPlatform,
  plugin?: ResolvedPlugin,
): Promise<string> {
  let requested: string
  let producing: string
  try {
    [requested, producing] = await Promise.all([
      realpath(resolve(repoRoot)),
      realpath(resolve(platform.repositoryRoot)),
    ])
  } catch (error) {
    throw assemblyError(
      'ARTIFACT_REPOSITORY_PROVENANCE',
      plugin,
      'artifact assembly',
      'artifact repository authority could not be canonicalized',
      'Use the accessible repository root that produced the supplied ResolvedPlatform.',
      resolve(repoRoot),
      error,
    )
  }
  if (requested !== producing) {
    throw assemblyError(
      'ARTIFACT_REPOSITORY_PROVENANCE',
      plugin,
      'artifact assembly',
      `repository root "${requested}" does not match producing platform root "${producing}"`,
      'Use the exact repository root that produced the supplied ResolvedPlatform.',
      requested,
    )
  }
  return requested
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
  const repoRoot = await canonicalRepositoryRoot(input.repoRoot, input.platform, input.plugin)
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

  const componentFiles = await stageComponents(input.plugin, root)
  const stagedPayloads = await stagePayloads(input.plugin.sourcePath, root, input.plugin.config.artifact.payloads)
  await assertGeneratedPathsCompatible(input.plugin, root, [
    'package.json',
    '.moe/artifact.json',
    '.moe-mint/manifest.json',
  ])
  const validation = validateCanonicalGeneration(identity(input.plugin), {
    marketplaceName: defaultProfileId(input.platform),
    componentRoot: root,
  })
  await assertGeneratedPathsCompatible(input.plugin, root, [
    'package.json',
    '.moe/artifact.json',
    '.moe-mint/manifest.json',
    ...validation.files.map((file) => file.path),
  ])
  writeValidatedGeneration(root, validation)
  const licensePayload = await writeLicensePayload({
    repoRoot,
    artifactRoot: root,
    pluginId: input.plugin.id,
    license: input.plugin.config.license,
    importedWorks: input.plugin.config.importedWorks.map((work) => work.name),
  })
  let bundledPackages: readonly BundledPackage[] = []
  try {
    bundledPackages = JSON.parse(await readFile(join(input.plugin.sourcePath, '.moe-build/bundle-inventory.json'), 'utf8')) as BundledPackage[]
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  const stagedEvidence: StagedEvidence[] = [
    ...componentFiles.map((file) => ({ artifactPath: file.destination, sourceKind: 'component' as const })),
    ...validation.files.map((file) => ({ artifactPath: file.path, sourceKind: 'component' as const })),
    ...stagedPayloads.filter((payload) => !payload.omitted).flatMap((payload) => payload.files.map((file) => ({ artifactPath: file, sourceKind: 'payload' as const }))),
    ...bundledPackages.flatMap((bundle) => bundle.outputs.map((output) => ({ artifactPath: output, sourceKind: 'bundle' as const, work: bundle.name }))),
  ]
  const stagedImports = classifyStagedImports({ importedWorks: input.plugin.config.importedWorks, staged: stagedEvidence })
  const legalPaths = await artifactFiles(input.plugin, root)
  const [artifactLicenses, bundledLicenses] = await Promise.all([
    readArtifactLicenseRecords(root),
    readBundledLicenseRecords(repoRoot, bundledPackages),
  ])
  assertLegalClosure({
    bundledPackages,
    stagedImports,
    importedWorks: input.plugin.config.importedWorks,
    notice: parseNotice(await readFile(join(repoRoot, 'NOTICE'), 'utf8')),
    artifactLicenses,
    bundledLicenses,
    expectedLegalPayload: {
      LICENSE: Buffer.from(licensePayload.license),
      NOTICE: Buffer.from(licensePayload.notice),
    },
    artifactPaths: legalPaths,
  })
  const paths = await artifactFiles(input.plugin, root)
  const releaseVersions = Object.fromEntries(input.platform.plugins.map((plugin) => [plugin.npmPackage, plugin.version]))
  for (const entry of await readdir(join(repoRoot, 'packages'), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    try {
      const pkg = JSON.parse(await readFile(join(repoRoot, 'packages', entry.name, 'package.json'), 'utf8')) as Record<string, unknown>
      if (typeof pkg.name === 'string' && typeof pkg.version === 'string' && !Object.hasOwn(releaseVersions, pkg.name)) {
        releaseVersions[pkg.name] = pkg.version
      }
    } catch {}
  }
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
  const omittedOptionalPayloads = Object.freeze(stagedPayloads.filter((payload) => payload.omitted).map((payload) => payload.destination))
  const targets: ExpectedArtifactContext['targets'] = Object.fromEntries(TARGET_IDS.flatMap((target) => {
    const emission = projection.emissions[target]
    return emission === undefined ? [] : [[target, { emitted_capabilities: emission.emittedCapabilities }]]
  }))
  const expected: ExpectedArtifactContext = {
    plugin: { id: input.plugin.id, package: input.plugin.npmPackage, version: input.plugin.version },
    targets,
    omitted_optional_payloads: omittedOptionalPayloads,
  }
  await writeArtifactManifest(root, expected)
  await validateArtifact(root, expected)
  const artifactManifest = await readArtifactManifest(root)
  const stagedComponentPaths = new Set<string>(componentFiles.map((file) => file.destination))
  const componentDirectories = Object.fromEntries(Object.entries(input.plugin.config.components).filter(([, path]) => (
    stagedComponentPaths.has(path) || [...stagedComponentPaths].some((candidate) => candidate.startsWith(`${path}/`))
  )))
  validateArtifactReferences({
    artifactManifest,
    packageManifest: manifest,
    generatedFiles: validation.files,
    componentDirectories,
    componentFiles: componentFiles.filter((file) => file.destination.endsWith('.json')).map((file) => ({
      path: file.destination,
      content: file.bytes.toString('utf8'),
    })),
  })
  return Object.freeze({
    plugin: input.plugin,
    root,
    emissions: projection.emissions,
    omittedOptionalPayloads,
    projection,
  })
}

async function assertNonceSibling(input: AssembleArtifactSetInput, repoRoot: string): Promise<string> {
  const destination = resolve(input.destinationRoot)
  let parent: string
  try {
    parent = await realpath(dirname(destination))
  } catch (error) {
    throw assemblyError(
      'ARTIFACT_STAGING_DESTINATION_INVALID',
      undefined,
      'artifact assembly',
      `destination parent for "${destination}" cannot be canonicalized`,
      'Use <repo>/plugins.next-<nonce> on the same filesystem as canonical plugins/.',
      destination,
      error,
    )
  }
  if (parent !== repoRoot || !/^plugins\.next-[A-Za-z0-9][A-Za-z0-9._-]*$/.test(basename(destination))) {
    throw assemblyError(
      'ARTIFACT_STAGING_DESTINATION_INVALID',
      undefined,
      'artifact assembly',
      `destination "${destination}" is not a nonce-bearing sibling of plugins/`,
      'Use <repo>/plugins.next-<nonce> on the same filesystem as canonical plugins/.',
      destination,
    )
  }
  return join(parent, basename(destination))
}

export async function assembleArtifactSet(input: AssembleArtifactSetInput): Promise<readonly AssembledArtifact[]> {
  const repoRoot = await canonicalRepositoryRoot(input.repoRoot, input.platform)
  const destinationRoot = await assertNonceSibling(input, repoRoot)
  let ownsDestination = false
  try {
    await mkdir(destinationRoot)
    ownsDestination = true
    const artifacts: AssembledArtifact[] = []
    for (const plugin of input.platform.plugins) {
      artifacts.push(await assembleArtifact({ ...input, repoRoot, plugin, destinationRoot }))
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

export async function inspectSkillRuntime(plugin: ResolvedPlugin): Promise<SkillRuntimeReport> {
  const { staged } = await collectComponentFiles(plugin)
  const runtimeFiles: SkillRuntimeFile[] = staged.map((file) => ({
    path: file.destination,
    content: file.bytes,
    executable: file.executable,
  }))
  return validateSkillRuntime({
    plugin: plugin.id,
    source: plugin.config.source,
    skillsRoot: plugin.config.components.skills,
    files: runtimeFiles,
  })
}
