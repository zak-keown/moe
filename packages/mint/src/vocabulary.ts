import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { isAbsolute, join, resolve, sep } from 'node:path'
import { parse } from 'yaml'
import { z } from 'zod'
import { ConfigError } from './config.js'
import type { PluginModel } from './model.js'
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

export function loadVocabulary(root: string): Vocabulary | null {
  const vocabPath = join(root, 'moe-mint-vocab.yaml')
  if (!existsSync(vocabPath)) return null

  let doc: unknown
  try {
    doc = parse(readFileSync(vocabPath, 'utf8'))
  } catch (e) {
    throw new ConfigError(
      `moe-mint-vocab.yaml is not valid YAML: ${(e as Error).message}`,
      [],
      { cause: e },
    )
  }

  const parsed = vocabSchema.safeParse(doc)
  if (!parsed.success) {
    throw new ConfigError(
      'moe-mint-vocab.yaml is invalid',
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

export function substituteContent(
  content: string,
  adapterName: string,
  vocab: Vocabulary,
): string {
  const lines = content.split('\n')
  const result: string[] = []

  for (const line of lines) {
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

    let substituted = line.replace(TOKEN_PATTERN, (_match, tokenName: string) => {
      const inlineEntry = vocab.tokens.get(tokenName)
      if (inlineEntry && adapterName in inlineEntry) return inlineEntry[adapterName]!
      const blockEntry = vocab.blocks.get(tokenName)
      if (blockEntry && adapterName in blockEntry) return blockEntry[adapterName]!
      return `{${tokenName}}`
    })

    substituted = substituted.replace(/\\(\{[a-z][a-z0-9-]*\})/g, '$1')
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
  return content.replace(/^```[^\n]*\n[\s\S]*?^```/gm, '')
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
): void {
  const problems: string[] = []
  for (const file of files) {
    if (!file.path.endsWith('.md')) continue
    const stripped = stripFencedBlocks(
      typeof file.content === 'string' ? file.content : Buffer.from(file.content).toString('utf8'),
    )
    const lines: string[] = stripped.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const line: string = lines[i]!
      let match: RegExpExecArray | null
      TOKEN_PATTERN.lastIndex = 0
      while ((match = TOKEN_PATTERN.exec(line)) !== null) {
        const tokenName = match[1] as string
        problems.push(`surviving token {${tokenName}} in ${file.path} line ${i + 1}`)
      }
    }
  }

  if (problems.length > 0) {
    throw new ConfigError('tokens survived substitution', problems)
  }
}

// Points config.components.skills at an adapter's own generated skills
// copy, so anything the adapter derives purely from that config field (its
// own plugin manifest's `skills` path, its own in-process template's
// skills-dir placeholder) resolves to the location substituteAllSkills
// actually populated for it, instead of the shared source skills/.
//
// Deliberately leaves model.skills[].dir (each skill's own directory)
// untouched: some adapters emit a file that is intentionally byte-identical
// across multiple active adapters (claude-code and cursor share one
// hooks/moe-mint/session-start bootstrap script; opencode and pi share one
// package.json) precisely so mergeFiles' collision check dedupes it as a
// single file instead of raising a "both adapters emit this path" conflict.
// Those cross-adapter-shared computations read model.skills[].dir for the
// bootstrap skill's path; adjusting it per adapter would make that shared
// output diverge by adapter and break the dedupe. config.components.skills
// only feeds each adapter's own, uniquely-named manifest/template output,
// so adjusting only that field is what those adapters actually need.
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

function validateLayout(root: string, sourceDir: string, adapter: HarnessAdapter): void {
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
}

function transformedContent(
  file: PluginModel['skillFiles'][number],
  profile: string,
  vocab: Vocabulary,
): Uint8Array {
  if (!file.path.endsWith('.md')) return Buffer.from(file.content)
  return Buffer.from(
    substituteContent(Buffer.from(file.content).toString('utf8'), profile, vocab),
    'utf8',
  )
}

// Renders the complete, immutable skill-tree snapshot captured by buildModel.
// Markdown is profile-substituted; every other regular file is copied as bytes.
// In-place layouts update the staged source tree and rendered layouts return
// GeneratedFiles for the normal collision, manifest, and writer pipeline.
export function substituteAllSkills(
  root: string,
  model: PluginModel,
  vocab: Vocabulary,
  activeAdapters: HarnessAdapter[],
): GeneratedFile<Uint8Array>[] {
  const srcDir = model.config.components.skills
  const generatedFiles: GeneratedFile<Uint8Array>[] = []
  const byOutputDir = new Map<string, { adapter: HarnessAdapter; names: string[] }>()

  for (const adapter of activeAdapters) {
    validateLayout(root, srcDir, adapter)
    const existing = byOutputDir.get(adapter.skillLayout.outputDir)
    if (existing) {
      const sameProfile = existing.adapter.skillLayout.profile === adapter.skillLayout.profile
      const sameMode = existing.adapter.skillLayout.mode === adapter.skillLayout.mode
      if (!sameProfile || !sameMode) {
        throw new ConfigError(
          `adapters "${existing.names.join(', ')}" and "${adapter.name}" share skill output directory ` +
            `${adapter.skillLayout.outputDir} with incompatible profiles or modes`,
        )
      }
      existing.names.push(adapter.name)
    } else {
      byOutputDir.set(adapter.skillLayout.outputDir, { adapter, names: [adapter.name] })
    }
  }

  for (const { adapter } of byOutputDir.values()) {
    const { outputDir, profile, mode } = adapter.skillLayout
    const tree = model.skillFiles.map((file) => ({
      path: `${outputDir.replace(/\/$/, '')}/${file.path}`,
      content: transformedContent(file, profile, vocab),
      mode: file.mode,
    }))
    if (mode === 'in-place') {
      writeFileSet(root, tree)
    } else {
      generatedFiles.push(...tree)
    }
  }

  if (![...byOutputDir.values()].some(({ adapter }) => adapter.skillLayout.mode === 'in-place')) {
    writeFileSet(
      root,
      model.skillFiles.map((file) => ({
        path: `${srcDir.replace(/\/$/, '')}/${file.path}`,
        content: file.content,
        mode: file.mode,
      })),
    )
  }

  return generatedFiles.sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
  )
}
