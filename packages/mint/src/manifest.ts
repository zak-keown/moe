import { createHash } from 'node:crypto'
import { readFileSync, existsSync, mkdirSync, writeFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { ConfigError } from './config.js'
import { contentBytes, type FileContent, type FileSet } from './fileset.js'
import type { PersistedSkillSource } from './model.js'

export const MANIFEST_PATH = '.moe-mint/manifest.json'

export interface ManifestEntry {
  sha256: string
  executable?: true
  mode?: number
}

export interface GenerationManifest {
  schema: 1
  tool: string
  files: Record<string, ManifestEntry>
  skillSources?: Record<string, PersistedSkillSource>
}

export function sha256(content: FileContent): string {
  return createHash('sha256').update(contentBytes(content)).digest('hex')
}

function isExecutable(path: string): boolean {
  return (statSync(path).mode & 0o111) !== 0
}

function permissionMode(path: string): number {
  return statSync(path).mode & 0o777
}

export function loadManifest(root: string): GenerationManifest | undefined {
  const abs = join(root, MANIFEST_PATH)
  if (!existsSync(abs)) return undefined
  let manifest: unknown
  try {
    manifest = JSON.parse(readFileSync(abs, 'utf8'))
  } catch (e) {
    throw new ConfigError(`${MANIFEST_PATH} is not valid JSON: ${(e as Error).message}`, [], { cause: e })
  }
  const m = manifest as GenerationManifest
  if (typeof m !== 'object' || m === null || typeof m.files !== 'object' || m.files === null) {
    throw new ConfigError(`${MANIFEST_PATH} has an unrecognized format — regenerate with \`moe-mint generate\``)
  }
  if (m.skillSources !== undefined) {
    if (typeof m.skillSources !== 'object' || m.skillSources === null || Array.isArray(m.skillSources)) {
      throw new ConfigError(
        `${MANIFEST_PATH} has an invalid skillSources map — regenerate with \`moe-mint generate\``,
      )
    }
    for (const [path, source] of Object.entries(m.skillSources)) {
      if (
        typeof source !== 'object' ||
        source === null ||
        typeof source.contentBase64 !== 'string' ||
        typeof source.mode !== 'number' ||
        !Number.isFinite(source.mode) ||
        typeof source.renderedSha256 !== 'string' ||
        typeof source.renderedMode !== 'number' ||
        !Number.isFinite(source.renderedMode)
      ) {
        throw new ConfigError(
          `${MANIFEST_PATH} has an invalid skillSources entry for ${path} — regenerate with \`moe-mint generate\``,
        )
      }
    }
  }
  return m
}

export function saveManifest(
  root: string,
  files: FileSet<FileContent>,
  toolVersion: string,
  skillSources: Record<string, PersistedSkillSource> = {},
): void {
  const manifest: GenerationManifest = {
    schema: 1,
    tool: `moe-mint@${toolVersion}`,
    files: Object.fromEntries(
      [...files]
        .sort((a, b) => (a.path < b.path ? -1 : 1))
        .map((f) => [f.path, {
          sha256: sha256(f.content),
          ...(f.mode !== undefined
            ? { mode: f.mode }
            : f.executable
              ? { executable: true as const }
              : {}),
        }]),
    ),
    ...(Object.keys(skillSources).length > 0 ? { skillSources } : {}),
  }
  const abs = join(root, MANIFEST_PATH)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, JSON.stringify(manifest, null, 2) + '\n')
}

export interface DriftReport {
  missing: string[]
  modified: string[]
  clean: boolean
}

export function checkDrift(root: string, opts: { checkExecBit?: boolean } = {}): DriftReport {
  const checkExecBit = opts.checkExecBit ?? process.platform !== 'win32'
  const manifest = loadManifest(root)
  if (!manifest) {
    throw new ConfigError(`no generation manifest at ${MANIFEST_PATH} — run \`moe-mint generate\` first`)
  }
  const missing: string[] = []
  const modified: string[] = []
  for (const [path, entry] of Object.entries(manifest.files)) {
    const filePath = join(root, path)
    if (!existsSync(filePath)) missing.push(path)
    else if (
      sha256(readFileSync(filePath)) !== entry.sha256 ||
      (checkExecBit && (
        entry.mode !== undefined
          ? permissionMode(filePath) !== entry.mode
          : isExecutable(filePath) !== Boolean(entry.executable)
      ))
    )
      modified.push(path)
  }
  return { missing, modified, clean: missing.length === 0 && modified.length === 0 }
}
