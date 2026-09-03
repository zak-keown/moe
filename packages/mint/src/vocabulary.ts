import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'yaml'
import { z } from 'zod'
import { ConfigError } from './config.js'
import type { PluginModel } from './model.js'

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
  files: Array<{ path: string; content: string }>,
): void {
  const problems: string[] = []
  for (const file of files) {
    const stripped = stripFencedBlocks(file.content)
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

export function adjustedModel(
  model: PluginModel,
  skillsOutputDir: string,
): PluginModel {
  const srcDir = model.config.components.skills
  return {
    ...model,
    config: {
      ...model.config,
      components: {
        ...model.config.components,
        skills: skillsOutputDir,
      },
    },
    skills: model.skills.map((s) => ({
      ...s,
      dir: s.dir.startsWith(srcDir + '/')
        ? skillsOutputDir + s.dir.slice(srcDir.length)
        : s.dir.startsWith(srcDir)
          ? skillsOutputDir
          : s.dir,
    })),
  }
}
