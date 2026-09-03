# Native Skill Renderers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build-time template substitution in moe-mint so skills ship with harness-native tool names instead of relying on prose translation at runtime.

**Architecture:** A vocabulary file (`moe-mint-vocab.yaml`) defines inline and block token mappings per adapter. `generate()` loads the vocabulary, applies substitution to produce per-adapter skill directories, and runs three assertions (complete coverage, no unknown tokens, no survivors). Each adapter sees a model whose `config.components.skills` and `SkillRef.dir` already point at its own output directory — adapters need no vocabulary awareness.

**Tech Stack:** TypeScript, Zod, vitest, `yaml` (already a mint dependency)

**Spec:** `docs/moe/specs/2026-09-02-native-renderers-design.md`

## Global Constraints

- Node ≥ 24, pnpm 11.23.0.
- Test: `pnpm --filter @bubstack/moe-mint test` or `turbo run test --filter=@bubstack/moe-mint`.
- Lint: `pnpm lint` (biome). Typecheck: `pnpm typecheck`.
- Full gate: `pnpm check` then `pnpm mint:check`.
- Never hand-edit `/plugins/`; edit source and run `pnpm mint`.
- Token names match `/^[a-z][a-z0-9-]*$/` — lowercase, hyphens only.
- Vocabulary keys use canonical adapter names from `ADAPTER_NAMES` in `packages/mint/src/config.ts`: `claude-code`, `cursor`, `codex`, `kimi`, `opencode`, `pi`, `agent-plugins-1.0`, `copilot`.
- Cite guarded surfaces by test name or symbol, never line number (AGENTS.md).
- Two tsconfigs must agree: `tsconfig.json` references mirror runtime dependencies (AGENTS.md rule 4).

## Open Decisions

- **D1 — agent-plugins-1.0 divergence** · `conversation` · HITL
  - **Question:** The Agent Plugins 1.0 spec mandates `skills/` at root with no relocation key. When vocabulary mappings for agent-plugins-1.0 diverge from claude-code, what is the resolution?
  - **Options:** (a) Build-time error requiring identical mappings for adapters sharing a skill directory / (b) Exclude agent-plugins-1.0 from vocabulary substitution
  - **Recommendation:** (a) — a build-time error surfaces the conflict immediately and forces an explicit choice rather than silently serving template tokens to one harness.
  - **Blocked by:** —
  - **Blocks:** Task 7 (Phase 2 skill conversions, if agent-plugins-1.0 mappings diverge)
  - **Resolution:** (a) — enforced by the shared-adapter divergence check in `substituteAllSkills`. claude-code, agent-plugins-1.0, and copilot must have byte-identical mappings for every token and block.

## Not Yet Specified

- How vocabulary interacts with `moe-mint import` — an imported plugin with its own vocabulary would need merging or namespacing.
- Whether agents (under `agents/`) should eventually use vocabulary. Currently out of scope per spec §9.

## Out of Scope

- Changes to the Agent Skills spec (spec §9).
- Per-harness agent definitions (spec §9).
- Rendering infrastructure beyond tool-name routing (spec §9).
- Publishing `moe-mint-vocab.yaml` as a standard (spec §9).

---

## Phase 1: Infrastructure

Ship the vocabulary pipeline with zero tokens defined. Per-adapter skill directories are emitted as byte-identical copies. The three assertions exist and pass vacuously.

### Task 1: Vocabulary types, schema, and loader

**Files:**
- Create: `packages/mint/src/vocabulary.ts`
- Create: `packages/mint/test/vocabulary.test.ts`
- Create: `packages/mint/fixtures/vocab-basic/moe-mint.yaml`
- Create: `packages/mint/fixtures/vocab-basic/moe-mint-vocab.yaml`
- Create: `packages/mint/fixtures/vocab-basic/skills/greeting/SKILL.md`

**Interfaces:**
- Consumes: `ConfigError`, `ADAPTER_NAMES` from `packages/mint/src/config.ts`
- Produces:
  - `TOKEN_NAME_RE: RegExp` — `/^[a-z][a-z0-9-]*$/`
  - `VocabEntry = Record<string, string>` — adapter name → substitution value
  - `Vocabulary = { tokens: Map<string, VocabEntry>; blocks: Map<string, VocabEntry> }`
  - `loadVocabulary(root: string): Vocabulary | null` — returns `null` when `moe-mint-vocab.yaml` absent
  - `validateCoverage(vocab: Vocabulary, activeAdapters: string[]): void` — throws `ConfigError` listing every adapter×token gap

- [ ] **Step 1: Create the vocabulary fixture**

`packages/mint/fixtures/vocab-basic/moe-mint.yaml`:

```yaml
name: vocab-basic
version: 1.0.0
description: Fixture plugin exercising vocabulary substitution
bootstrap: none
```

`packages/mint/fixtures/vocab-basic/moe-mint-vocab.yaml`:

```yaml
tokens:
  ask:
    claude-code: "`AskUserQuestion`"
    cursor: "`AskUserQuestion`"
    codex: "ask in the terminal"
    kimi: "`AskUserQuestion`"
    opencode: "ask in the terminal"
    pi: "ask in the terminal"
    agent-plugins-1.0: "`AskUserQuestion`"
    copilot: "`AskUserQuestion`"
blocks: {}
```

`packages/mint/fixtures/vocab-basic/skills/greeting/SKILL.md`:

```markdown
---
name: greeting
description: A greeting skill that uses {ask}
---

# Greeting

When the user says hello, use {ask} to present options.

A literal brace: \{not-a-token}.
```

- [ ] **Step 2: Write the failing tests**

`packages/mint/test/vocabulary.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { loadVocabulary, validateCoverage } from '../src/vocabulary.js'
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
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm --filter @bubstack/moe-mint test -- vocabulary`
Expected: FAIL — `vocabulary.js` does not exist

- [ ] **Step 4: Implement `vocabulary.ts`**

`packages/mint/src/vocabulary.ts`:

```typescript
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

const entrySchema = z.record(z.string())

const vocabSchema = z.object({
  tokens: z.record(entrySchema).optional().default({}),
  blocks: z.record(entrySchema).optional().default({}),
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
    tokens: new Map(Object.entries(rawTokens)),
    blocks: new Map(Object.entries(rawBlocks)),
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @bubstack/moe-mint test -- vocabulary`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/mint/src/vocabulary.ts packages/mint/test/vocabulary.test.ts packages/mint/fixtures/vocab-basic/
git commit -m "feat(mint): vocabulary schema, types, and loader

loadVocabulary() reads moe-mint-vocab.yaml and validates token names,
coverage, and no overlap between inline tokens and blocks.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 2: Substitution engine and assertion functions

**Files:**
- Modify: `packages/mint/src/vocabulary.ts`
- Modify: `packages/mint/test/vocabulary.test.ts`

**Interfaces:**
- Consumes: `Vocabulary`, `VocabEntry` from Task 1
- Produces:
  - `substituteContent(content: string, adapterName: string, vocab: Vocabulary): string` — inline replacement, block replacement (indentation-aware), escape stripping
  - `scanForUnknownTokens(root: string, skillsDir: string, vocab: Vocabulary): void` — throws `ConfigError` listing each unknown `{word}` with its file and line
  - `assertNoSurvivors(files: Array<{ path: string; content: string }>): void` — throws `ConfigError` listing each surviving `{word}` in output

- [ ] **Step 1: Write the failing tests for `substituteContent`**

Add to `packages/mint/test/vocabulary.test.ts`:

```typescript
import {
  loadVocabulary,
  validateCoverage,
  substituteContent,
  scanForUnknownTokens,
  assertNoSurvivors,
} from '../src/vocabulary.js'

describe('substituteContent', () => {
  const vocab: Vocabulary = {
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

  it('returns content unchanged when vocabulary has no tokens', () => {
    const empty: Vocabulary = { tokens: new Map(), blocks: new Map() }
    const input = 'No tokens here.'
    expect(substituteContent(input, 'claude-code', empty)).toBe(input)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @bubstack/moe-mint test -- vocabulary`
Expected: FAIL — `substituteContent` is not exported

- [ ] **Step 3: Implement `substituteContent`**

Add to `packages/mint/src/vocabulary.ts`:

```typescript
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
      const [, indent, tokenName] = blockMatch
      const blockEntry = vocab.blocks.get(tokenName)
      if (blockEntry && adapterName in blockEntry) {
        for (const blockLine of blockEntry[adapterName].split('\n')) {
          result.push(blockLine ? indent + blockLine : '')
        }
        continue
      }
    }

    let substituted = line.replace(TOKEN_PATTERN, (_match, tokenName: string) => {
      const inlineEntry = vocab.tokens.get(tokenName)
      if (inlineEntry && adapterName in inlineEntry) return inlineEntry[adapterName]
      const blockEntry = vocab.blocks.get(tokenName)
      if (blockEntry && adapterName in blockEntry) return blockEntry[adapterName]
      return `{${tokenName}}`
    })

    substituted = substituted.replace(/\\(\{[a-z][a-z0-9-]*\})/g, '$1')
    result.push(substituted)
  }

  return result.join('\n')
}
```

- [ ] **Step 4: Run substitution tests to verify they pass**

Run: `pnpm --filter @bubstack/moe-mint test -- vocabulary`
Expected: PASS for all `substituteContent` tests

- [ ] **Step 5: Write failing tests for `scanForUnknownTokens` and `assertNoSurvivors`**

Add to `packages/mint/test/vocabulary.test.ts`:

```typescript
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
```

- [ ] **Step 6: Implement `scanForUnknownTokens` and `assertNoSurvivors`**

Add to `packages/mint/src/vocabulary.ts`:

```typescript
import { readdirSync, statSync } from 'node:fs'

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
    const lines = stripped.split('\n')
    for (let i = 0; i < lines.length; i++) {
      let match: RegExpExecArray | null
      TOKEN_PATTERN.lastIndex = 0
      while ((match = TOKEN_PATTERN.exec(lines[i])) !== null) {
        if (!allTokens.has(match[1])) {
          problems.push(`unknown token {${match[1]}} in ${relPath} line ${i + 1}`)
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
    const lines = stripped.split('\n')
    for (let i = 0; i < lines.length; i++) {
      let match: RegExpExecArray | null
      TOKEN_PATTERN.lastIndex = 0
      while ((match = TOKEN_PATTERN.exec(lines[i])) !== null) {
        problems.push(`surviving token {${match[1]}} in ${file.path} line ${i + 1}`)
      }
    }
  }

  if (problems.length > 0) {
    throw new ConfigError('tokens survived substitution', problems)
  }
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm --filter @bubstack/moe-mint test -- vocabulary`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add packages/mint/src/vocabulary.ts packages/mint/test/vocabulary.test.ts
git commit -m "feat(mint): substitution engine and assertion functions

substituteContent handles inline tokens, block tokens (indentation-
aware), and \\{ escaping. scanForUnknownTokens and assertNoSurvivors
enforce the closed-vocabulary contract.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 3: Per-adapter skill output directories

**Files:**
- Modify: `packages/mint/src/adapters/types.ts`
- Modify: `packages/mint/src/adapters/claude-code.ts`
- Modify: `packages/mint/src/adapters/cursor.ts`
- Modify: `packages/mint/src/adapters/codex.ts`
- Modify: `packages/mint/src/adapters/kimi.ts`
- Modify: `packages/mint/src/adapters/opencode.ts`
- Modify: `packages/mint/src/adapters/pi.ts`
- Modify: `packages/mint/src/adapters/agent-plugins.ts`
- Modify: `packages/mint/src/adapters/copilot.ts`
- Create: `packages/mint/test/adapters/skills-output-dir.test.ts`

**Interfaces:**
- Consumes: `HarnessAdapter` from `packages/mint/src/adapters/types.ts`
- Produces:
  - `HarnessAdapter.skillsOutputDir?: string | undefined` — the per-adapter directory for substituted skills; `undefined` means the adapter shares the source `config.components.skills` directory
  - `adjustedModel(model: PluginModel, skillsOutputDir: string): PluginModel` — returns a shallow copy with `config.components.skills` and each `SkillRef.dir` rewritten

The skill output directories, by adapter:

| Adapter | `skillsOutputDir` | Reason |
|---------|-------------------|--------|
| `claude-code` | `undefined` | Auto-discovery default; shares `skills/` |
| `cursor` | `'.cursor-plugin/skills'` | Under cursor's manifest prefix |
| `codex` | `'.codex-plugin/skills'` | Under codex's manifest prefix |
| `kimi` | `'.kimi-plugin/skills'` | Under kimi's manifest prefix |
| `opencode` | `'.opencode/skills'` | Alongside `.opencode/command/` and `.opencode/agent/` |
| `pi` | `'.pi/skills'` | Alongside `.pi/extensions/` |
| `agent-plugins-1.0` | `undefined` | Spec mandates `skills/` at root; shares with claude-code |
| `copilot` | `undefined` | Installs Claude Code's layout |

- [ ] **Step 1: Write the failing test**

`packages/mint/test/adapters/skills-output-dir.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { adapters } from '../../src/adapters/index.js'
import type { PluginModel, SkillRef } from '../../src/model.js'

describe('skillsOutputDir', () => {
  it('every adapter has skillsOutputDir defined or explicitly undefined', () => {
    for (const adapter of adapters) {
      expect('skillsOutputDir' in adapter).toBe(true)
    }
  })

  it('claude-code, agent-plugins-1.0, and copilot share the source directory', () => {
    const shared = adapters.filter(
      (a) => a.name === 'claude-code' || a.name === 'agent-plugins-1.0' || a.name === 'copilot',
    )
    for (const adapter of shared) {
      expect(adapter.skillsOutputDir).toBeUndefined()
    }
  })

  it('cursor, codex, kimi, opencode, and pi each have a distinct output dir', () => {
    const withDir = adapters.filter((a) => a.skillsOutputDir !== undefined)
    expect(withDir.length).toBe(5)
    const dirs = withDir.map((a) => a.skillsOutputDir)
    expect(new Set(dirs).size).toBe(5)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @bubstack/moe-mint test -- skills-output-dir`
Expected: FAIL — `skillsOutputDir` does not exist on `HarnessAdapter`

- [ ] **Step 3: Add `skillsOutputDir` to the adapter interface**

In `packages/mint/src/adapters/types.ts`, add to `HarnessAdapter`:

```typescript
export interface HarnessAdapter {
  name: string
  support: ComponentSupport
  skillsOutputDir?: string | undefined
  emit(model: PluginModel): EmitResult
  installDoc?(model: PluginModel): string
}
```

- [ ] **Step 4: Set `skillsOutputDir` on each adapter**

In each adapter file, add the property to the exported adapter object:

`claude-code.ts`: `skillsOutputDir: undefined,`
`cursor.ts`: `skillsOutputDir: '.cursor-plugin/skills',`
`codex.ts`: `skillsOutputDir: '.codex-plugin/skills',`
`kimi.ts`: `skillsOutputDir: '.kimi-plugin/skills',`
`opencode.ts`: `skillsOutputDir: '.opencode/skills',`
`pi.ts`: `skillsOutputDir: '.pi/skills',`
`agent-plugins.ts`: `skillsOutputDir: undefined,`
`copilot.ts`: `skillsOutputDir: undefined,`

- [ ] **Step 5: Implement `adjustedModel` in `vocabulary.ts`**

Add to `packages/mint/src/vocabulary.ts`:

```typescript
import type { PluginModel } from './model.js'

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
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter @bubstack/moe-mint test -- skills-output-dir`
Expected: PASS

- [ ] **Step 7: Run existing tests to verify no regressions**

Run: `pnpm --filter @bubstack/moe-mint test`
Expected: PASS (existing snapshot may need updating if the new property appears in snapshot output; if so, update with `--update`)

- [ ] **Step 8: Commit**

```bash
git add packages/mint/src/adapters/ packages/mint/src/vocabulary.ts packages/mint/test/adapters/skills-output-dir.test.ts
git commit -m "feat(mint): per-adapter skill output directories

Each adapter declares skillsOutputDir — the directory where vocabulary-
substituted skills are written. Adapters sharing skills/ (claude-code,
agent-plugins-1.0, copilot) leave it undefined. adjustedModel() rewrites
config.components.skills and SkillRef.dir for adapters with their own
directory, so adapter emit() code needs no vocabulary awareness.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 4: Pipeline integration

**Files:**
- Modify: `packages/mint/src/generate.ts`
- Modify: `packages/mint/src/vocabulary.ts`
- Modify: `packages/mint/test/generate.test.ts`
- Modify: `packages/mint/fixtures/kitchen-sink/moe-mint-vocab.yaml` (create)

**Interfaces:**
- Consumes:
  - `loadVocabulary`, `validateCoverage`, `substituteContent`, `scanForUnknownTokens`, `assertNoSurvivors`, `adjustedModel` from `vocabulary.ts` (Tasks 1-3)
  - `HarnessAdapter.skillsOutputDir` from `types.ts` (Task 3)
- Produces:
  - `substituteAllSkills(root: string, model: PluginModel, vocab: Vocabulary, adapters: HarnessAdapter[]): GeneratedFile[]` — returns `GeneratedFile[]` for non-shared adapters; side effect: overwrites source `skills/` for Claude Code
  - Updated `generate()` with vocabulary pipeline integrated
  - `GenerateResult.vocabActive: boolean`

- [ ] **Step 1: Add the kitchen-sink vocabulary fixture**

`packages/mint/fixtures/kitchen-sink/moe-mint-vocab.yaml`:

```yaml
tokens: {}
blocks: {}
```

- [ ] **Step 2: Write the failing integration tests**

Add to `packages/mint/test/generate.test.ts`:

```typescript
describe('vocabulary integration', () => {
  it('emits per-adapter skill directories when moe-mint-vocab.yaml exists', () => {
    const dir = freshFixture()
    writeFileSync(join(dir, 'moe-mint-vocab.yaml'), 'tokens: {}\nblocks: {}')
    const result = generate(dir)
    expect(result.files.some((f) => f.path.startsWith('.codex-plugin/skills/'))).toBe(true)
    expect(result.files.some((f) => f.path.startsWith('.cursor-plugin/skills/'))).toBe(true)
    expect(result.files.some((f) => f.path.startsWith('.kimi-plugin/skills/'))).toBe(true)
    expect(result.files.some((f) => f.path.startsWith('.opencode/skills/'))).toBe(true)
    expect(result.files.some((f) => f.path.startsWith('.pi/skills/'))).toBe(true)
  })

  it('per-adapter skill content is byte-identical to source with zero tokens', () => {
    const dir = freshFixture()
    writeFileSync(join(dir, 'moe-mint-vocab.yaml'), 'tokens: {}\nblocks: {}')
    const result = generate(dir)
    const sourceSkill = readFileSync(join(dir, 'skills/greeting/SKILL.md'), 'utf8')
    const codexSkill = result.files.find(
      (f) => f.path === '.codex-plugin/skills/greeting/SKILL.md',
    )
    expect(codexSkill).toBeDefined()
    expect(codexSkill!.content).toBe(sourceSkill)
  })

  it('does not emit per-adapter skill directories when vocab file is absent', () => {
    const dir = freshFixture()
    const result = generate(dir)
    expect(result.files.some((f) => f.path.startsWith('.codex-plugin/skills/'))).toBe(false)
  })

  it('adapter manifests reference their own skill directories when vocab is active', () => {
    const dir = freshFixture()
    writeFileSync(join(dir, 'moe-mint-vocab.yaml'), 'tokens: {}\nblocks: {}')
    const result = generate(dir)
    const codexManifest = JSON.parse(
      result.files.find((f) => f.path === '.codex-plugin/plugin.json')!.content,
    )
    expect(codexManifest.skills).toBe('./.codex-plugin/skills/')
  })

  it('is idempotent with vocabulary active', () => {
    const dir = freshFixture()
    writeFileSync(join(dir, 'moe-mint-vocab.yaml'), 'tokens: {}\nblocks: {}')
    generate(dir)
    generate(dir)
    expect(checkDrift(dir).clean).toBe(true)
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm --filter @bubstack/moe-mint test -- generate`
Expected: FAIL — vocabulary pipeline not wired in

- [ ] **Step 4: Implement `substituteAllSkills` in `vocabulary.ts`**

Add to `packages/mint/src/vocabulary.ts`:

```typescript
import type { GeneratedFile } from './fileset.js'
import type { HarnessAdapter } from './adapters/types.js'

export function substituteAllSkills(
  root: string,
  model: PluginModel,
  vocab: Vocabulary,
  activeAdapters: HarnessAdapter[],
): GeneratedFile[] {
  const srcDir = model.config.components.skills
  const mdFiles = collectMdFiles(root, srcDir)
  const generatedFiles: GeneratedFile[] = []

  for (const adapter of activeAdapters) {
    const outputDir = adapter.skillsOutputDir
    if (!outputDir) {
      // Shared with source — overwrite in place for claude-code-like adapters
      for (const relPath of mdFiles) {
        const content = readFileSync(join(root, relPath), 'utf8')
        const substituted = substituteContent(content, adapter.name, vocab)
        writeFileSync(join(root, relPath), substituted)
      }
      continue
    }

    for (const relPath of mdFiles) {
      const content = readFileSync(join(root, relPath), 'utf8')
      const substituted = substituteContent(content, adapter.name, vocab)
      const outputPath = relPath.startsWith(srcDir + '/')
        ? outputDir + relPath.slice(srcDir.length)
        : relPath
      generatedFiles.push({ path: outputPath, content: substituted })
    }
  }

  return generatedFiles
}
```

Note: `writeFileSync` is imported from `node:fs` (already at top of file). The in-place overwrite for shared adapters must run ONCE — if multiple adapters share the source directory, they must have identical mappings. The first shared adapter wins (all should produce identical output). Add a guard:

```typescript
const sharedAdapters = activeAdapters.filter((a) => !a.skillsOutputDir)
if (sharedAdapters.length > 0) {
  // All shared adapters must produce identical substitution — validate by
  // checking that their mappings agree for every token.
  const baseline = sharedAdapters[0].name
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

  // Overwrite source in place once, using the baseline adapter's mappings
  for (const relPath of mdFiles) {
    const content = readFileSync(join(root, relPath), 'utf8')
    const substituted = substituteContent(content, baseline, vocab)
    writeFileSync(join(root, relPath), substituted)
  }
}
```

- [ ] **Step 5: Wire vocabulary into `generate()`**

In `packages/mint/src/generate.ts`, after `const model = buildModel(root)`:

```typescript
import {
  loadVocabulary,
  validateCoverage,
  scanForUnknownTokens,
  assertNoSurvivors,
  substituteAllSkills,
  adjustedModel,
} from './vocabulary.js'

// Inside generate(), after buildModel:
const vocab = loadVocabulary(root)
if (vocab) {
  const activeNames = active.map((a) => a.name)
  validateCoverage(vocab, activeNames)
  scanForUnknownTokens(root, model.config.components.skills, vocab)
}
```

After vocabulary validation, before the adapter emit loop:

```typescript
let vocabSkillFiles: GeneratedFile[] = []
if (vocab) {
  vocabSkillFiles = substituteAllSkills(root, model, vocab, active)
}
```

In the adapter emit loop, adjust the model for adapters with their own skill directory:

```typescript
for (const adapter of active) {
  const adapterModel =
    vocab && adapter.skillsOutputDir
      ? adjustedModel(model, adapter.skillsOutputDir)
      : model
  const result = adapter.emit(adapterModel)
  mergeFiles(byPath, adapter.name, result.files, model.config)
  warnings.push(...result.warnings.map((w) => `[${adapter.name}] ${w}`))
}
```

After the adapter loop, merge vocabulary skill files:

```typescript
if (vocab) {
  mergeFiles(byPath, 'vocabulary', vocabSkillFiles, model.config)
  assertNoSurvivors(vocabSkillFiles)
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter @bubstack/moe-mint test`
Expected: PASS (update snapshots with `--update` if the kitchen-sink fixture now produces additional files from its vocab)

- [ ] **Step 7: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add packages/mint/src/generate.ts packages/mint/src/vocabulary.ts packages/mint/test/generate.test.ts packages/mint/fixtures/kitchen-sink/moe-mint-vocab.yaml
git commit -m "feat(mint): wire vocabulary pipeline into generate()

When moe-mint-vocab.yaml exists, generate() loads vocabulary, validates
coverage, runs scanForUnknownTokens on source, substitutes skills per
adapter, and asserts no survivors in output. Each adapter with its own
skillsOutputDir sees an adjustedModel with rewritten paths. Adapters
sharing skills/ get in-place overwrite with identical-mapping validation.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 5: Staging script, moe vocab, and end-to-end

**Files:**
- Modify: `scripts/mint-plugins.mjs`
- Create: `packages/core/mint/moe-vocab.yaml`
- Modify: `packages/mint/test/generate.test.ts` (snapshot update)

**Interfaces:**
- Consumes: Tasks 1-4 (the complete vocabulary pipeline)
- Produces: Updated `mint-plugins.mjs` that stages `moe-mint-vocab.yaml`, empty moe vocab file, green `pnpm check && pnpm mint:check`

- [ ] **Step 1: Create the moe plugin vocabulary file**

`packages/core/mint/moe-vocab.yaml`:

```yaml
tokens: {}
blocks: {}
```

- [ ] **Step 2: Update `mint-plugins.mjs` to stage vocabulary files**

In `scripts/mint-plugins.mjs`, in the `stage()` function, after the line that copies the config file (`fs.copyFileSync(configSrc, ...)`), add:

```javascript
// Stage the vocabulary file alongside the config, if one exists. The
// vocabulary file lives next to the mint config in the package tree and
// is copied to moe-mint-vocab.yaml (the name loadVocabulary() expects).
const vocabSrc = path.join(path.dirname(configSrc), path.basename(plugin.config).replace(/\.yaml$/, '-vocab.yaml'));
if (fs.existsSync(vocabSrc)) {
  fs.copyFileSync(vocabSrc, path.join(dest, 'moe-mint-vocab.yaml'));
}
```

The convention: the vocab file sits next to the mint config with `-vocab` appended. `packages/core/mint/moe.yaml` → `packages/core/mint/moe-vocab.yaml`. Staged as `plugins/moe/moe-mint-vocab.yaml`.

- [ ] **Step 3: Run `pnpm mint` to regenerate plugins/**

Run: `pnpm mint`
Expected: generates per-adapter skill directories under `plugins/moe/`

- [ ] **Step 4: Verify the output structure**

Run: `ls plugins/moe/.codex-plugin/skills/ && ls plugins/moe/.cursor-plugin/skills/ && ls plugins/moe/.kimi-plugin/skills/`
Expected: skill directories present, matching source skills

- [ ] **Step 5: Run `pnpm check`**

Run: `pnpm check`
Expected: PASS (lint, typecheck, test all green)

- [ ] **Step 6: Run `pnpm mint:check`**

Run: `pnpm mint:check`
Expected: PASS (plugins/ is byte-identical to regenerated output)

- [ ] **Step 7: Update snapshots if needed**

If the kitchen-sink snapshot test fails due to new vocabulary skill files:

Run: `pnpm --filter @bubstack/moe-mint test -- --update`

Then verify the snapshot diff is exactly the new per-adapter skill directories.

- [ ] **Step 8: Commit**

```bash
git add scripts/mint-plugins.mjs packages/core/mint/moe-vocab.yaml plugins/
git commit -m "feat(mint): stage vocabulary files and ship empty moe vocab

mint-plugins.mjs stages moe-mint-vocab.yaml alongside the mint config.
The moe plugin ships an empty vocabulary (zero tokens) — per-adapter
skill directories are byte-identical copies. Adding a token to the
vocab and a {token} to a skill file produces substituted output on the
next pnpm mint.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Phase 2: First Inline Tokens

### Task 6: Define `{ask}`, `{todo}`, `{skill}` tokens

**Blocked by:** D1 (if agent-plugins-1.0 mappings differ from claude-code)

**Files:**
- Modify: `packages/core/mint/moe-vocab.yaml`

**Interfaces:**
- Consumes: `loadVocabulary` from Task 1
- Produces: Three fully-mapped inline tokens in the vocabulary file

- [ ] **Step 1: Write the token definitions**

Update `packages/core/mint/moe-vocab.yaml`:

```yaml
tokens:
  ask:
    claude-code: "`AskUserQuestion`"
    cursor: "`AskUserQuestion`"
    codex: "ask in the terminal"
    kimi: "`AskUserQuestion`"
    opencode: "ask in the terminal"
    pi: "ask in the terminal"
    agent-plugins-1.0: "`AskUserQuestion`"
    copilot: "`AskUserQuestion`"
  todo:
    claude-code: "`TaskCreate`/`TaskUpdate`"
    cursor: "`TaskCreate`/`TaskUpdate`"
    codex: "track in a checklist file"
    kimi: "`TodoList`"
    opencode: "`todowrite`"
    pi: "`TODO.md`"
    agent-plugins-1.0: "`TaskCreate`/`TaskUpdate`"
    copilot: "`TaskCreate`/`TaskUpdate`"
  skill:
    claude-code: "the `Skill` tool"
    cursor: "the `Skill` tool"
    codex: "native skill discovery"
    kimi: "the `Skill` tool"
    opencode: "the `skill` tool"
    pi: "read the skill's `SKILL.md`"
    agent-plugins-1.0: "the `Skill` tool"
    copilot: "the `Skill` tool"
blocks: {}
```

- [ ] **Step 2: Run `pnpm mint` to validate the vocabulary loads**

Run: `pnpm mint`
Expected: either PASS (if no skills use these tokens yet) or FAIL with "unknown tokens" (if skills already contain `{ask}`, `{todo}`, or `{skill}` — they shouldn't yet)

- [ ] **Step 3: Commit**

```bash
git add packages/core/mint/moe-vocab.yaml
git commit -m "feat(mint): define {ask}, {todo}, {skill} token mappings

Three inline tokens with full 8-adapter coverage. Skills that use these
tokens will ship with harness-native tool names after pnpm mint.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 7: Convert 2-3 skills to use tokens

**Blocked by:** D1

**Files:**
- Modify: `packages/core/skills/brainstorming/SKILL.md`
- Modify: `packages/core/skills/developing-claude-code-plugins/SKILL.md`
- Modify: `packages/core/skills/writing-plans/SKILL.md`

**Interfaces:**
- Consumes: Vocabulary from Task 6
- Produces: Skills with `{ask}`, `{todo}`, `{skill}` tokens replacing Claude-Code-specific tool names; per-adapter output verified

- [ ] **Step 1: Identify and convert tool-name references**

Search each skill for direct tool-name references that match a defined token. Replace with the token form. Examples:

- `AskUserQuestion` → `{ask}` (when referring to the tool generically, not in Claude-Code-specific context)
- `TaskCreate`/`TaskUpdate` → `{todo}` (when referring to task tracking)
- `the Skill tool` → `{skill}` (when referring to skill invocation)

Be selective: references inside Claude-Code-specific sections (e.g., code blocks showing exact API calls, harness-specific instructions) should use `\{ask}` escaping or remain as-is if the context is explicitly Claude Code.

- [ ] **Step 2: Run `pnpm mint` and verify per-adapter output**

Run: `pnpm mint`
Expected: PASS — no unknown tokens, no survivors

- [ ] **Step 3: Spot-check substituted output**

Run: `grep -r 'AskUserQuestion' plugins/moe/.codex-plugin/skills/brainstorming/`
Expected: no matches (Codex gets "ask in the terminal")

Run: `grep -r 'AskUserQuestion' plugins/moe/skills/brainstorming/`
Expected: matches (Claude Code keeps `AskUserQuestion`)

- [ ] **Step 4: Run `pnpm check && pnpm mint:check`**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/skills/ plugins/
git commit -m "feat: convert brainstorming, developing-claude-code-plugins, writing-plans to use vocabulary tokens

{ask}, {todo}, {skill} replace direct tool-name references. Each
harness now sees its own native tool names in these skills.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Phase 3: Block Tokens and Remaining Inline Tokens

### Task 8: Define remaining vocabulary

**Files:**
- Modify: `packages/core/mint/moe-vocab.yaml`

**Interfaces:**
- Consumes: `loadVocabulary` from Task 1
- Produces: Full vocabulary — 11 inline tokens and 3 block tokens, all with 8-adapter coverage

- [ ] **Step 1: Add inline tokens `{artifact}` through `{web-fetch}`**

Add to `packages/core/mint/moe-vocab.yaml` under `tokens:`, the 8 remaining inline tokens from spec §3.1: `artifact`, `read`, `write`, `edit`, `search`, `find`, `bash`, `web-fetch`. Each with full 8-adapter mappings per the spec's table.

- [ ] **Step 2: Add block tokens**

Add to `packages/core/mint/moe-vocab.yaml` under `blocks:`:

- `subagent-dispatch`: per-adapter dispatch instructions (~3-15 lines each). Source content from the existing `references/*.md` files — the tool-name mapping and dispatch-lifecycle sections.
- `subagent-wait`: per-adapter result-collection instructions. Source from references files.
- `render-ladder`: per-adapter rendering-ladder availability. Source from `_shared/native-rendering.md` and references files.

- [ ] **Step 3: Run `pnpm mint` to validate**

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/core/mint/moe-vocab.yaml
git commit -m "feat(mint): full vocabulary — 11 inline + 3 block tokens

Complete 8-adapter mappings for all tokens defined in the native
renderers spec. Block tokens carry the behavioral guidance that
currently lives in references/*.md files.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 9: Convert heavy-divergence skills

**Files:**
- Modify: `packages/core/skills/dispatching-parallel-agents/SKILL.md`
- Modify: `packages/core/skills/subagent-driven-development/SKILL.md`
- Modify: additional skills with file-operation or rendering references

**Interfaces:**
- Consumes: Full vocabulary from Task 8
- Produces: Most tool-name references across all 27 skills templated; per-adapter output verified

- [ ] **Step 1: Audit all skills for tool-name references**

Run: `grep -rn 'AskUserQuestion\|TaskCreate\|TaskUpdate\|TodoList\|todowrite\|Artifact tool\|Agent tool\|Skill tool\|the Read tool\|the Write tool\|the Edit tool\|the Bash tool\|the Grep tool\|the Glob tool' packages/core/skills/`

Convert each match to the appropriate token, using `\{...}` escaping where the reference is inside a code block or harness-specific section.

- [ ] **Step 2: Convert `{subagent-dispatch}` and `{subagent-wait}` uses**

Skills that describe how to dispatch or collect subagent results should use the block tokens. The block content replaces the current inline dispatch instructions.

- [ ] **Step 3: Run `pnpm mint && pnpm check && pnpm mint:check`**

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/core/skills/ plugins/
git commit -m "feat: convert remaining skills to vocabulary tokens

Most tool-name references across all skills are now templated.
Block tokens {subagent-dispatch}, {subagent-wait}, {render-ladder}
replace inline behavioral guidance.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Phase 4: Trim References Files

### Task 10: Trim tool-name sections from references files

**Files:**
- Modify: `packages/core/skills/using-moe/references/codex-tools.md`
- Modify: `packages/core/skills/using-moe/references/gemini-tools.md`
- Modify: `packages/core/skills/using-moe/references/kimi-tools.md`
- Modify: `packages/core/skills/using-moe/references/opencode-tools.md`
- Modify: `packages/core/skills/using-moe/references/pi-tools.md`
- Modify: `packages/core/skills/using-moe/references/antigravity-tools.md`
- Modify: `packages/core/skills/_shared/native-rendering.md`
- Possibly modify: `packages/core/test/metadata.test.ts` (if any file is deleted entirely)

**Interfaces:**
- Consumes: Tasks 8-9 (full vocabulary with block tokens)
- Produces: References files carry behavioral guidance only; tool-name translation is fully build-time

- [ ] **Step 1: Identify subsumed sections in each references file**

For each file, identify:
1. **Tool-name mapping tables** — subsumed by inline tokens. Delete.
2. **Native rendering ladder sections** — subsumed by `{render-ladder}`. Delete.
3. **Subagent dispatch/wait sections** — subsumed by `{subagent-dispatch}` / `{subagent-wait}`. Delete.
4. **Behavioral guidance** — environment detection, App finishing protocol, instructions-file locations, personal skills directory paths. Keep.

- [ ] **Step 2: Trim each file**

Delete the subsumed sections. Keep behavioral guidance that is too specific or too long for a block token. If a file becomes empty after trimming, delete it entirely.

- [ ] **Step 3: Update `metadata.test.ts` if any file was deleted**

The test "accounts for every skill on disk in exactly one of the two maps" and the pinned imported-set literal may need updating if files under `_shared/` change. Check by running:

Run: `pnpm --filter @bubstack/moe-core test`

- [ ] **Step 4: Update `using-moe/SKILL.md` if references file set changed**

The bootstrap skill's "Platform Adaptation" section lists per-harness reference files. Remove entries for deleted files.

- [ ] **Step 5: Run `pnpm check && pnpm mint:check`**

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/core/skills/ plugins/
git commit -m "feat: trim references files — tool-name translation is now build-time

Deleted tool-name mapping tables and rendering-ladder sections from all
6 references files. Remaining content is behavioral guidance too specific
for a block token. Tool-name translation is fully handled by vocabulary
substitution at build time.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```
