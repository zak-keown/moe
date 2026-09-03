import type { FileSet } from '../src/fileset.js'
import { parse, stringify } from 'yaml'
import { TARGET_IDS, type TargetId } from '../src/vocabulary.js'

// Shared shape for the eleven adapter suites: an emitted FileSet indexed by
// path. Upstream each suite built this inline with Object.fromEntries and then
// indexed it directly, which under this workspace's `noUncheckedIndexedAccess`
// is `string | undefined` — so a path typo or a dropped emission surfaced as
// `JSON.parse(undefined)` ("Unexpected token 'u'") or "cannot read split of
// undefined" rather than as the missing path. mustGet names the path and lists
// what was emitted instead.

export function byPathMap(files: FileSet): Record<string, string> {
  return Object.fromEntries(files.map((f) => [f.path, f.content]))
}

export function mustGet(map: Record<string, string>, path: string): string {
  const content = map[path]
  if (content === undefined) {
    throw new Error(`no emitted file at ${path}\n  emitted: ${Object.keys(map).sort().join(', ')}`)
  }
  return content
}

// Package-local policy became mandatory in platform-registry v1. Most legacy
// unit tests exercise a single Mint behavior and should not need to duplicate
// the exhaustive target ledger just to build an otherwise-valid fixture.
// This helper emits the real strict input shape; it does not relax production
// parsing. Existing harness exclusions are structurally mirrored into target intent so
// focused adapter tests keep exercising their requested active set.
export function withV1Policy(yaml: string): string {
  const config = parse(yaml)
  if (!isRecord(config)) throw new Error('withV1Policy requires a YAML mapping')
  const harnesses = config.harnesses
  if (harnesses !== undefined && !isRecord(harnesses)) {
    throw new Error('withV1Policy requires harnesses to be a YAML mapping')
  }
  const excluded = new Set(
    harnesses?.exclude === undefined
      ? []
      : readExcludedTargets(harnesses.exclude),
  )
  config.distribution = { npm: '@example/test-fixture' }
  config.artifact = { payloads: [] }
  config.targets = Object.fromEntries(TARGET_IDS.map((target) => [target, targetPolicy(target, excluded)]))
  config.imported_works = []
  return stringify(config)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readExcludedTargets(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((target) => typeof target !== 'string')) {
    throw new Error('withV1Policy requires harnesses.exclude to be an array of target IDs')
  }
  return value
}

function targetPolicy(target: TargetId, excluded: ReadonlySet<string>): Record<string, unknown> {
  if (excluded.has(target)) return { intent: 'omit' }
  if (target === 'agent-plugins-1.0') {
    return { intent: 'preview', expected_capabilities: [] }
  }
  return { intent: 'preview', expected_capabilities: [], operating_systems: ['macos'] }
}
