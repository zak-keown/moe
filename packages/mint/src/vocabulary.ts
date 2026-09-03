export const TARGET_IDS = [
  'claude-code',
  'cursor',
  'codex',
  'kimi',
  'opencode',
  'pi',
  'agent-plugins-1.0',
  'copilot',
] as const

export type TargetId = (typeof TARGET_IDS)[number]

export const CAPABILITY_IDS = [
  'skill-discovery',
  'skill-invocation',
  'command-discovery',
  'command-invocation',
  'agent-discovery',
  'hook-execution',
  'mcp-registration',
  'bootstrap-routing',
  'executable-invocation',
  'format-conformance',
] as const

export type CapabilityId = (typeof CAPABILITY_IDS)[number]
export type TargetIntent = 'certify' | 'preview' | 'omit'
export type OperatingSystemId = 'macos' | 'linux' | 'wsl2' | 'windows'

export const OPERATING_SYSTEM_IDS = ['macos', 'linux', 'wsl2', 'windows'] as const satisfies readonly OperatingSystemId[]

import { readFileSync, existsSync, lstatSync, readdirSync, statSync } from 'node:fs'
import { basename, dirname, extname, isAbsolute, join, posix, resolve, sep } from 'node:path'
import { parse } from 'yaml'
import { z } from 'zod'
import { ConfigError } from './diagnostics.js'
import type { PluginModel, SkillTreeFile } from './model.js'
import { writeFileSet, type GeneratedFile } from './fileset.js'
import type { HarnessAdapter, SkillLayout } from './adapters/types.js'

export const TOKEN_NAME_RE = /^[a-z][a-z0-9-]*$/

export type VocabEntry = Record<string, string>

export interface Vocabulary {
  tokens: Map<string, VocabEntry>
  blocks: Map<string, VocabEntry>
}

const entrySchema = z.record(z.string(), z.string())

const vocabSchema = z.object({
  tokens: z.record(z.string(), entrySchema).optional().default({}),
  blocks: z.record(z.string(), entrySchema).optional().default({}),
})

function vocabularyFileFor(configFile: string): string {
  const extension = extname(configFile) || '.yaml'
  const stem = basename(configFile, extname(configFile))
  return join(dirname(configFile), `${stem}-vocab${extension}`)
}

export function loadVocabulary(root: string, configFile = 'moe-mint.yaml'): Vocabulary | null {
  const vocabularyFile = vocabularyFileFor(configFile)
  const vocabPath = join(root, vocabularyFile)
  if (!existsSync(vocabPath)) return null

  let doc: unknown
  try {
    doc = parse(readFileSync(vocabPath, 'utf8'))
  } catch (e) {
    throw new ConfigError(
      `${vocabularyFile} is not valid YAML: ${(e as Error).message}`,
      [],
      { cause: e },
    )
  }

  const parsed = vocabSchema.safeParse(doc)
  if (!parsed.success) {
    throw new ConfigError(
      `${vocabularyFile} is invalid`,
      parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
    )
  }

  const { tokens: rawTokens, blocks: rawBlocks } = parsed.data

  const allNames = [...Object.keys(rawTokens), ...Object.keys(rawBlocks)]
  for (const name of allNames) {
    if (!TOKEN_NAME_RE.test(name)) {
      throw new ConfigError(
        `invalid token name "${name}": must match ${TOKEN_NAME_RE}`,
      )
    }
  }

  for (const name of Object.keys(rawTokens)) {
    if (name in rawBlocks) {
      throw new ConfigError(`"${name}" is defined as both a token and a block`)
    }
  }

  return {
    tokens: new Map(Object.entries(rawTokens) as Array<[string, VocabEntry]>),
    blocks: new Map(Object.entries(rawBlocks) as Array<[string, VocabEntry]>),
  }
}

export function validateCoverage(
  vocab: Vocabulary,
  activeAdapters: string[],
): void {
  const missing: string[] = []
  for (const [name, entry] of vocab.tokens) {
    for (const adapter of activeAdapters) {
      if (!(adapter in entry)) {
        missing.push(`token "${name}" has no mapping for adapter "${adapter}"`)
      }
    }
  }
  for (const [name, entry] of vocab.blocks) {
    for (const adapter of activeAdapters) {
      if (!(adapter in entry)) {
        missing.push(`block "${name}" has no mapping for adapter "${adapter}"`)
      }
    }
  }
  if (missing.length > 0) {
    throw new ConfigError('incomplete vocabulary coverage', missing)
  }
}

const TOKEN_PATTERN = /(?<!\\)\{([a-z][a-z0-9-]*)\}/g
const RESOURCE_PATTERN = /(?<!\\)\{resource:([^{}\n]*)\}/g

export type ResourceRenderer = (resourcePath: string) => string

function resolveSkillResource(model: PluginModel, resourcePath: string): SkillTreeFile {
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
    segments.some((segment) => segment === '' || segment === '.')
    || segments[0] !== 'skills'
    || segments.length < 2
  ) {
    throw new ConfigError(
      `resource path must be a normalized plugin-root-relative path under skills/: ${resourcePath}`,
    )
  }
  const relativeSkillPath = segments.slice(1).join('/')
  const target = model.skillFiles.find((file) => file.path === relativeSkillPath)
  if (target !== undefined) return target
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
  throw new ConfigError(`resource target not found in skill snapshot: ${resourcePath}`)
}

interface MarkdownFence {
  marker: '`' | '~'
  length: number
}

function advanceMarkdownFence(
  line: string,
  fence: MarkdownFence | null,
): { literal: boolean; next: MarkdownFence | null } {
  if (fence) {
    const closing = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(line)
    const markerRun = closing?.[1]
    const closesFence =
      markerRun !== undefined &&
      markerRun[0] === fence.marker &&
      markerRun.length >= fence.length
    return { literal: true, next: closesFence ? null : fence }
  }

  const opening = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line)
  const markerRun = opening?.[1]
  const info = opening?.[2]
  if (
    markerRun === undefined ||
    info === undefined ||
    (markerRun[0] === '`' && info.includes('`'))
  ) {
    return { literal: false, next: null }
  }

  return {
    literal: true,
    next: {
      marker: markerRun[0] as '`' | '~',
      length: markerRun.length,
    },
  }
}

export function substituteContent(
  content: string,
  adapterName: string,
  vocab: Vocabulary,
  renderResource?: ResourceRenderer,
): string {
  const lines = content.split('\n')
  const result: string[] = []
  let fence: MarkdownFence | null = null

  for (const line of lines) {
    const fenceLine = advanceMarkdownFence(line, fence)
    fence = fenceLine.next
    if (fenceLine.literal) {
      result.push(line)
      continue
    }

    const blockMatch = /^(\s*)(?<!\\)\{([a-z][a-z0-9-]*)\}\s*$/.exec(line)
    if (blockMatch) {
      const indent = blockMatch[1]!
      const tokenName = blockMatch[2]!
      const blockEntry = vocab.blocks.get(tokenName)
      if (blockEntry && adapterName in blockEntry) {
        for (const blockLine of blockEntry[adapterName]!.split('\n')) {
          result.push(blockLine ? indent + blockLine : '')
        }
        continue
      }
    }

    let substituted = line.replace(RESOURCE_PATTERN, (expression, resourcePath: string) => {
      return renderResource ? renderResource(resourcePath) : expression
    })

    substituted = substituted.replace(TOKEN_PATTERN, (_match, tokenName: string) => {
      const inlineEntry = vocab.tokens.get(tokenName)
      if (inlineEntry && adapterName in inlineEntry) return inlineEntry[adapterName]!
      const blockEntry = vocab.blocks.get(tokenName)
      if (blockEntry && adapterName in blockEntry) return blockEntry[adapterName]!
      return `{${tokenName}}`
    })

    substituted = substituted.replace(/\\(\{[a-z][a-z0-9-]*\})/g, '$1')
    substituted = substituted.replace(/\\(\{resource:[^{}\n]*\})/g, '$1')
    result.push(substituted)
  }

  return result.join('\n')
}

function collectMdFiles(root: string, dir: string): string[] {
  const abs = join(root, dir)
  if (!existsSync(abs)) return []
  const result: string[] = []
  const walk = (d: string, rel: string) => {
    for (const entry of readdirSync(d).sort()) {
      const full = join(d, entry)
      const relPath = `${rel}/${entry}`
      if (statSync(full).isDirectory()) {
        walk(full, relPath)
      } else if (entry.endsWith('.md')) {
        result.push(relPath)
      }
    }
  }
  walk(abs, dir)
  return result
}

function stripFencedBlocks(content: string): string {
  let fence: MarkdownFence | null = null
  return content
    .split('\n')
    .map((line) => {
      const fenceLine = advanceMarkdownFence(line, fence)
      fence = fenceLine.next
      return fenceLine.literal ? '' : line
    })
    .join('\n')
}

/** Returns unescaped semantic resource targets outside Markdown fences. */
export function semanticResourceTargets(content: string): readonly string[] {
  const targets: string[] = []
  const stripped = stripFencedBlocks(content)
  RESOURCE_PATTERN.lastIndex = 0
  for (const match of stripped.matchAll(RESOURCE_PATTERN)) {
    targets.push(match[1]!)
  }
  return targets
}

export function scanForUnknownTokens(
  root: string,
  skillsDir: string,
  vocab: Vocabulary,
): void {
  const allTokens = new Set([...vocab.tokens.keys(), ...vocab.blocks.keys()])
  const problems: string[] = []

  for (const relPath of collectMdFiles(root, skillsDir)) {
    const content = readFileSync(join(root, relPath), 'utf8')
    const stripped = stripFencedBlocks(content)
    const lines: string[] = stripped.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const line: string = lines[i]!
      let match: RegExpExecArray | null
      TOKEN_PATTERN.lastIndex = 0
      while ((match = TOKEN_PATTERN.exec(line)) !== null) {
        const tokenName = match[1] as string
        if (!allTokens.has(tokenName)) {
          problems.push(`unknown token {${tokenName}} in ${relPath} line ${i + 1}`)
        }
      }
    }
  }

  if (problems.length > 0) {
    throw new ConfigError('unknown tokens in skill files', problems)
  }
}

export function assertNoSurvivors(
  files: Array<{ path: string; content: string | Uint8Array }>,
  sourceFiles: PluginModel['skillFiles'] = [],
): void {
  assertNoExpressions(files, true, sourceFiles)
}

export function assertNoResourceSurvivors(
  files: Array<{ path: string; content: string | Uint8Array }>,
  sourceFiles: PluginModel['skillFiles'] = [],
): void {
  assertNoExpressions(files, false, sourceFiles)
}

function assertNoExpressions(
  files: Array<{ path: string; content: string | Uint8Array }>,
  includeVocabularyTokens: boolean,
  sourceFiles: PluginModel['skillFiles'],
): void {
  const problems: string[] = []
  const sourceBySpecificity = [...sourceFiles].sort((left, right) => right.path.length - left.path.length)
  for (const file of files) {
    if (!file.path.endsWith('.md')) continue
    const source = sourceBySpecificity.find(
      (candidate) => file.path === candidate.path || file.path.endsWith(`/${candidate.path}`),
    )
    const literalAllowances = new Map<string, number>()
    if (source) {
      const sourceText = stripFencedBlocks(Buffer.from(source.content).toString('utf8'))
      const escapedExpression = /\\(\{(?:[a-z][a-z0-9-]*|resource:[^{}\n]*)\})/g
      let escapedMatch: RegExpExecArray | null
      while ((escapedMatch = escapedExpression.exec(sourceText)) !== null) {
        const expression = escapedMatch[1]!
        literalAllowances.set(expression, (literalAllowances.get(expression) ?? 0) + 1)
      }
    }
    const isAllowedLiteral = (expression: string): boolean => {
      const remaining = literalAllowances.get(expression) ?? 0
      if (remaining === 0) return false
      literalAllowances.set(expression, remaining - 1)
      return true
    }
    const stripped = stripFencedBlocks(
      typeof file.content === 'string' ? file.content : Buffer.from(file.content).toString('utf8'),
    )
    const lines: string[] = stripped.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const line: string = lines[i]!
      let match: RegExpExecArray | null
      if (includeVocabularyTokens) {
        TOKEN_PATTERN.lastIndex = 0
        while ((match = TOKEN_PATTERN.exec(line)) !== null) {
          const tokenName = match[1] as string
          const expression = `{${tokenName}}`
          if (!isAllowedLiteral(expression)) {
            problems.push(`surviving token ${expression} in ${file.path} line ${i + 1}`)
          }
        }
      }
      RESOURCE_PATTERN.lastIndex = 0
      while ((match = RESOURCE_PATTERN.exec(line)) !== null) {
        const expression = `{resource:${match[1]}}`
        if (!isAllowedLiteral(expression)) {
          problems.push(`surviving resource expression ${expression} in ${file.path} line ${i + 1}`)
        }
      }
    }
  }

  if (problems.length > 0) {
    throw new ConfigError('semantic expressions survived substitution', problems)
  }
}

// Points both config.components.skills and each captured skill directory at
// an adapter's generated skill tree. Adapter manifests and bootstrap loaders
// therefore resolve the same profile-rendered files; leaving skill.dir at the
// source path would make a loader bypass semantic substitution.
export function adjustedModel(
  model: PluginModel,
  layout: SkillLayout,
): PluginModel {
  const sourcePrefix = model.config.components.skills.replace(/\/+$/, '')
  return {
    ...model,
    skills: model.skills.map((skill) => ({
      ...skill,
      dir: `${layout.outputDir}/${skill.dir.slice(sourcePrefix.length).replace(/^\/+/, '')}`,
    })),
    config: {
      ...model.config,
      components: {
        ...model.config.components,
        skills: layout.outputDir,
      },
    },
  }
}

function validateLayout(
  root: string,
  sourceDir: string,
  adapter: HarnessAdapter,
): 'rendered' | 'in-place' {
  const { outputDir, mode } = adapter.skillLayout
  const rootAbs = resolve(root)
  if (outputDir.length === 0 || outputDir.includes('\\') || outputDir.split('/').includes('')) {
    throw new ConfigError(
      `adapter "${adapter.name}" skill output directory is not a normalized relative path: ${outputDir}`,
    )
  }
  if (isAbsolute(outputDir)) {
    throw new ConfigError(`adapter "${adapter.name}" skill output directory must be relative: ${outputDir}`)
  }
  if (outputDir.split('/').some((segment) => segment === '.' || segment === '..')) {
    throw new ConfigError(
      `adapter "${adapter.name}" skill output directory contains traversal: ${outputDir}`,
    )
  }
  const outputAbs = resolve(root, outputDir)
  if (outputAbs !== rootAbs && !outputAbs.startsWith(rootAbs + sep)) {
    throw new ConfigError(`adapter "${adapter.name}" skill output directory escapes plugin root: ${outputDir}`)
  }
  if (mode === 'in-place' && outputAbs !== resolve(root, sourceDir)) {
    throw new ConfigError(
      `adapter "${adapter.name}" in-place skill output directory must equal ${sourceDir}: ${outputDir}`,
    )
  }
  return mode === 'source-or-rendered'
    ? outputAbs === resolve(root, sourceDir)
      ? 'in-place'
      : 'rendered'
    : mode
}

function transformedContent(
  file: PluginModel['skillFiles'][number],
  profile: string,
  outputDir: string,
  model: PluginModel,
  vocab: Vocabulary,
): Uint8Array {
  if (!file.path.endsWith('.md')) return Buffer.from(file.content)
  const currentDocument = posix.join(outputDir, file.path)
  return Buffer.from(
    substituteContent(
      Buffer.from(file.content).toString('utf8'),
      profile,
      vocab,
      (resourcePath) => {
        const resource = resolveSkillResource(model, resourcePath)
        const generatedTarget = posix.join(outputDir, resource.path)
        const relativeTarget = posix.relative(posix.dirname(currentDocument), generatedTarget)
        const encodedTarget = relativeTarget
          .split('/')
          .map((segment) => segment === '..'
            ? segment
            : encodeURIComponent(segment).replaceAll('(', '%28').replaceAll(')', '%29'))
          .join('/')
        const label = resourcePath.replaceAll('\\', '\\\\').replaceAll('[', '\\[').replaceAll(']', '\\]')
        return `[${label}](${encodedTarget})`
      },
    ),
    'utf8',
  )
}

export interface SkillRenderPlan {
  readonly generatedFiles: GeneratedFile<Uint8Array>[]
  readonly sourceUpdates: GeneratedFile<Uint8Array>[]
}

// Plans a render from the immutable skill-tree snapshot captured by buildModel.
// Validation callers can inspect the complete result without mutating either
// canonical source or a staged artifact tree.
export function planSkillRendering(
  root: string,
  model: PluginModel,
  vocab: Vocabulary,
  activeAdapters: HarnessAdapter[],
): SkillRenderPlan {
  const srcDir = model.config.components.skills
  const generatedFiles: GeneratedFile<Uint8Array>[] = []
  const sourceUpdates: GeneratedFile<Uint8Array>[] = []
  const byOutputDir = new Map<
    string,
    { adapter: HarnessAdapter; names: string[]; mode: 'rendered' | 'in-place' }
  >()

  for (const adapter of activeAdapters) {
    const mode = validateLayout(root, srcDir, adapter)
    const existing = byOutputDir.get(adapter.skillLayout.outputDir)
    if (existing) {
      const sameProfile = existing.adapter.skillLayout.profile === adapter.skillLayout.profile
      const sameMode = existing.mode === mode
      if (!sameProfile || !sameMode) {
        throw new ConfigError(
          `adapters "${existing.names.join(', ')}" and "${adapter.name}" share skill output directory ` +
            `${adapter.skillLayout.outputDir} with incompatible profiles or modes`,
        )
      }
      existing.names.push(adapter.name)
    } else {
      byOutputDir.set(adapter.skillLayout.outputDir, { adapter, names: [adapter.name], mode })
    }
  }

  for (const { adapter, mode } of byOutputDir.values()) {
    const { outputDir, profile } = adapter.skillLayout
    const tree = model.skillFiles.map((file) => ({
      path: `${outputDir.replace(/\/$/, '')}/${file.path}`,
      content: transformedContent(file, profile, outputDir, model, vocab),
      mode: file.mode,
    }))
    if (vocab.tokens.size > 0 || vocab.blocks.size > 0) {
      assertNoSurvivors(tree, model.skillFiles)
    } else {
      assertNoResourceSurvivors(tree, model.skillFiles)
    }
    if (mode === 'in-place') {
      sourceUpdates.push(...tree)
    } else {
      generatedFiles.push(...tree)
    }
  }

  if (![...byOutputDir.values()].some(({ mode }) => mode === 'in-place')) {
    sourceUpdates.push(...model.skillFiles.map((file) => ({
      path: `${srcDir.replace(/\/$/, '')}/${file.path}`,
      content: file.content,
      mode: file.mode,
    })))
  }

  const byPath = (left: GeneratedFile<Uint8Array>, right: GeneratedFile<Uint8Array>): number =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0
  return {
    generatedFiles: generatedFiles.sort(byPath),
    sourceUpdates: sourceUpdates.sort(byPath),
  }
}

/** Backward-compatible imperative wrapper used by focused renderer tests. */
export function substituteAllSkills(
  root: string,
  model: PluginModel,
  vocab: Vocabulary,
  activeAdapters: HarnessAdapter[],
): GeneratedFile<Uint8Array>[] {
  const plan = planSkillRendering(root, model, vocab, activeAdapters)
  writeFileSet(root, plan.sourceUpdates)
  return plan.generatedFiles
}
