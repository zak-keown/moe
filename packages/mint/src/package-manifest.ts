import { MintError, type MintDiagnostic } from './diagnostics.js'
import { VERSION_RE, type MintConfig } from './config.js'
import type { AdapterPackageContribution } from './adapters/types.js'

export interface MintPackageMetadata {
  readonly npm: string
  readonly version: string
  readonly description: string
  readonly author?: Readonly<{ name: string; email?: string; url?: string }> | undefined
  readonly license?: string | undefined
  readonly repository?: string | undefined
  readonly homepage?: string | undefined
  readonly keywords?: readonly string[] | undefined
}

export interface NormalizedPackageMetadata {
  readonly name: string
  readonly version: string
  readonly description: string
  readonly author?: Readonly<{ name: string; email?: string; url?: string }> | undefined
  readonly license?: string | undefined
  readonly repository?: string | undefined
  readonly homepage?: string | undefined
  readonly keywords?: readonly string[] | undefined
}

export type ExportTarget = string | ExportConditionMap
export interface ExportConditionMap {
  readonly [condition: string]: ExportTarget
}
export type NormalizedExports = Readonly<Record<string, ExportTarget>>

export interface MergedAdapterPackageContributions {
  readonly exports: NormalizedExports
  readonly pi?: Readonly<Record<string, unknown>> | undefined
}

function diagnostic(
  code: string,
  field: string,
  message: string,
  action: string,
  owners?: readonly string[],
): never {
  const value: MintDiagnostic = {
    severity: 'error',
    code,
    source: 'package-manifest',
    field,
    message,
    action,
    ...(owners === undefined ? {} : { owners }),
  }
  throw new MintError(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requiredTrimmed(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    diagnostic('PACKAGE_METADATA_INVALID', field, `package metadata field "${field}" must be a non-empty string`, `Set ${field} to a non-empty string.`)
  }
  return value.trim()
}

function optionalTrimmed(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined
  return requiredTrimmed(value, field)
}

function normalizeDescription(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    diagnostic('PACKAGE_METADATA_INVALID', field, `package metadata field "${field}" must be a string`, `Set ${field} to a string.`)
  }
  return value.replaceAll('\r\n', '\n').normalize('NFC')
}

type NormalizedAuthor = { name: string; email?: string; url?: string }

function normalizeAuthor(value: unknown, field: string): NormalizedAuthor | undefined {
  if (value === undefined) return undefined
  if (!isRecord(value) || Object.keys(value).some((key) => key !== 'name' && key !== 'email' && key !== 'url')) {
    diagnostic('PACKAGE_METADATA_INVALID', field, 'author must use the object form with name and optional email and url', 'Use author: { name, email?, url? }.')
  }
  const name = requiredTrimmed(value.name, field)
  const email = optionalTrimmed(value.email, field)
  const url = optionalTrimmed(value.url, field)
  return {
    name,
    ...(email === undefined ? {} : { email }),
    ...(url === undefined ? {} : { url }),
  }
}

function normalizeUrl(value: unknown, field: string, repository: boolean): string | undefined {
  if (value === undefined) return undefined
  let candidate: string
  if (repository && isRecord(value)) {
    if (Object.keys(value).some((key) => key !== 'type' && key !== 'url') || value.type !== 'git') {
      diagnostic('PACKAGE_METADATA_INVALID', field, 'repository object must have exactly type: "git" and url', 'Use repository: { type: "git", url: "https://..." }.')
    }
    candidate = requiredTrimmed(value.url, field)
  } else {
    candidate = requiredTrimmed(value, field)
  }
  if (repository && candidate.startsWith('git+')) candidate = candidate.slice('git+'.length)
  let parsed: URL
  try {
    parsed = new URL(candidate)
  } catch {
    diagnostic('PACKAGE_METADATA_INVALID', field, `package metadata field "${field}" must be an HTTPS URL`, `Set ${field} to a valid HTTPS URL.`)
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash) {
    diagnostic('PACKAGE_METADATA_INVALID', field, `package metadata field "${field}" must be a canonical HTTPS URL`, `Set ${field} to a canonical HTTPS URL without credentials or a fragment.`)
  }
  const path = repository
    ? parsed.pathname.replace(/\/+$/, '').replace(/\.git$/, '').replace(/\/+$/, '')
    : parsed.pathname.replace(/\/+$/, '')
  return `${parsed.origin}${path}${parsed.search}`
}

function normalizeKeywords(value: unknown, field: string): string[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.some((keyword) => typeof keyword !== 'string')) {
    diagnostic('PACKAGE_METADATA_INVALID', field, 'keywords must be an array of strings', 'Use a case-sensitive array of keyword strings.')
  }
  const result: string[] = []
  const seen = new Set<string>()
  for (const keyword of value) {
    if (!seen.has(keyword)) {
      seen.add(keyword)
      result.push(keyword)
    }
  }
  return result
}

function sameKeywordSet(left: readonly string[] | undefined, right: readonly string[] | undefined): boolean {
  const leftSet = new Set(left ?? [])
  const rightSet = new Set(right ?? [])
  return leftSet.size === rightSet.size && [...leftSet].every((keyword) => rightSet.has(keyword))
}

function sameAuthor(left: NormalizedAuthor | undefined, right: NormalizedAuthor | undefined): boolean {
  if (left === undefined || right === undefined) return left === right
  return left.name === right.name && left.url === right.url && left.email?.toLowerCase() === right.email?.toLowerCase()
}

function sameOptional(left: string | undefined, right: string | undefined): boolean {
  return left === right
}

function mismatch(field: string): never {
  diagnostic('PACKAGE_METADATA_MISMATCH', field, `source package.json ${field} does not match Mint metadata`, `Make source package.json and Mint metadata agree for ${field}.`)
}

/**
 * Reconciles source duplicates with Mint's descriptive authority and returns
 * the normalized values the compositor will emit. It never mutates either
 * input or reads the package from disk.
 */
export function normalizeMetadata(
  source: Readonly<Record<string, unknown>>,
  mint: Readonly<MintPackageMetadata>,
): NormalizedPackageMetadata {
  const name = requiredTrimmed(mint.npm, 'name')
  if (requiredTrimmed(source.name, 'name') !== name) mismatch('name')
  const version = requiredTrimmed(mint.version, 'version')
  if (requiredTrimmed(source.version, 'version') !== version) mismatch('version')
  const description = normalizeDescription(mint.description, 'description')
  if (normalizeDescription(source.description, 'description') !== description) mismatch('description')

  const author = normalizeAuthor(mint.author, 'author')
  if (!sameAuthor(normalizeAuthor(source.author, 'author'), author)) mismatch('author')
  const license = optionalTrimmed(mint.license, 'license')
  if (!sameOptional(optionalTrimmed(source.license, 'license'), license)) mismatch('license')
  const repository = normalizeUrl(mint.repository, 'repository', true)
  if (!sameOptional(normalizeUrl(source.repository, 'repository', true), repository)) mismatch('repository')
  const homepage = normalizeUrl(mint.homepage, 'homepage', false)
  if (!sameOptional(normalizeUrl(source.homepage, 'homepage', false), homepage)) mismatch('homepage')
  const keywords = normalizeKeywords(mint.keywords, 'keywords')
  if (!sameKeywordSet(normalizeKeywords(source.keywords, 'keywords'), keywords)) mismatch('keywords')

  return {
    name,
    version,
    description,
    ...(author === undefined ? {} : { author }),
    ...(license === undefined ? {} : { license }),
    ...(repository === undefined ? {} : { repository }),
    ...(homepage === undefined ? {} : { homepage }),
    ...(keywords === undefined ? {} : { keywords }),
  }
}

function cloneExportTarget(value: unknown, field: string): ExportTarget {
  if (typeof value === 'string') return value
  if (!isRecord(value)) {
    diagnostic('PACKAGE_EXPORTS_INVALID_SHAPE', field, 'exports targets must be strings or condition objects', 'Use a string target or a condition object without arrays or scalar values.')
  }
  const result: Record<string, ExportTarget> = {}
  for (const [key, target] of Object.entries(value)) result[key] = cloneExportTarget(target, `${field}.${key}`)
  return result
}

function canonicalSynthesizedTarget(value: unknown, field: string): string {
  if (
    typeof value !== 'string'
    || value.trim().length === 0
    || value.includes('\\')
    || value.startsWith('/')
    || /^[A-Za-z][A-Za-z\d+.-]*:/.test(value)
    || value.split('/').includes('..')
  ) {
    diagnostic('PACKAGE_EXPORTS_INVALID_SHAPE', field, `${field} must be a non-empty package-relative POSIX local path when synthesizing exports`, `Set ${field} to a non-traversing local export target.`)
  }
  if (value === '.' || value === './') return './'
  if (value.startsWith('./')) return value
  return `./${value}`
}

/** Normalizes only the shape needed before an adapter adds a subpath. */
export function normalizeExports(source: Readonly<Record<string, unknown>>): NormalizedExports {
  const raw = source.exports
  if (raw === undefined) {
    if (source.main === undefined) return {}
    const root: Record<string, ExportTarget> = {}
    if (source.types !== undefined) root.types = canonicalSynthesizedTarget(source.types, 'types')
    root.default = canonicalSynthesizedTarget(source.main, 'main')
    return { '.': root }
  }
  if (typeof raw === 'string') return { '.': raw }
  if (!isRecord(raw)) {
    diagnostic('PACKAGE_EXPORTS_INVALID_SHAPE', 'exports', 'exports must be a string or an object', 'Use a root string, a condition object, or a subpath map.')
  }
  const keys = Object.keys(raw)
  const subpathKeys = keys.filter((key) => key.startsWith('.'))
  if (subpathKeys.length > 0 && subpathKeys.length !== keys.length) {
    diagnostic('PACKAGE_EXPORTS_MIXED_SHAPE', 'exports', 'exports mixes root conditions and subpath keys', 'Use either a root condition object or a complete subpath map.')
  }
  if (subpathKeys.length === 0) return { '.': cloneExportTarget(raw, 'exports') }
  const result: Record<string, ExportTarget> = {}
  for (const [key, target] of Object.entries(raw)) result[key] = cloneExportTarget(target, `exports.${key}`)
  return result
}

function sameValue(left: unknown, right: unknown): boolean {
  if (left === right) return true
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => sameValue(value, right[index]))
  }
  if (!isRecord(left) || !isRecord(right)) return false
  const leftKeys = Object.keys(left).sort()
  const rightKeys = Object.keys(right).sort()
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => key === rightKeys[index] && sameValue(left[key], right[key]))
}

function contributionObject(value: unknown, owner: string, field: 'pi' | 'exports'): Readonly<Record<string, unknown>> {
  if (!isRecord(value)) {
    diagnostic('PACKAGE_MANIFEST_COLLISION', field, `adapter "${owner}" must contribute ${field} as an object`, `Have adapter "${owner}" emit only its approved ${field} object.`, [owner, field])
  }
  return cloneData(value) as Readonly<Record<string, unknown>>
}

function cloneData(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((entry) => cloneData(entry))
  if (!isRecord(value)) return value
  const result: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value)) result[key] = cloneData(entry)
  return result
}

type ContributionRecord = Readonly<Record<string, unknown>> & { readonly owner: 'pi' | 'opencode' }

function contributionRecord(value: unknown): ContributionRecord {
  if (!isRecord(value)) {
    diagnostic('PACKAGE_MANIFEST_COLLISION', 'contribution', 'adapter package contribution must be a non-array object', 'Emit an object with an approved string owner and namespace.', ['invalid-contribution', 'field-policy'])
  }
  if (typeof value.owner !== 'string') {
    diagnostic('PACKAGE_MANIFEST_COLLISION', 'owner', 'adapter package contribution must declare a string owner', 'Emit an approved string adapter owner.', ['invalid-contribution', 'field-policy'])
  }
  if (value.owner !== 'pi' && value.owner !== 'opencode') {
    diagnostic('PACKAGE_MANIFEST_COLLISION', 'owner', `adapter "${value.owner}" is not allowed to contribute package metadata`, 'Only Pi and OpenCode may contribute their approved package namespaces.', [value.owner, 'field-policy'])
  }
  return value as ContributionRecord
}

/**
 * Applies the two adapter-owned namespaces after source exports have been
 * normalized. The reducer is deliberately narrow: any new field or owner
 * needs an explicit field-policy decision before it can enter an artifact.
 */
export function mergeAdapterPackageContributions(
  sourceExports: NormalizedExports,
  contributions: readonly AdapterPackageContribution[],
): MergedAdapterPackageContributions {
  const exports: Record<string, ExportTarget> = {}
  for (const [key, target] of Object.entries(sourceExports)) exports[key] = cloneExportTarget(target, `exports.${key}`)
  let pi: Readonly<Record<string, unknown>> | undefined
  let piOwner: string | undefined
  let serverOwner: string | undefined = Object.hasOwn(sourceExports, './server') ? 'source' : undefined

  for (const rawContribution of contributions) {
    const contribution = contributionRecord(rawContribution)
    const owner = contribution.owner
    const keys = Object.keys(contribution)
    if (keys.some((key) => key !== 'owner' && key !== 'pi' && key !== 'exports')) {
      diagnostic('PACKAGE_MANIFEST_COLLISION', 'contribution', `adapter "${owner}" contributed an unclassified package field`, 'Add an explicit package field policy before contributing this field.', [owner, 'field-policy'])
    }
    if (contribution.pi !== undefined) {
      if (owner !== 'pi' || contribution.exports !== undefined) {
        diagnostic('PACKAGE_MANIFEST_COLLISION', 'pi', `adapter "${owner}" may not contribute the Pi namespace`, 'Only the Pi adapter may contribute pi.', [owner, 'pi'])
      }
      const next = contributionObject(contribution.pi, owner, 'pi')
      if (pi !== undefined && !sameValue(pi, next)) {
        diagnostic('PACKAGE_MANIFEST_COLLISION', 'pi', 'Pi package contributions disagree', 'Make duplicate Pi contributions byte-for-byte equivalent or emit one contribution.', [piOwner ?? 'pi', owner])
      }
      pi = pi ?? next
      piOwner ??= owner
    }

    if (contribution.exports !== undefined) {
      if (owner !== 'opencode' || contribution.pi !== undefined) {
        diagnostic('PACKAGE_MANIFEST_COLLISION', 'exports', `adapter "${owner}" may not contribute exports`, 'Only the OpenCode adapter may contribute exports["./server"].', [owner, 'exports'])
      }
      const next = contributionObject(contribution.exports, owner, 'exports')
      const exportKeys = Object.keys(next)
      if (exportKeys.length !== 1 || exportKeys[0] !== './server' || typeof next['./server'] !== 'string') {
        diagnostic('PACKAGE_MANIFEST_COLLISION', 'exports', 'OpenCode may contribute only exports["./server"] as a string target', 'Emit exactly { "./server": "./local-target" } from OpenCode.', [owner, 'exports'])
      }
      const server = canonicalSynthesizedTarget(next['./server'], 'exports./server')
      const existing = exports['./server']
      if (existing !== undefined && !sameValue(existing, server)) {
        diagnostic('PACKAGE_MANIFEST_COLLISION', 'exports./server', 'source and OpenCode server exports disagree', 'Make source exports["./server"] equal OpenCode\'s contribution or remove the source-owned subpath.', [serverOwner ?? 'source', owner])
      }
      exports['./server'] = existing ?? server
      serverOwner ??= owner
    }
  }
  return { exports, ...(pi === undefined ? {} : { pi }) }
}

export interface ComposePackageManifestInput {
  source: Readonly<Record<string, unknown>>
  config: MintConfig
  contributions: readonly AdapterPackageContribution[]
  artifactPaths: ReadonlySet<string>
  registryUrl: string
  releaseVersions: Readonly<Record<string, string>>
}

export interface ComposedPackageManifest extends NormalizedPackageMetadata {
  readonly [field: string]: unknown
  readonly type?: string | undefined
  readonly main?: string | undefined
  readonly exports?: NormalizedExports | undefined
  readonly imports?: Readonly<Record<string, ExportTarget>> | undefined
  readonly types?: string | undefined
  readonly bin?: string | Readonly<Record<string, string>> | undefined
  readonly engines?: Readonly<Record<string, string>> | undefined
  readonly os?: readonly string[] | undefined
  readonly cpu?: readonly string[] | undefined
  readonly sideEffects?: boolean | readonly string[] | undefined
  readonly dependencies?: Readonly<Record<string, string>> | undefined
  readonly optionalDependencies?: Readonly<Record<string, string>> | undefined
  readonly peerDependencies?: Readonly<Record<string, string>> | undefined
  readonly peerDependenciesMeta?: Readonly<Record<string, Readonly<Record<string, unknown>>>> | undefined
  readonly pi?: Readonly<Record<string, unknown>> | undefined
  readonly files: readonly string[]
  readonly publishConfig: Readonly<{ access: 'public'; registry: string }>
}

interface RuntimeManifestFields {
  type?: string
  main?: string
  imports?: Readonly<Record<string, ExportTarget>>
  types?: string
  bin?: string | Readonly<Record<string, string>>
  engines?: Readonly<Record<string, string>>
  os?: readonly string[]
  cpu?: readonly string[]
  sideEffects?: boolean | readonly string[]
  dependencies?: Readonly<Record<string, string>>
  optionalDependencies?: Readonly<Record<string, string>>
  peerDependencies?: Readonly<Record<string, string>>
  peerDependenciesMeta?: Readonly<Record<string, Readonly<Record<string, unknown>>>>
}

const DESCRIPTIVE_FIELDS = new Set([
  'name', 'version', 'description', 'author', 'license', 'repository', 'homepage', 'keywords',
])
const OMITTED_FIELDS = new Set([
  'scripts', 'devDependencies', 'private', 'workspaces', 'packageManager', 'overrides', 'pnpm',
  'files', 'publishConfig',
])
const RUNTIME_FIELDS = new Set([
  'type', 'main', 'exports', 'imports', 'types', 'bin', 'engines', 'os', 'cpu', 'sideEffects',
  'dependencies', 'optionalDependencies', 'peerDependencies', 'peerDependenciesMeta',
])

function manifestFieldInvalid(field: string, expected: string): never {
  diagnostic(
    'PACKAGE_MANIFEST_FIELD_INVALID',
    field,
    `package manifest field "${field}" must be ${expected}`,
    `Set ${field} to ${expected}.`,
  )
}

function manifestString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) manifestFieldInvalid(field, 'a non-empty string')
  return value
}

function stringRecord(value: unknown, field: string): Readonly<Record<string, string>> {
  if (!isRecord(value)) manifestFieldInvalid(field, 'an object with string values')
  const result: Record<string, string> = {}
  for (const [key, entry] of Object.entries(value)) result[key] = manifestString(entry, `${field}.${key}`)
  return result
}

function dependencyRecord(
  value: unknown,
  field: 'dependencies' | 'optionalDependencies' | 'peerDependencies',
  releaseVersions: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  const source = stringRecord(value, field)
  const result: Record<string, string> = {}
  for (const [packageName, range] of Object.entries(source)) {
    if (!range.startsWith('workspace:')) {
      result[packageName] = range
      continue
    }
    if (range !== 'workspace:*' && range !== 'workspace:^' && range !== 'workspace:~') {
      diagnostic(
        'PACKAGE_WORKSPACE_PROTOCOL_UNSUPPORTED',
        `${field}.${packageName}`,
        `dependency "${packageName}" uses unsupported workspace protocol "${range}"`,
        'Use workspace:*, workspace:^, or workspace:~ and provide the release package version.',
      )
    }
    const releaseVersion = Object.hasOwn(releaseVersions, packageName) ? releaseVersions[packageName] : undefined
    if (releaseVersion === undefined) {
      diagnostic(
        'PACKAGE_WORKSPACE_VERSION_MISSING',
        `${field}.${packageName}`,
        `dependency "${packageName}" has no release version`,
        'Provide the dependency package version in releaseVersions.',
      )
    }
    if (typeof releaseVersion !== 'string' || !VERSION_RE.test(releaseVersion)) {
      diagnostic(
        'PACKAGE_WORKSPACE_VERSION_INVALID',
        `${field}.${packageName}`,
        `dependency "${packageName}" has invalid release version "${String(releaseVersion)}"`,
        'Provide an exact SemVer release version.',
      )
    }
    const prefix = range === 'workspace:*' ? '' : range.slice('workspace:'.length)
    result[packageName] = `${prefix}${releaseVersion}`
  }
  return result
}

function stringArray(value: unknown, field: string): readonly string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || entry.length === 0)) {
    manifestFieldInvalid(field, 'an array of non-empty strings')
  }
  return [...value]
}

function manifestTarget(value: unknown, field: string): ExportTarget {
  if (typeof value === 'string') return manifestString(value, field)
  if (!isRecord(value)) manifestFieldInvalid(field, 'a string or condition object')
  const result: Record<string, ExportTarget> = {}
  for (const [condition, target] of Object.entries(value)) {
    result[condition] = manifestTarget(target, `${field}.${condition}`)
  }
  return result
}

function importsRecord(value: unknown): Readonly<Record<string, ExportTarget>> {
  if (!isRecord(value)) manifestFieldInvalid('imports', 'an object of package import targets')
  const result: Record<string, ExportTarget> = {}
  for (const [specifier, target] of Object.entries(value)) {
    if (!specifier.startsWith('#')) manifestFieldInvalid(`imports.${specifier}`, 'a package import key beginning with #')
    result[specifier] = manifestTarget(target, `imports.${specifier}`)
  }
  return result
}

function binValue(value: unknown): string | Readonly<Record<string, string>> {
  if (typeof value === 'string') return manifestString(value, 'bin')
  return stringRecord(value, 'bin')
}

function peerMeta(value: unknown): Readonly<Record<string, Readonly<Record<string, unknown>>>> {
  if (!isRecord(value)) manifestFieldInvalid('peerDependenciesMeta', 'an object of peer metadata objects')
  const result: Record<string, Readonly<Record<string, unknown>>> = {}
  for (const [dependency, metadata] of Object.entries(value)) {
    if (!isRecord(metadata)) manifestFieldInvalid(`peerDependenciesMeta.${dependency}`, 'an object')
    result[dependency] = cloneData(metadata) as Readonly<Record<string, unknown>>
  }
  return result
}

function registryOrigin(value: string): string {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    diagnostic('PACKAGE_REGISTRY_INVALID', 'publishConfig.registry', 'platform npm registry must be a valid URL', 'Set release.origin.registry to a valid HTTPS registry URL.')
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    diagnostic('PACKAGE_REGISTRY_INVALID', 'publishConfig.registry', 'platform npm registry must be an HTTPS origin without credentials', 'Set release.origin.registry to a credential-free HTTPS origin.')
  }
  return parsed.origin
}

function artifactFileList(paths: ReadonlySet<string>): readonly string[] {
  const files = new Set<string>(['.moe/artifact.json'])
  for (const path of paths) {
    if (path === 'package.json') continue
    files.add(path)
  }
  return [...files].sort()
}

function localReferencePath(value: string, field: string): string {
  if (
    value.includes('\\')
    || value.startsWith('/')
    || /^[A-Za-z][A-Za-z\d+.-]*:/.test(value)
    || value.includes('?')
    || value.includes('#')
  ) {
    diagnostic('PACKAGE_REFERENCE_ESCAPE', field, `package reference "${value}" is not a package-relative POSIX path`, 'Use a non-traversing path within the staged artifact.')
  }
  const segments = value.split('/')
  if (segments.includes('..')) {
    diagnostic('PACKAGE_REFERENCE_ESCAPE', field, `package reference "${value}" escapes the staged artifact`, 'Use a non-traversing path within the staged artifact.')
  }
  return segments.filter((segment) => segment !== '' && segment !== '.').join('/')
}

function patternExpression(pattern: string): RegExp {
  let expression = '^'
  for (let index = 0; index < pattern.length; index += 1) {
    const scalar = pattern[index] ?? ''
    if (scalar === '*' && pattern[index + 1] === '*' && pattern[index + 2] === '/') {
      expression += '(?:.*/)?'
      index += 2
    } else if (scalar === '*' && pattern[index + 1] === '*') {
      expression += '.*'
      index += 1
    } else if (scalar === '*') {
      expression += '[^/]*'
    } else {
      expression += scalar.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    }
  }
  return new RegExp(`${expression}$`)
}

function localReference(value: unknown, field: string): string {
  const reference = manifestString(value, field)
  return localReferencePath(reference, field)
}

function patternInvalid(field: string, reference: string): never {
  diagnostic(
    'PACKAGE_REFERENCE_PATTERN_INVALID',
    field,
    `package reference "${reference}" uses wildcard syntax where only an exact file is allowed`,
    'Use an exact staged file path.',
  )
}

function validateExactFileReference(value: unknown, field: string, artifactPaths: ReadonlySet<string>): void {
  const path = localReference(value, field)
  if (path.includes('*')) patternInvalid(field, String(value))
  if (path !== '.moe/artifact.json' && !artifactPaths.has(path)) {
    diagnostic('PACKAGE_REFERENCE_MISSING', field, `package reference "${String(value)}" is not present in the staged artifact`, 'Stage the referenced file or update the package manifest target.')
  }
}

function validateDirectoryReference(value: unknown, field: string, artifactPaths: ReadonlySet<string>): void {
  const path = localReference(value, field)
  if (path.includes('*')) patternInvalid(field, String(value))
  if (!artifactPaths.has(path) && ![...artifactPaths].some((candidate) => candidate.startsWith(`${path}/`))) {
    diagnostic('PACKAGE_REFERENCE_MISSING', field, `package reference "${String(value)}" is not present in the staged artifact`, 'Stage the referenced file or directory or update the Pi discovery target.')
  }
}

function validatePatternReference(value: unknown, field: string, artifactPaths: ReadonlySet<string>): void {
  const path = localReference(value, field)
  if (!path.includes('*')) {
    validateExactFileReference(value, field, artifactPaths)
    return
  }
  const expression = patternExpression(path)
  if (![...artifactPaths].some((candidate) => expression.test(candidate))) {
    diagnostic('PACKAGE_REFERENCE_MISSING', field, `package pattern "${String(value)}" matches no staged artifact file`, 'Stage a matching file or update the package manifest pattern.')
  }
}

function isLocalPackageTarget(value: string): boolean {
  return value === '.' || value === '..' || value.startsWith('./') || value.startsWith('../') || value.startsWith('/') || value.includes('\\')
}

function isBarePackageTarget(value: string): boolean {
  if (value.startsWith('node:') || value.startsWith('#')) return true
  if (value.startsWith('@')) return /^@[^/\s]+\/[^/\s]+(?:\/[^\s]*)?$/.test(value)
  return /^[A-Za-z0-9][^/:\s]*(?:\/[^\s]*)?$/.test(value)
}

function validateTargetReferences(
  value: unknown,
  field: string,
  artifactPaths: ReadonlySet<string>,
  patternAllowed: boolean,
): void {
  if (typeof value === 'string') {
    if (!patternAllowed && value.includes('*')) patternInvalid(field, value)
    if (isLocalPackageTarget(value)) {
      if (patternAllowed) validatePatternReference(value, field, artifactPaths)
      else validateExactFileReference(value, field, artifactPaths)
    }
    else if (!isBarePackageTarget(value)) {
      diagnostic('PACKAGE_REFERENCE_ESCAPE', field, `package target "${value}" is neither local nor a bare package dependency`, 'Use a staged local path or a bare package dependency target.')
    }
    return
  }
  if (!isRecord(value)) manifestFieldInvalid(field, 'a string or condition object')
  for (const [condition, target] of Object.entries(value)) {
    validateTargetReferences(target, `${field}.${condition}`, artifactPaths, patternAllowed)
  }
}

/** Validates all package-local runtime and harness discovery references. */
export function validateManifestReferences(
  manifest: Readonly<Record<string, unknown>>,
  artifactPaths: ReadonlySet<string>,
): void {
  if (manifest.main !== undefined) validateExactFileReference(manifest.main, 'main', artifactPaths)
  if (manifest.types !== undefined) validateExactFileReference(manifest.types, 'types', artifactPaths)
  if (manifest.bin !== undefined) {
    if (typeof manifest.bin === 'string') validateExactFileReference(manifest.bin, 'bin', artifactPaths)
    else {
      const bins = stringRecord(manifest.bin, 'bin')
      for (const [name, target] of Object.entries(bins)) validateExactFileReference(target, `bin.${name}`, artifactPaths)
    }
  }
  if (manifest.exports !== undefined) {
    if (typeof manifest.exports === 'string') validateTargetReferences(manifest.exports, 'exports', artifactPaths, false)
    else {
      if (!isRecord(manifest.exports)) manifestFieldInvalid('exports', 'a string or object')
      for (const [key, target] of Object.entries(manifest.exports)) {
        validateTargetReferences(target, `exports.${key}`, artifactPaths, key.includes('*'))
      }
    }
  }
  if (manifest.imports !== undefined) {
    const imports = importsRecord(manifest.imports)
    for (const [key, target] of Object.entries(imports)) {
      validateTargetReferences(target, `imports.${key}`, artifactPaths, key.includes('*'))
    }
  }
  if (manifest.pi !== undefined) {
    if (!isRecord(manifest.pi)) manifestFieldInvalid('pi', 'an object')
    for (const key of ['extensions', 'skills', 'prompts', 'themes']) {
      const entries = manifest.pi[key]
      if (entries === undefined) continue
      const paths = stringArray(entries, `pi.${key}`)
      for (const [index, path] of paths.entries()) validateDirectoryReference(path, `pi.${key}[${index}]`, artifactPaths)
    }
  }
  if (manifest.sideEffects !== undefined && manifest.sideEffects !== false && manifest.sideEffects !== true) {
    const sideEffects = stringArray(manifest.sideEffects, 'sideEffects')
    for (const [index, path] of sideEffects.entries()) {
      validatePatternReference(path, `sideEffects[${index}]`, artifactPaths)
    }
  }
}

/** Composes the one publishable package manifest without inheriting source-only fields. */
export function composePackageManifest(input: ComposePackageManifestInput): ComposedPackageManifest {
  const runtime: RuntimeManifestFields = {}
  for (const [field, value] of Object.entries(input.source)) {
    if (DESCRIPTIVE_FIELDS.has(field) || OMITTED_FIELDS.has(field)) continue
    if (field === 'bundledDependencies' || field === 'bundleDependencies') {
      diagnostic('PACKAGE_BUNDLED_DEPENDENCIES_FORBIDDEN', field, `${field} is forbidden because universal artifacts do not contain node_modules`, `Remove ${field} and declare runtime packages as dependencies.`)
    }
    if (!RUNTIME_FIELDS.has(field)) {
      diagnostic('PACKAGE_MANIFEST_FIELD_UNCLASSIFIED', field, `source package field "${field}" has no version-1 composition policy`, 'Classify the field before adding it to a publishable artifact.')
    }
    switch (field) {
      case 'type':
        runtime.type = manifestString(value, field)
        break
      case 'main':
        runtime.main = manifestString(value, field)
        break
      case 'exports':
        break
      case 'imports':
        runtime.imports = importsRecord(value)
        break
      case 'types':
        runtime.types = manifestString(value, field)
        break
      case 'bin':
        runtime.bin = binValue(value)
        break
      case 'engines':
        runtime[field] = stringRecord(value, field)
        break
      case 'dependencies':
      case 'optionalDependencies':
        if (input.config.artifact.nodePackage?.dependencies === 'bundled') break
        runtime[field] = dependencyRecord(value, field, input.releaseVersions)
        break
      case 'peerDependencies':
        runtime[field] = dependencyRecord(value, field, input.releaseVersions)
        break
      case 'os':
      case 'cpu':
        runtime[field] = stringArray(value, field)
        break
      case 'sideEffects':
        runtime.sideEffects = typeof value === 'boolean' ? value : stringArray(value, field)
        break
      case 'peerDependenciesMeta':
        runtime.peerDependenciesMeta = peerMeta(value)
        break
    }
  }

  const metadata = normalizeMetadata(input.source, {
    npm: input.config.distribution.npm,
    version: input.config.version,
    description: input.config.description,
    author: input.config.author === undefined
      ? undefined
      : {
          name: input.config.author.name,
          ...(input.config.author.email === undefined ? {} : { email: input.config.author.email }),
          ...(input.config.author.url === undefined ? {} : { url: input.config.author.url }),
        },
    license: input.config.license,
    repository: input.config.repository,
    homepage: input.config.homepage,
    keywords: input.config.keywords,
  })
  const contribution = mergeAdapterPackageContributions(normalizeExports(input.source), input.contributions)
  const manifest: ComposedPackageManifest = {
    ...metadata,
    ...runtime,
    ...(Object.keys(contribution.exports).length === 0 ? {} : { exports: contribution.exports }),
    ...(contribution.pi === undefined ? {} : { pi: contribution.pi }),
    files: artifactFileList(input.artifactPaths),
    publishConfig: { access: 'public', registry: registryOrigin(input.registryUrl) },
  }
  validateManifestReferences(manifest, input.artifactPaths)
  return manifest
}
