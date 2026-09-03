import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, existsSync, lstatSync } from 'node:fs'
import { isAbsolute, join, posix } from 'node:path'
import { loadConfig, ConfigError, type MintConfig } from './config.js'
import { parseFrontmatter } from './frontmatter.js'

export interface SkillRef {
  name: string
  dir: string
  description: string
}
export interface SkillTreeFile {
  path: string
  content: Uint8Array
  mode: number
}
export interface PersistedSkillSource {
  contentBase64: string
  mode: number
  renderedSha256: string
  renderedMode: number
}
// `description` and `tools` come from optional markdown frontmatter, and
// buildModel always sets the key — with `undefined` when the field is absent.
// Under exactOptionalPropertyTypes that has to be spelled out: `?: string`
// alone would forbid the assignment. JSON.stringify drops undefined values, so
// the emitted manifests are unchanged either way.
export interface CommandRef {
  name: string
  path: string
  description?: string | undefined
  body: string
}
export interface AgentRef {
  name: string
  path: string
  description?: string | undefined
  tools?: string | undefined
  body: string
}
export interface PluginModel {
  root: string
  config: MintConfig
  skills: SkillRef[]
  skillFiles: SkillTreeFile[]
  commands: CommandRef[]
  agents: AgentRef[]
  hooks?: unknown
  mcp?: unknown
}

export function resolveSkillResource(
  model: PluginModel,
  resourcePath: string,
): SkillTreeFile {
  if (isAbsolute(resourcePath) || posix.isAbsolute(resourcePath)) {
    throw new ConfigError(`resource path must be relative, not absolute: ${resourcePath}`)
  }
  if (resourcePath.includes('\\')) {
    throw new ConfigError(`resource path must use POSIX separators: ${resourcePath}`)
  }

  const segments = resourcePath.split('/')
  if (segments.some((segment) => segment === '..')) {
    throw new ConfigError(`resource path contains traversal: ${resourcePath}`)
  }
  if (
    segments.some((segment) => segment === '' || segment === '.') ||
    segments[0] !== 'skills' ||
    segments.length < 2
  ) {
    throw new ConfigError(
      `resource path must be a normalized plugin-root-relative path under skills/: ${resourcePath}`,
    )
  }

  const relativeSkillPath = segments.slice(1).join('/')
  const target = model.skillFiles.find((file) => file.path === relativeSkillPath)
  if (target) return target

  const absoluteTarget = join(model.root, model.config.components.skills, relativeSkillPath)
  let targetStat: ReturnType<typeof lstatSync>
  try {
    targetStat = lstatSync(absoluteTarget)
  } catch {
    throw new ConfigError(`resource target not found: ${resourcePath}`)
  }
  if (targetStat.isSymbolicLink()) {
    throw new ConfigError(`resource target must not be a symbolic link: ${resourcePath}`)
  }
  if (!targetStat.isFile()) {
    throw new ConfigError(`resource target must be a regular file: ${resourcePath}`)
  }

  // A regular file beneath the configured skills directory must have been
  // captured in buildModel's immutable tree. Reaching this branch means the
  // model and disk no longer agree, so treating it as missing is safer than
  // rendering a link to bytes outside the snapshot being emitted.
  throw new ConfigError(`resource target not found in skill snapshot: ${resourcePath}`)
}

function contentSha256(content: Uint8Array): string {
  return createHash('sha256').update(content).digest('hex')
}

function snapshotSkillTree(
  root: string,
  skillsDir: string,
  persistedSources: Record<string, PersistedSkillSource>,
): SkillTreeFile[] {
  const abs = join(root, skillsDir)
  if (!existsSync(abs)) return []
  const rootStat = lstatSync(abs)
  if (rootStat.isSymbolicLink()) {
    throw new ConfigError(`symbolic link is not supported in skill tree: ${skillsDir}`)
  }
  if (!rootStat.isDirectory()) {
    throw new ConfigError(`unsupported node in skill tree: ${skillsDir}`)
  }

  const files: SkillTreeFile[] = []
  const walk = (directory: string, relativeDir: string): void => {
    for (const entry of readdirSync(directory).sort()) {
      const absolutePath = join(directory, entry)
      const relativePath = relativeDir ? `${relativeDir}/${entry}` : entry
      const stat = lstatSync(absolutePath)
      const displayPath = `${skillsDir.replace(/\/$/, '')}/${relativePath}`
      if (stat.isSymbolicLink()) {
        throw new ConfigError(`symbolic link is not supported in skill tree: ${displayPath}`)
      }
      if (stat.isDirectory()) {
        walk(absolutePath, relativePath)
      } else if (stat.isFile()) {
        const diskContent = readFileSync(absolutePath)
        const diskMode = stat.mode & 0o777
        const persisted = persistedSources[displayPath]
        const recoverPersistedSource =
          persisted !== undefined &&
          typeof persisted.contentBase64 === 'string' &&
          typeof persisted.renderedSha256 === 'string' &&
          typeof persisted.mode === 'number' &&
          typeof persisted.renderedMode === 'number' &&
          contentSha256(diskContent) === persisted.renderedSha256
        files.push({
          path: relativePath,
          content: recoverPersistedSource
            ? Buffer.from(persisted.contentBase64, 'base64')
            : diskContent,
          mode:
            recoverPersistedSource && diskMode === persisted.renderedMode
              ? persisted.mode
              : diskMode,
        })
      } else {
        throw new ConfigError(`unsupported node in skill tree: ${displayPath}`)
      }
    }
  }
  walk(abs, '')
  return files
}

function readSkills(skillsDir: string, skillFiles: SkillTreeFile[]): SkillRef[] {
  return skillFiles
    .filter((file) => /^[^/]+\/SKILL\.md$/.test(file.path))
    .map((file) => {
      const entry = file.path.slice(0, -'/SKILL.md'.length)
      const { data } = parseFrontmatter(Buffer.from(file.content).toString('utf8'))
      return {
        name: typeof data.name === 'string' ? data.name : entry,
        dir: `${skillsDir}/${entry}`,
        description: stringOr(data, 'description') ?? '',
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

function readMarkdownComponents(root: string, dir: string): Array<{
  name: string
  path: string
  data: Record<string, unknown>
  body: string
}> {
  const abs = join(root, dir)
  if (!existsSync(abs)) return []
  return readdirSync(abs)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const { data, body } = parseFrontmatter(readFileSync(join(abs, f), 'utf8'))
      return { name: f.replace(/\.md$/, ''), path: `${dir}/${f}`, data, body }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function stringOr(data: Record<string, unknown>, key: string): string | undefined {
  return typeof data[key] === 'string' ? (data[key] as string) : undefined
}

function readJsonIfPresent(root: string, rel: string): unknown {
  const abs = join(root, rel)
  if (!existsSync(abs)) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(abs, 'utf8'))
  } catch (e) {
    throw new ConfigError(`${rel} is not valid JSON: ${(e as Error).message}`, [], { cause: e })
  }
  // Guards two downstream failure modes: `null` crashes mergedClaudeHooks, and an
  // array silently drops the bootstrap entry when JSON.stringify-d back out.
  if (!isPlainObject(parsed)) {
    throw new ConfigError(`${rel} must contain a JSON object`)
  }
  return parsed
}

export function buildModel(
  root: string,
  persistedSources: Record<string, PersistedSkillSource> = {},
): PluginModel {
  const config = loadConfig(root)
  const skillFiles = snapshotSkillTree(root, config.components.skills, persistedSources)
  const skills = readSkills(config.components.skills, skillFiles)
  const commands = readMarkdownComponents(root, config.components.commands).map((c) => ({
    name: c.name,
    path: c.path,
    description: stringOr(c.data, 'description'),
    body: c.body,
  }))
  const agents = readMarkdownComponents(root, config.components.agents)
    .map((a) => ({
      name: typeof a.data.name === 'string' ? a.data.name : a.name,
      path: a.path,
      description: stringOr(a.data, 'description'),
      tools: stringOr(a.data, 'tools'),
      body: a.body,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
  const model: PluginModel = {
    root,
    config,
    skills,
    skillFiles,
    commands,
    agents,
    hooks: readJsonIfPresent(root, config.components.hooks),
    mcp: readJsonIfPresent(root, config.components.mcp),
  }
  if (config.bootstrap.kind === 'skill') {
    const wanted = config.bootstrap.skill
    if (!skills.some((s) => s.name === wanted)) {
      throw new ConfigError(`bootstrap skill "${wanted}" not found in ${config.components.skills}/`)
    }
  }
  return model
}

export function capturePersistedSkillSources(
  root: string,
  model: PluginModel,
): Record<string, PersistedSkillSource> {
  const skillsDir = model.config.components.skills.replace(/\/$/, '')
  return Object.fromEntries(
    model.skillFiles.flatMap((file): Array<[string, PersistedSkillSource]> => {
      const path = `${skillsDir}/${file.path}`
      const absolutePath = join(root, path)
      const renderedContent = readFileSync(absolutePath)
      if (Buffer.from(file.content).equals(renderedContent)) return []
      return [[
        path,
        {
          contentBase64: Buffer.from(file.content).toString('base64'),
          mode: file.mode,
          renderedSha256: contentSha256(renderedContent),
          renderedMode: lstatSync(absolutePath).mode & 0o777,
        },
      ]]
    }),
  )
}
