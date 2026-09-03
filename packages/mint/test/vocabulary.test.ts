import { describe, it, expect } from 'vitest'
import { loadVocabulary, validateCoverage } from '../src/vocabulary.js'
import { join } from 'node:path'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'

describe('loadVocabulary', () => {
  it('returns null when moe-mint-vocab.yaml is absent', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mint-vocab-'))
    expect(loadVocabulary(dir)).toBeNull()
  })

  it('loads tokens and blocks from the fixture', () => {
    const vocab = loadVocabulary('fixtures/vocab-basic')
    expect(vocab).not.toBeNull()
    expect(vocab!.tokens.has('ask')).toBe(true)
    expect(vocab!.tokens.get('ask')!['claude-code']).toBe('`AskUserQuestion`')
    expect(vocab!.tokens.get('ask')!.codex).toBe('ask in the terminal')
  })

  it('rejects invalid YAML', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mint-vocab-'))
    writeFileSync(join(dir, 'moe-mint-vocab.yaml'), '{{invalid')
    expect(() => loadVocabulary(dir)).toThrow(/not valid YAML/)
  })

  it('rejects token names that violate the naming rule', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mint-vocab-'))
    writeFileSync(join(dir, 'moe-mint-vocab.yaml'), 'tokens:\n  Ask_User: {}\nblocks: {}')
    expect(() => loadVocabulary(dir)).toThrow(/invalid token name/)
  })

  it('rejects a name defined as both a token and a block', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mint-vocab-'))
    writeFileSync(
      join(dir, 'moe-mint-vocab.yaml'),
      'tokens:\n  ask:\n    claude-code: x\nblocks:\n  ask:\n    claude-code: y\n',
    )
    expect(() => loadVocabulary(dir)).toThrow(/both a token and a block/)
  })

  it('loads an empty vocabulary (zero tokens, zero blocks)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mint-vocab-'))
    writeFileSync(join(dir, 'moe-mint-vocab.yaml'), 'tokens: {}\nblocks: {}')
    const vocab = loadVocabulary(dir)
    expect(vocab).not.toBeNull()
    expect(vocab!.tokens.size).toBe(0)
    expect(vocab!.blocks.size).toBe(0)
  })
})

describe('validateCoverage', () => {
  it('passes when every token maps every active adapter', () => {
    const vocab = loadVocabulary('fixtures/vocab-basic')!
    expect(() => validateCoverage(vocab, ['claude-code', 'codex'])).not.toThrow()
  })

  it('throws listing each missing adapter×token pair', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mint-vocab-'))
    writeFileSync(
      join(dir, 'moe-mint-vocab.yaml'),
      'tokens:\n  ask:\n    claude-code: x\nblocks: {}',
    )
    const vocab = loadVocabulary(dir)!
    expect(() => validateCoverage(vocab, ['claude-code', 'codex'])).toThrow(/ask.*codex/)
  })

  it('passes vacuously for an empty vocabulary', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mint-vocab-'))
    writeFileSync(join(dir, 'moe-mint-vocab.yaml'), 'tokens: {}\nblocks: {}')
    const vocab = loadVocabulary(dir)!
    expect(() => validateCoverage(vocab, ['claude-code', 'codex', 'kimi'])).not.toThrow()
  })
})
