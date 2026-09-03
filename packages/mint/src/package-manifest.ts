import { MintError, type MintDiagnostic } from './diagnostics.js'

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

// Task 1 introduces this same shape at the adapter boundary. Task 2 remains
// independently testable on its recorded base by deliberately accepting only
// this local structural view; Task 3 imports the canonical type.
export interface AdapterPackageContributionInput {
  readonly owner: string
  readonly pi?: Readonly<Record<string, unknown>> | undefined
  readonly exports?: Readonly<Record<string, unknown>> | undefined
}

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
  contributions: readonly AdapterPackageContributionInput[],
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
