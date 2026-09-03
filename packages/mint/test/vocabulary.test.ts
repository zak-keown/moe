import { describe, it, expect } from 'vitest'
import {
  loadVocabulary,
  validateCoverage,
  substituteContent,
  scanForUnknownTokens,
  assertNoSurvivors,
} from '../src/vocabulary.js'
import { join } from 'node:path'
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
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

describe('substituteContent', () => {
  const vocab = {
    tokens: new Map([
      ['ask', { 'claude-code': '`AskUserQuestion`', codex: 'ask in the terminal' }],
      ['read', { 'claude-code': '`Read`', codex: '`shell` (cat)' }],
    ]),
    blocks: new Map([
      [
        'subagent-dispatch',
        {
          'claude-code': 'Use the `Agent` tool.\nPass the prompt into `prompt`.',
          codex: 'Use `spawn_agent`.\nSet `model` explicitly.',
        },
      ],
    ]),
  }

  it('substitutes inline tokens', () => {
    const input = 'Use {ask} to present choices.'
    expect(substituteContent(input, 'claude-code', vocab)).toBe(
      'Use `AskUserQuestion` to present choices.',
    )
    expect(substituteContent(input, 'codex', vocab)).toBe(
      'Use ask in the terminal to present choices.',
    )
  })

  it('substitutes multiple tokens on one line', () => {
    const input = 'First {read} the file, then {ask} the user.'
    expect(substituteContent(input, 'claude-code', vocab)).toBe(
      'First `Read` the file, then `AskUserQuestion` the user.',
    )
  })

  it('replaces a block token on its own line with indented content', () => {
    const input = '## Dispatch\n\n  {subagent-dispatch}\n\nKeep going.'
    const result = substituteContent(input, 'claude-code', vocab)
    expect(result).toBe(
      '## Dispatch\n\n  Use the `Agent` tool.\n  Pass the prompt into `prompt`.\n\nKeep going.',
    )
  })

  it('strips escape backslashes from \\{...}', () => {
    const input = 'A literal \\{ask} brace and a real {ask}.'
    expect(substituteContent(input, 'claude-code', vocab)).toBe(
      'A literal {ask} brace and a real `AskUserQuestion`.',
    )
  })

  it('leaves unknown tokens untouched (assertion catches them separately)', () => {
    const input = 'Use {unknown-tool} here.'
    expect(substituteContent(input, 'claude-code', vocab)).toBe(
      'Use {unknown-tool} here.',
    )
  })

  it('preserves trailing blank line from YAML block scalar newline', () => {
    const trailingVocab = {
      tokens: new Map(),
      blocks: new Map([
        [
          'subagent-dispatch',
          {
            'claude-code': 'Use the `Agent` tool.\nPass the prompt into `prompt`.\n',
          },
        ],
      ]),
    }
    const input = '## Dispatch\n\n  {subagent-dispatch}\n\nKeep going.'
    const result = substituteContent(input, 'claude-code', trailingVocab)
    expect(result).toBe(
      '## Dispatch\n\n  Use the `Agent` tool.\n  Pass the prompt into `prompt`.\n\n\nKeep going.',
    )
  })

  it('returns content unchanged when vocabulary has no tokens', () => {
    const empty = { tokens: new Map(), blocks: new Map() }
    const input = 'No tokens here.'
    expect(substituteContent(input, 'claude-code', empty)).toBe(input)
  })
})

describe('scanForUnknownTokens', () => {
  it('passes when all tokens in skill files match the vocabulary', () => {
    expect(() =>
      scanForUnknownTokens('fixtures/vocab-basic', 'skills', loadVocabulary('fixtures/vocab-basic')!),
    ).not.toThrow()
  })

  it('throws listing each unknown {word} with file and line', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mint-vocab-unknown-'))
    writeFileSync(join(dir, 'moe-mint-vocab.yaml'), 'tokens: {}\nblocks: {}')
    mkdirSync(join(dir, 'skills/demo'), { recursive: true })
    writeFileSync(
      join(dir, 'skills/demo/SKILL.md'),
      '---\nname: demo\ndescription: test\n---\n\nUse {unknown-tool} here.\n',
    )
    const vocab = loadVocabulary(dir)!
    expect(() => scanForUnknownTokens(dir, 'skills', vocab)).toThrow(/unknown-tool/)
  })

  it('ignores escaped \\{tokens}', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mint-vocab-esc-'))
    writeFileSync(join(dir, 'moe-mint-vocab.yaml'), 'tokens: {}\nblocks: {}')
    mkdirSync(join(dir, 'skills/demo'), { recursive: true })
    writeFileSync(
      join(dir, 'skills/demo/SKILL.md'),
      '---\nname: demo\ndescription: test\n---\n\nA literal \\{not-a-token}.\n',
    )
    const vocab = loadVocabulary(dir)!
    expect(() => scanForUnknownTokens(dir, 'skills', vocab)).not.toThrow()
  })

  it('ignores {word} patterns inside fenced code blocks', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mint-vocab-fence-'))
    writeFileSync(join(dir, 'moe-mint-vocab.yaml'), 'tokens: {}\nblocks: {}')
    mkdirSync(join(dir, 'skills/demo'), { recursive: true })
    writeFileSync(
      join(dir, 'skills/demo/SKILL.md'),
      '---\nname: demo\ndescription: test\n---\n\n```json\n{"key": "value"}\n```\n',
    )
    const vocab = loadVocabulary(dir)!
    expect(() => scanForUnknownTokens(dir, 'skills', vocab)).not.toThrow()
  })
})

describe('assertNoSurvivors', () => {
  it('passes when no {word} patterns remain in output', () => {
    expect(() =>
      assertNoSurvivors([{ path: 'skills/demo/SKILL.md', content: 'No tokens here.' }]),
    ).not.toThrow()
  })

  it('throws listing each surviving {word}', () => {
    expect(() =>
      assertNoSurvivors([
        { path: 'skills/demo/SKILL.md', content: 'Use {ask} here.' },
      ]),
    ).toThrow(/ask.*skills\/demo\/SKILL\.md/)
  })

  it('ignores escaped \\{tokens} and fenced code blocks in output', () => {
    expect(() =>
      assertNoSurvivors([
        { path: 'a.md', content: 'A literal \\{ask}.\n```\n{json}\n```' },
      ]),
    ).not.toThrow()
  })
})
