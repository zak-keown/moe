import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'yaml'
import { z } from 'zod'
import { ConfigError } from './config.js'

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
