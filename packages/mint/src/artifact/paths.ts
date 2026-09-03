import { isAbsolute, posix } from 'node:path'
import { FULL_CASE_FOLD } from './unicode-casefold.js'

/** A slash-separated, artifact-root-relative path that has passed lexical validation. */
export type ArtifactPath = string & { readonly __artifactPath: unique symbol }

const GLOB_METACHARACTER_RE = /[*?\[\]{}!]/

// These files and roots have a compositor authority. Keeping the policy here
// lets every writer use one boundary rather than accumulating local deny lists.
export const RESERVED_ARTIFACT_FILES = new Set([
  'package.json',
  'LICENSE',
  'NOTICE',
  'THIRD_PARTY_NOTICES',
])
export const RESERVED_ARTIFACT_ROOTS = ['.moe', '.moe-mint'] as const

function fullCaseFold(value: string): string {
  return [...value].map((character) => FULL_CASE_FOLD.get(character.codePointAt(0)!) ?? character).join('').normalize('NFC')
}

export class ArtifactPathError extends Error {
  constructor(
    readonly path: string,
    readonly reason: string,
  ) {
    super(`invalid artifact path "${path}": ${reason}`)
    this.name = 'ArtifactPathError'
  }
}

/**
 * Validates a payload path without consulting the host filesystem. Artifact
 * paths deliberately use POSIX separators on every contributor platform.
 */
export function artifactPath(value: string): ArtifactPath {
  if (value.length === 0) throw new ArtifactPathError(value, 'path must not be empty')
  if (isAbsolute(value) || posix.isAbsolute(value)) throw new ArtifactPathError(value, 'path must be relative')
  if (/^[A-Za-z]:\//.test(value)) throw new ArtifactPathError(value, 'path must not use a Windows drive prefix')
  if (value.includes('\\')) throw new ArtifactPathError(value, 'path must use slash separators')
  if (GLOB_METACHARACTER_RE.test(value)) throw new ArtifactPathError(value, 'globs are not payload roots')
  const segments = value.split('/')
  if (segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..')) {
    throw new ArtifactPathError(value, 'path must not contain empty, dot, or parent segments')
  }
  const normalized = posix.normalize(value)
  if (normalized !== value || normalized === '.') {
    throw new ArtifactPathError(value, 'path must already be normalized')
  }
  return value as ArtifactPath
}

export function joinArtifactPath(base: ArtifactPath, child: string): ArtifactPath {
  return artifactPath(`${base}/${child}`)
}

export function isReservedArtifactDestination(path: ArtifactPath): boolean {
  const key = artifactCollisionKey(path)
  return [...RESERVED_ARTIFACT_FILES, ...RESERVED_ARTIFACT_ROOTS]
    .map((reserved) => artifactCollisionKey(reserved as ArtifactPath))
    .some((reserved) => key === reserved || key.startsWith(`${reserved}/`))
}

/**
 * The key is intentionally independent of the contributor locale. JavaScript
 * default case conversion is Unicode-aware and locale-independent. The
 * uppercase/lowercase round trip also applies the multi-character and final
 * sigma folds that a bare lowercase conversion misses (for example ß → ss).
 * NFC makes canonically equivalent names collide before a case-insensitive
 * consumer can observe an ambiguous artifact.
 */
export function artifactCollisionKey(path: ArtifactPath): string {
  return fullCaseFold(path.normalize('NFC'))
}

/** Raw UTF-8 order is the artifact order, never host collation order. */
export function compareArtifactPaths(left: ArtifactPath, right: ArtifactPath): number {
  return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'))
}
