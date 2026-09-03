import type { ImportedWorkRef } from '../config.js'
import { MintError } from '../diagnostics.js'
import { artifactCollisionKey, artifactPath, ArtifactPathError, compareArtifactPaths, type ArtifactPath } from './paths.js'

export interface StagedImportRecord {
  readonly work: string
  readonly artifactPath: string
  readonly sourceKind: 'component' | 'payload' | 'bundle'
}

export interface StagedEvidence {
  readonly artifactPath: string
  readonly sourceKind: StagedImportRecord['sourceKind']
  /** Independent identity from bundle evidence or another provenance-aware producer. */
  readonly work?: string
}

function error(code: string, message: string, path?: string): never {
  throw new MintError({ severity: 'error', code, source: 'staged imports', ...(path === undefined ? {} : { path }), message, action: 'Declare one canonical, non-overlapping imported-work root for the staged content.' })
}

function checked(value: string): ArtifactPath {
  try { return artifactPath(value) } catch (cause) {
    if (cause instanceof ArtifactPathError) error('STAGED_IMPORT_PATH_INVALID', cause.message, value)
    throw cause
  }
}

function within(path: ArtifactPath, root: ArtifactPath): boolean {
  const pathKey = artifactCollisionKey(path)
  const rootKey = artifactCollisionKey(root)
  return pathKey === rootKey || pathKey.startsWith(`${rootKey}/`)
}

export function classifyStagedImports(input: {
  readonly importedWorks: readonly ImportedWorkRef[]
  readonly staged: readonly StagedEvidence[]
}): readonly StagedImportRecord[] {
  // artifactRoots is the sole ownership ledger for staged source files. This
  // validates declared claims and independently identified evidence; it cannot
  // forensically distinguish an undeclared imported source file from authored
  // source bytes without introducing a second, conflicting path authority.
  const claims = input.importedWorks.flatMap((work) => work.artifactRoots.map((root) => ({ work: work.name, root: checked(root) })))
  for (const [index, claim] of claims.entries()) {
    const overlap = claims.slice(index + 1).find((other) => within(claim.root, other.root) || within(other.root, claim.root))
    if (overlap !== undefined) error('STAGED_IMPORT_OVERLAP', `imported works "${claim.work}" and "${overlap.work}" have overlapping roots`, overlap.root)
  }
  const declared = new Set(input.importedWorks.map((work) => work.name))
  const records: StagedImportRecord[] = []
  for (const evidence of input.staged) {
    const path = checked(evidence.artifactPath)
    let work = evidence.work
    if (evidence.sourceKind !== 'bundle') {
      const owners = claims.filter((claim) => within(path, claim.root))
      if (owners.length > 1) error('STAGED_IMPORT_OVERLAP', `staged path "${path}" has multiple imported-work owners`, path)
      work ??= owners[0]?.work
    }
    if (work === undefined) continue
    if (!declared.has(work)) error('STAGED_IMPORT_UNDECLARED', `staged third-party content names undeclared work "${work}"`, path)
    records.push({ work, artifactPath: path, sourceKind: evidence.sourceKind })
  }
  for (const claim of claims) {
    if (!records.some((record) => record.sourceKind !== 'bundle' && record.work === claim.work && within(checked(record.artifactPath), claim.root))) {
      error('STAGED_IMPORT_ROOT_MISSING', `imported-work root "${claim.root}" for "${claim.work}" was not staged`, claim.root)
    }
  }
  return Object.freeze(records.sort((left, right) => Buffer.compare(Buffer.from(left.work), Buffer.from(right.work)) || compareArtifactPaths(checked(left.artifactPath), checked(right.artifactPath)) || left.sourceKind.localeCompare(right.sourceKind)))
}
