import type { FileSet } from '../src/fileset.js'
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
// parsing. Existing harness exclusions are mirrored into target intent so
// focused adapter tests keep exercising their requested active set.
export function withV1Policy(yaml: string): string {
  const excluded = new Set(
    [...yaml.matchAll(/^\s*exclude:\s*\[([^\]]*)\]\s*$/gm)]
      .flatMap((match) => match[1]?.split(',').map((name) => name.trim()) ?? [])
      .filter(Boolean),
  )
  const targets = TARGET_IDS.map((target) => targetPolicy(target, excluded)).join('\n')
  const policy = [
    'distribution:',
    '  npm: "@example/test-fixture"',
    'artifact:',
    '  payloads: []',
    'targets:',
    targets,
    'imported_works: []',
  ].join('\n')
  const harnesses = /^harnesses:\s*$/m
  return harnesses.test(yaml)
    ? yaml.replace(harnesses, `${policy}\nharnesses:`)
    : `${yaml.trimEnd()}\n${policy}\n`
}

function targetPolicy(target: TargetId, excluded: ReadonlySet<string>): string {
  if (excluded.has(target)) return `  ${target}: { intent: omit }`
  if (target === 'agent-plugins-1.0') {
    return `  ${target}: { intent: preview, expected_capabilities: [] }`
  }
  return `  ${target}: { intent: preview, expected_capabilities: [], operating_systems: [macos] }`
}
