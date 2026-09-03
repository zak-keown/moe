import { MintError } from '../diagnostics.js'
import type { GeneratedFile } from '../fileset.js'
import { validateManifestReferences } from '../package-manifest.js'
import type { ArtifactManifestV1 } from './artifact-manifest.js'
import { artifactCollisionKey, artifactPath, ArtifactPathError } from './paths.js'

export interface ArtifactReferenceContext {
  readonly artifactManifest: ArtifactManifestV1
  readonly packageManifest: Readonly<Record<string, unknown>>
  readonly componentDirectories?: Readonly<Partial<Record<'skills' | 'commands' | 'agents' | 'hooks' | 'prompts' | 'mcp', string>>>
  readonly generatedFiles: readonly GeneratedFile[]
  readonly componentFiles?: readonly GeneratedFile[]
}

function failure(code: string, message: string, path?: string, cause?: unknown): never {
  throw new MintError({ severity: 'error', code, source: 'artifact references', ...(path === undefined ? {} : { path }), message, action: 'Stage the referenced artifact path or correct the generated metadata.' }, { cause })
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) failure('ARTIFACT_REFERENCE_INVALID', `${field} must be an object`)
  return value as Record<string, unknown>
}

function local(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) failure('ARTIFACT_REFERENCE_INVALID', `${field} must be a non-empty string`)
  const candidate = value.replace(/^\.\//, '').replace(/\/$/, '')
  if (candidate === '' || candidate === '.') return ''
  try {
    return artifactPath(candidate)
  } catch (error) {
    if (error instanceof ArtifactPathError) failure('ARTIFACT_REFERENCE_ESCAPE', `${field} escapes or is not an artifact-relative POSIX path`, value, error)
    throw error
  }
}

export function validateArtifactReferences(context: ArtifactReferenceContext): void {
  const paths = new Set(context.artifactManifest.files.map((entry) => entry.path))
  const collisions = new Map<string, string>()
  for (const path of paths) {
    let key: string
    try { key = artifactCollisionKey(artifactPath(path)) } catch (error) { failure('ARTIFACT_REFERENCE_ESCAPE', `invalid artifact row path "${path}"`, path, error) }
    const previous = collisions.get(key)
    if (previous !== undefined) failure('ARTIFACT_REFERENCE_COLLISION', `artifact paths "${previous}" and "${path}" collide`, path)
    collisions.set(key, path)
  }
  validateManifestReferences(context.packageManifest, paths)

  const exact = (value: unknown, field: string): string => {
    const path = local(value, field)
    if (!paths.has(path)) failure('ARTIFACT_REFERENCE_MISSING', `${field} references missing file "${path}"`, path)
    return path
  }
  const directory = (value: unknown, field: string): string => {
    const path = local(value, field)
    if (path !== '' && !paths.has(path) && ![...paths].some((candidate) => candidate.startsWith(`${path}/`))) {
      failure('ARTIFACT_REFERENCE_MISSING', `${field} references missing directory "${path}"`, path)
    }
    return path
  }

  for (const [kind, value] of Object.entries(context.componentDirectories ?? {})) {
    if (kind === 'hooks') {
      const path = local(value, `components.${kind}`)
      if (paths.has(path)) exact(path, `components.${kind}`)
      else directory(path, `components.${kind}`)
    } else if (kind === 'mcp') exact(value, `components.${kind}`)
    else directory(value, `components.${kind}`)
  }

  function pluginManifest(file: GeneratedFile, parsed: Record<string, unknown>): void {
    for (const field of ['skills', 'commands', 'agents']) if (parsed[field] !== undefined) directory(parsed[field], `${file.path}.${field}`)
    for (const field of ['hooks', 'mcpServers']) {
      if (parsed[field] !== undefined && typeof parsed[field] !== 'object') exact(parsed[field], `${file.path}.${field}`)
    }
    if (file.path === '.kimi-plugin/plugin.json' && parsed.sessionStart !== undefined) {
      const session = record(parsed.sessionStart, `${file.path}.sessionStart`)
      if (session.skill !== undefined) {
        const skills = directory(parsed.skills, `${file.path}.skills`)
        if (typeof session.skill !== 'string' || session.skill.length === 0) failure('ARTIFACT_REFERENCE_INVALID', `${file.path}.sessionStart.skill must be a string`)
        exact(`${skills}/${session.skill}/SKILL.md`, `${file.path}.sessionStart.skill`)
      }
    }
  }

  function hookManifest(file: GeneratedFile, parsed: Record<string, unknown>): void {
    const hooks = record(parsed.hooks, `${file.path}.hooks`)
    for (const [event, groups] of Object.entries(hooks)) {
      if (!Array.isArray(groups)) failure('ARTIFACT_REFERENCE_INVALID', `${file.path}.hooks.${event} must be an array`)
      for (const group of groups) {
        const outer = record(group, `${file.path}.hooks.${event}`)
        const entries = Array.isArray(outer.hooks) ? outer.hooks : [outer]
        for (const entry of entries) {
          const hook = record(entry, `${file.path}.hooks.${event}`)
          if (hook.command === undefined) continue
          if (typeof hook.command !== 'string') failure('ARTIFACT_REFERENCE_INVALID', `${file.path} hook command must be a string`)
          const match = hook.command.match(/(?:\$\{CLAUDE_PLUGIN_ROOT\}\/|\.\/)([^"'\s]+)/)
          if (match?.[1] !== undefined) exact(match[1], `${file.path}.command`)
        }
      }
    }
  }

  function mcpManifest(file: GeneratedFile, parsed: Record<string, unknown>): void {
    const servers = record(parsed.mcpServers, `${file.path}.mcpServers`)
    for (const [name, value] of Object.entries(servers)) {
      const server = record(value, `${file.path}.mcpServers.${name}`)
      if (typeof server.command === 'string' && server.command.startsWith('./')) exact(server.command, `${file.path}.${name}.command`)
      if (server.args !== undefined) {
        if (!Array.isArray(server.args) || server.args.some((arg) => typeof arg !== 'string')) failure('ARTIFACT_REFERENCE_INVALID', `${file.path}.${name}.args must be strings`)
        for (const [index, arg] of server.args.entries()) {
          const match = arg.match(/^(?:\$\{CLAUDE_PLUGIN_ROOT\}\/|\.\/)(.+)$/)
          if (match?.[1] !== undefined) exact(match[1], `${file.path}.${name}.args[${index}]`)
        }
      }
      if (typeof server.cwd === 'string' && (server.cwd === '.' || server.cwd.startsWith('./'))) directory(server.cwd, `${file.path}.${name}.cwd`)
    }
  }

  for (const file of [...context.generatedFiles, ...(context.componentFiles ?? [])]) {
    exact(file.path, 'generated file')
    if (!file.path.endsWith('.json')) continue
    let parsed: Record<string, unknown>
    try { parsed = record(JSON.parse(file.content), file.path) } catch (error) {
      if (error instanceof MintError) throw error
      failure('ARTIFACT_REFERENCE_INVALID', `${file.path} is not valid JSON`, file.path, error)
    }
    if (/^\.(?:claude|codex|cursor|kimi)-plugin\/plugin\.json$/.test(file.path)) pluginManifest(file, parsed)
    if (file.path === context.componentDirectories?.hooks || file.path.endsWith('/hooks.json') || file.path.endsWith('/hooks-cursor.json')) hookManifest(file, parsed)
    if (file.path === context.componentDirectories?.mcp || file.path === 'mcp.json') mcpManifest(file, parsed)
    if (file.path === '.agents/plugins/marketplace.json') {
      const plugins = parsed.plugins
      if (!Array.isArray(plugins)) failure('ARTIFACT_REFERENCE_INVALID', `${file.path}.plugins must be an array`)
      for (const plugin of plugins) {
        const source = record(record(plugin, `${file.path}.plugins`).source, `${file.path}.source`)
        if (source.url === './') directory('./', `${file.path}.source.url`)
      }
    }
  }
}
