import { describe, it, expect } from 'vitest'
import {
  loadVocabulary,
  validateCoverage,
  substituteContent,
  scanForUnknownTokens,
  assertNoSurvivors,
  substituteAllSkills,
} from '../src/vocabulary.js'
import { join } from 'node:path'
import {
  chmodSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { buildModel } from '../src/model.js'
import type { HarnessAdapter } from '../src/adapters/types.js'

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

const noSupport = {
  skills: 'none',
  commands: 'none',
  agents: 'none',
  hooks: 'none',
  mcp: 'none',
  bootstrap: 'none',
  rules: 'none',
  variables: 'none',
} as const

function fullTreeFixture(): string {
  const dir = mkdtempSync(join(tmpdir(), 'mint-vocab-tree-'))
  writeFileSync(
    join(dir, 'moe-mint.yaml'),
    'name: tree-demo\nversion: 1.0.0\ndescription: full tree test\nbootstrap: none\n',
  )
  mkdirSync(join(dir, 'skills/demo/references'), { recursive: true })
  mkdirSync(join(dir, 'skills/demo/scripts'), { recursive: true })
  mkdirSync(join(dir, 'skills/demo/assets'), { recursive: true })
  writeFileSync(
    join(dir, 'skills/demo/SKILL.md'),
    '---\nname: demo\ndescription: demo\n---\n\nUse {ask}.\n',
  )
  writeFileSync(join(dir, 'skills/demo/references/guide.md'), 'Then {ask}.\n')
  writeFileSync(join(dir, 'skills/demo/scripts/run.sh'), '#!/bin/sh\nprintf "{ask} stays literal"\n')
  chmodSync(join(dir, 'skills/demo/scripts/run.sh'), 0o755)
  writeFileSync(join(dir, 'skills/demo/assets/pixel.bin'), Buffer.from([0x00, 0xff, 0x80, 0x41]))
  return dir
}

function renderedAdapter(
  name: string,
  outputDir: string,
  profile = name,
): HarnessAdapter {
  return {
    name,
    support: noSupport,
    skillLayout: { outputDir, profile, mode: 'rendered' },
    emit: () => ({ files: [], warnings: [] }),
  }
}

describe('substituteAllSkills full-tree rendering', () => {
  it('copies the complete skill closure, transforms only Markdown, and preserves executable files', () => {
    const dir = fullTreeFixture()
    const model = buildModel(dir)
    const vocab = {
      tokens: new Map([['ask', { codex: '`request_user_input`' }]]),
      blocks: new Map(),
    }

    const files = substituteAllSkills(
      dir,
      model,
      vocab,
      [renderedAdapter('codex', '.codex-plugin/skills')],
    )

    expect(files.map((file) => file.path)).toEqual([
      '.codex-plugin/skills/demo/SKILL.md',
      '.codex-plugin/skills/demo/assets/pixel.bin',
      '.codex-plugin/skills/demo/references/guide.md',
      '.codex-plugin/skills/demo/scripts/run.sh',
    ])
    expect(files.find((file) => file.path.endsWith('/SKILL.md'))?.content.toString()).toContain(
      '`request_user_input`',
    )
    expect(files.find((file) => file.path.endsWith('/references/guide.md'))?.content.toString()).toBe(
      'Then `request_user_input`.\n',
    )
    expect(files.find((file) => file.path.endsWith('/scripts/run.sh'))).toMatchObject({
      executable: true,
    })
    expect(files.find((file) => file.path.endsWith('/scripts/run.sh'))?.content.toString()).toContain(
      '{ask} stays literal',
    )
    expect(files.find((file) => file.path.endsWith('/assets/pixel.bin'))?.content).toEqual(
      Buffer.from([0x00, 0xff, 0x80, 0x41]),
    )
  })

  it('renders reproducibly from one immutable source snapshot', () => {
    const dir = fullTreeFixture()
    const model = buildModel(dir)
    const vocab = {
      tokens: new Map([
        ['ask', { codex: 'CODEX', cursor: 'CURSOR' }],
      ]),
      blocks: new Map(),
    }
    const active = [
      renderedAdapter('cursor', '.cursor-plugin/skills'),
      renderedAdapter('codex', '.codex-plugin/skills'),
    ]

    const first = substituteAllSkills(dir, model, vocab, active)
    writeFileSync(join(dir, 'skills/demo/SKILL.md'), 'source changed after snapshot')
    const second = substituteAllSkills(dir, model, vocab, active)

    expect(second).toEqual(first)
    expect(first.map((file) => file.path)).toEqual([...first.map((file) => file.path)].sort())
  })

  it('rejects shared output directories whose profiles differ', () => {
    const dir = fullTreeFixture()
    const model = buildModel(dir)
    const vocab = {
      tokens: new Map([['ask', { codex: 'CODEX', cursor: 'CURSOR' }]]),
      blocks: new Map(),
    }

    expect(() =>
      substituteAllSkills(dir, model, vocab, [
        renderedAdapter('codex', '.shared/skills', 'codex'),
        renderedAdapter('cursor', '.shared/skills', 'cursor'),
      ]),
    ).toThrow(/share.*\.shared\/skills.*profiles/i)
  })

  it('rejects a rendered output directory that traverses outside the plugin root', () => {
    const dir = fullTreeFixture()
    const model = buildModel(dir)
    const vocab = {
      tokens: new Map([['ask', { codex: 'CODEX' }]]),
      blocks: new Map(),
    }

    expect(() =>
      substituteAllSkills(dir, model, vocab, [renderedAdapter('codex', '../outside')]),
    ).toThrow(/output directory.*(escapes plugin root|traversal)/i)
  })

  it('rejects traversal segments even when the normalized output stays inside the plugin root', () => {
    const dir = fullTreeFixture()
    const model = buildModel(dir)
    const vocab = {
      tokens: new Map([['ask', { codex: 'CODEX' }]]),
      blocks: new Map(),
    }

    expect(() =>
      substituteAllSkills(
        dir,
        model,
        vocab,
        [renderedAdapter('codex', '.private/../skills')],
      ),
    ).toThrow(/output directory.*traversal/i)
  })

  it('rejects symlinks anywhere in the source skill tree', () => {
    const dir = fullTreeFixture()
    symlinkSync(join(dir, 'skills/demo/assets/pixel.bin'), join(dir, 'skills/demo/assets/alias.bin'))

    expect(() => buildModel(dir)).toThrow(/symbolic link.*skills\/demo\/assets\/alias\.bin/i)
  })

  it.skipIf(process.platform === 'win32')('rejects unsupported filesystem nodes in the source skill tree', () => {
    const dir = fullTreeFixture()
    execFileSync('mkfifo', [join(dir, 'skills/demo/assets/events')])

    expect(() => buildModel(dir)).toThrow(/unsupported node.*skills\/demo\/assets\/events/i)
  })

  it('applies an in-place profile without altering binary assets or executable modes', () => {
    const dir = fullTreeFixture()
    const model = buildModel(dir)
    const vocab = {
      tokens: new Map([['ask', { 'agent-plugins-1.0': 'ASK' }]]),
      blocks: new Map(),
    }
    const adapter: HarnessAdapter = {
      name: 'agent-plugins-1.0',
      support: noSupport,
      skillLayout: {
        outputDir: 'skills',
        profile: 'agent-plugins-1.0',
        mode: 'in-place',
      },
      emit: () => ({ files: [], warnings: [] }),
    }

    expect(substituteAllSkills(dir, model, vocab, [adapter])).toEqual([])
    expect(readFileSync(join(dir, 'skills/demo/SKILL.md'), 'utf8')).toContain('Use ASK.')
    expect(readFileSync(join(dir, 'skills/demo/assets/pixel.bin'))).toEqual(
      Buffer.from([0x00, 0xff, 0x80, 0x41]),
    )
    expect(lstatSync(join(dir, 'skills/demo/scripts/run.sh')).mode & 0o111).not.toBe(0)
  })
})
