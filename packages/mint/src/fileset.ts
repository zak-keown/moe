import { mkdirSync, chmodSync, lstatSync, constants, openSync, writeSync, closeSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { ConfigError } from './config.js'

export interface GeneratedFile {
  path: string
  content: string
  // Adapters that compute this pass the computed value through unconditionally,
  // so `undefined` has to be assignable under exactOptionalPropertyTypes — see
  // the dedupe cases in test/generate.test.ts, which construct the same shape.
  executable?: boolean | undefined
}
export type FileSet = GeneratedFile[]

// Refuse to write through a symlink planted anywhere between rootAbs and
// targetDir — mkdirSync({recursive:true}) and writeFileSync both follow
// symlinks, so a directory component substituted for a symlink would
// silently redirect every file written under it outside the plugin root.
// Checked lexically-within-root component by component; components that
// don't exist yet are fine (mkdirSync will create real directories there).
function assertNoSymlinkInPath(rootAbs: string, targetDir: string): void {
  const rel = relative(rootAbs, targetDir)
  if (rel === '') return
  let current = rootAbs
  for (const segment of rel.split(sep)) {
    current = join(current, segment)
    let st: ReturnType<typeof lstatSync>
    try {
      st = lstatSync(current)
    } catch {
      continue
    }
    if (st.isSymbolicLink()) {
      throw new ConfigError(`refusing to write through a symlink at ${relative(rootAbs, current)}`)
    }
  }
}

export function writeFileSet(root: string, files: FileSet): void {
  const rootAbs = resolve(root)
  const resolved = files.map((file) => {
    if (isAbsolute(file.path)) {
      throw new ConfigError(`generated file path must be relative to plugin root: ${file.path}`)
    }
    const abs = resolve(root, file.path)
    if (!abs.startsWith(rootAbs + sep)) {
      throw new ConfigError(`generated file path escapes plugin root: ${file.path}`)
    }
    return { file, abs }
  })
  for (const { file, abs } of resolved) {
    assertNoSymlinkInPath(rootAbs, dirname(abs))
    mkdirSync(dirname(abs), { recursive: true })
    // O_NOFOLLOW: refuse if the leaf itself is a symlink — dangling or not,
    // and regardless of --force, which only means "overwrite a file
    // moe-mint doesn't recognize as its own", never "write through a link
    // to wherever it points". This also closes the TOCTOU window between
    // the containment checks above and this write. openSync/writeSync
    // (rather than writeFileSync's options.flag, typed as string-only) is
    // what lets a raw O_* bitmask reach the actual open() call.
    let fd: number
    try {
      fd = openSync(abs, constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW, 0o666)
    } catch (err) {
      if (err instanceof Error && 'code' in err && err.code === 'ELOOP') {
        throw new ConfigError(`refusing to write through a symlink at ${relative(rootAbs, abs)}`)
      }
      throw err
    }
    try {
      writeSync(fd, file.content)
    } finally {
      closeSync(fd)
    }
    if (file.executable) chmodSync(abs, 0o755)
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * Deep-merges two objects. For each key in override:
 * - If the value is `null`, the key is deleted from the result (delete sentinel).
 * - If both base and override values are plain objects, recurse.
 * - Otherwise, replace the base value with the override value.
 *
 * Null-stripping applies at every depth, even where base has no corresponding
 * key: a missing key recurses against an empty object rather than adopting the
 * override subtree verbatim, so a `null` nested arbitrarily deep is always
 * treated as a delete sentinel. Arrays are opaque to the sentinel — they
 * replace the base value wholesale, so `null` entries inside an array survive.
 *
 * Note: A literal null can no longer be set via overrides as a value; `null` is
 * treated as a delete sentinel. This is a deliberate trade-off to enable removal
 * of inherited fields.
 */
export function deepMerge(base: unknown, override: unknown): unknown {
  if (!isPlainObject(override)) return override

  const out: Record<string, unknown> = isPlainObject(base) ? { ...base } : {}

  for (const [key, value] of Object.entries(override)) {
    if (value === null) {
      delete out[key]
    } else {
      out[key] = deepMerge(out[key], value)
    }
  }
  return out
}
