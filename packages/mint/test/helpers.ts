import type { FileSet } from '../src/fileset.js'

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
