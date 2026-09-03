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

import { readFileSync, existsSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'yaml'
import { z } from 'zod'
import { ConfigError } from './diagnostics.js'
import type { PluginModel } from './model.js'
import type { GeneratedFile } from './fileset.js'
import type { HarnessAdapter } from './adapters/types.js'

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
  return collectSkillFiles(root, dir)
    .map(({ path }) => path)
    .filter((path) => path.endsWith('.md'))
}

function collectSkillFiles(root: string, dir: string): Array<{ path: string; executable: boolean }> {
  const abs = join(root, dir)
  if (!existsSync(abs)) return []
  const result: Array<{ path: string; executable: boolean }> = []
  const walk = (d: string, rel: string) => {
    for (const entry of readdirSync(d).sort()) {
      const full = join(d, entry)
      const relPath = `${rel}/${entry}`
      const stat = statSync(full)
      if (stat.isDirectory()) {
        walk(full, relPath)
      } else if (stat.isFile()) {
        result.push({ path: relPath, executable: (stat.mode & 0o111) !== 0 })
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
    if (!file.path.endsWith('.md')) continue
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
  skillsOutputDir: string,
): PluginModel {
  return {
    ...model,
    config: {
      ...model.config,
      components: {
        ...model.config.components,
        skills: skillsOutputDir,
      },
    },
  }
}

// Substitutes every skill .md file per active adapter's vocabulary mapping.
// Adapters with their own skillsOutputDir get a full copy of the skills tree
// (substituted) returned as GeneratedFile[] for the caller to merge into the
// output fileset. Adapters that share the source skills/ directory (no
// skillsOutputDir — claude-code, agent-plugins-1.0, copilot) get their
// mapping applied in place, overwriting the source files on disk, since
// those adapters read skills/ directly rather than from a generated copy.
//
// All shared adapters MUST agree on every token/block mapping — there's only
// one skills/ directory to overwrite, so divergent mappings between them are
// unrepresentable and rejected up front.
export function substituteAllSkills(
  root: string,
  model: PluginModel,
  vocab: Vocabulary,
  activeAdapters: HarnessAdapter[],
): GeneratedFile[] {
  const srcDir = model.config.components.skills
  const skillFiles = collectSkillFiles(root, srcDir)
  const mdFiles = skillFiles.filter(({ path }) => path.endsWith('.md'))
  const generatedFiles: GeneratedFile[] = []

  // Read every source file's original content exactly once, up front. Both
  // branches below derive their substitutions from this snapshot rather than
  // re-reading from disk — the shared-adapter branch overwrites the source
  // files in place, and a later disk read for a non-shared adapter would
  // otherwise pick up that already-substituted content instead of the
  // original {token} markers.
  const originalContent = new Map<string, string>()
  for (const { path } of skillFiles) {
    originalContent.set(path, readFileSync(join(root, path), 'utf8'))
  }

  const sharedAdapters = activeAdapters.filter((a) => !a.skillsOutputDir)
  if (sharedAdapters.length > 0) {
    // All shared adapters must produce identical substitution — validate by
    // checking that their mappings agree for every token.
    const baseline = sharedAdapters[0]!.name
    for (const other of sharedAdapters.slice(1)) {
      for (const [name, entry] of vocab.tokens) {
        if (entry[baseline] !== entry[other.name]) {
          throw new ConfigError(
            `adapters "${baseline}" and "${other.name}" share skills/ but differ on token "${name}": ` +
              `"${entry[baseline]}" vs "${entry[other.name]}"`,
          )
        }
      }
      for (const [name, entry] of vocab.blocks) {
        if (entry[baseline] !== entry[other.name]) {
          throw new ConfigError(
            `adapters "${baseline}" and "${other.name}" share skills/ but differ on block "${name}"`,
          )
        }
      }
    }

    // Overwrite source in place once, using the baseline adapter's mappings.
    for (const { path } of mdFiles) {
      const substituted = substituteContent(originalContent.get(path)!, baseline, vocab)
      writeFileSync(join(root, path), substituted)
    }
  }

  for (const adapter of activeAdapters) {
    const outputDir = adapter.skillsOutputDir
    if (!outputDir) continue // handled above via in-place overwrite

    for (const { path, executable } of skillFiles) {
      const content = path.endsWith('.md')
        ? substituteContent(originalContent.get(path)!, adapter.name, vocab)
        : originalContent.get(path)!
      const outputPath = path.startsWith(srcDir + '/')
        ? outputDir + path.slice(srcDir.length)
        : path
      generatedFiles.push({ path: outputPath, content, executable: executable || undefined })
    }
  }

  return generatedFiles
}
