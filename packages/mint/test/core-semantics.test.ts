import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { generate } from '../src/generate.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const CORE = resolve(HERE, '../../core')

const PROFILE_DIRS = {
  'claude-code': '.claude-plugin/skills',
  cursor: '.cursor-plugin/skills',
  codex: '.codex-plugin/skills',
  kimi: '.kimi-plugin/skills',
  opencode: '.opencode/skills',
  pi: '.pi/skills',
  'agent-plugins-1.0': 'skills',
  copilot: '.claude-plugin/skills',
} as const

const CLAUDE_CONTRACT_ALLOWANCE = new Map<string, number>([
  ['developing-claude-code-plugins/SKILL.md', 2],
  ['developing-claude-code-plugins/examples/full-featured-plugin/README.md', 1],
  ['developing-claude-code-plugins/references/plugin-structure.md', 9],
  ['developing-claude-code-plugins/references/polyglot-hooks.md', 2],
  ['developing-claude-code-plugins/references/troubleshooting.md', 9],
  ['smoothing-the-experience/SKILL.md', 1],
])

const CLAUDE_TERM_ALLOWANCE = new Map<string, number>([
  ['developing-claude-code-plugins/references/anthropic-best-practices.md:haiku', 3],
  ['developing-claude-code-plugins/references/anthropic-best-practices.md:opus', 3],
])

function markdownFiles(root: string): string[] {
  const files: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (entry.isFile() && entry.name.endsWith('.md')) files.push(path)
    }
  }
  walk(root)
  return files.sort()
}

describe('core semantic generation', () => {
  let root: string

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'mint-core-semantics-'))
    cpSync(join(CORE, 'skills'), join(root, 'skills'), { recursive: true })
    cpSync(join(CORE, 'agents'), join(root, 'agents'), { recursive: true })
    cpSync(join(CORE, 'hooks'), join(root, 'hooks'), { recursive: true })
    cpSync(join(CORE, 'mint/moe.yaml'), join(root, 'moe-mint.yaml'))
    cpSync(join(CORE, 'mint/moe-vocab.yaml'), join(root, 'moe-mint-vocab.yaml'))
    generate(root)

    // Artifact consumers install workspace dependencies through the composed
    // package manifest. Mirror that installed shape here so the scheduler
    // launchers are exercised from an unrelated cwd rather than accidentally
    // resolving moe-jig through this repository's workspace links.
    const jig = resolve(HERE, '../../jig')
    const installedJig = join(root, 'node_modules/@bubstack/moe-jig')
    cpSync(join(jig, 'dist'), join(installedJig, 'dist'), { recursive: true })
    cpSync(join(jig, 'package.json'), join(installedJig, 'package.json'), { recursive: true })
  })

  afterAll(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('renders every semantic resource into a document-relative link in every active output', () => {
    for (const [profile, relRoot] of Object.entries(PROFILE_DIRS)) {
      const profileRoot = join(root, relRoot)
      expect(existsSync(profileRoot), `${profile} skill tree`).toBe(true)
      let links = 0
      for (const file of markdownFiles(profileRoot)) {
        const text = readFileSync(file, 'utf8')
        expect(text, `${profile}: ${file}`).not.toMatch(/(?<!\\)\{resource:skills\//)
        for (const match of text.matchAll(/\[skills\/[^\]]+\]\(([^)]+)\)/g)) {
          links += 1
          const target = resolve(dirname(file), decodeURIComponent(match[1] as string))
          expect(existsSync(target), `${profile}: ${file} -> ${match[1]}`).toBe(true)
          expect(statSync(target).isFile(), `${profile}: ${file} -> ${match[1]}`).toBe(true)
        }
      }
      expect(links, `${profile} semantic links`).toBeGreaterThan(0)
    }
  })

  it('invokes generated scheduler resources from a project working directory', () => {
    const project = mkdtempSync(join(tmpdir(), 'mint-core-project-cwd-'))
    try {
      for (const [profile, relRoot] of Object.entries(PROFILE_DIRS)) {
        for (const [skill, script, banner] of [
          ['subagent-driven-development', 'task-set.mjs', 'task-set: compute the intra-plan task DAG'],
          ['sequencing-plans', 'plan-set.mjs', 'plan-set: sequence a set of plans'],
        ] as const) {
          const resource = join(root, relRoot, skill, 'scripts', script)
          const output = execFileSync(process.execPath, [resource, '--help'], {
            cwd: project,
            encoding: 'utf8',
          })
          expect(output, `${profile}: ${script}`).toContain(banner)
        }
      }
    } finally {
      rmSync(project, { recursive: true, force: true })
    }
  })

  it('keeps both requirement validators in explicit generated commands', () => {
    const rel = 'extracting-requirements/SKILL.md'
    const canonical = readFileSync(join(CORE, 'skills', rel), 'utf8')
    const expected = [
      {
        resource: 'skills/extracting-requirements/scripts/validate_requirements_index.py',
        command:
          'python3 "<resolved-validate-requirements-index.py>" docs/moe/iterations/requirements/',
      },
      {
        resource: 'skills/extracting-requirements/scripts/validate_scenarios.py',
        command:
          'python3 "<resolved-validate-scenarios.py>" docs/moe/iterations/behavior-scenarios.md docs/moe/iterations/requirements/',
      },
    ] as const

    for (const item of expected) {
      expect(canonical).toContain(`{resource:${item.resource}}`)
      expect(canonical).toContain(item.command)
    }

    for (const [profile, relRoot] of Object.entries(PROFILE_DIRS)) {
      const generated = readFileSync(join(root, relRoot, rel), 'utf8')
      for (const item of expected) {
        expect(generated, `${profile}: ${item.resource}`).toContain(`[${item.resource}](`)
        expect(generated, `${profile}: ${item.command}`).toContain(item.command)
      }
    }
  })

  it('renders profile-specific call-level model override guidance', () => {
    const documents = [
      'subagent-driven-development/SKILL.md',
      'subagent-driven-development/implementer-prompt.md',
      'subagent-driven-development/re-review-prompt.md',
      'subagent-driven-development/task-reviewer-prompt.md',
    ] as const
    for (const rel of documents) {
      expect(readFileSync(join(CORE, 'skills', rel), 'utf8'), rel).toContain(
        '{model-dispatch-guidance}',
      )
    }

    const expected = {
      'claude-code': 'Every dispatch must set its `model` field explicitly',
      cursor: 'when the installed `Agent` schema exposes a `model` field',
      codex: 'Every `spawn_agent` call must set `model` and `reasoning_effort`',
      kimi: 'does not expose a portable call-level model override',
      opencode: 'does not expose a call-level model override',
      pi: 'only when the installed subagent tool documents that field',
      'agent-plugins-1.0': '`invoke_subagent` does not define a call-level model override',
      copilot: 'Every dispatch must set its `model` field explicitly',
    } as const

    for (const [profile, relRoot] of Object.entries(PROFILE_DIRS)) {
      const rendered = documents.map((rel) => readFileSync(join(root, relRoot, rel), 'utf8'))
      for (const content of rendered) {
        expect(content.replace(/\s+/g, ' '), profile).toContain(
          expected[profile as keyof typeof expected],
        )
        expect(content, profile).not.toContain('Always specify the model explicitly')
      }
      if (profile === 'agent-plugins-1.0') {
        for (const content of rendered.slice(1)) {
          expect(content, `${profile}: prompt must not invent model:`).not.toMatch(/^\s*model:/m)
        }
      }
    }
  })

  it('keeps non-Claude profiles free of Claude-only operational residue', () => {
    const denied = [
      ['AskUserQuestion', /\bAskUserQuestion\b/g],
      ['TaskCreate', /\bTaskCreate\b/g],
      ['haiku', /\bhaiku\b/gi],
      ['opus', /\bopus\b/gi],
    ] as const

    for (const [profile, relRoot] of Object.entries(PROFILE_DIRS)) {
      if (profile === 'claude-code' || profile === 'copilot') continue
      const profileRoot = join(root, relRoot)
      const pluginRootCounts = new Map<string, number>()
      for (const file of markdownFiles(profileRoot)) {
        const rel = file.slice(profileRoot.length + 1)
        const text = readFileSync(file, 'utf8')
        const pluginRootMatches = text.match(/\$\{CLAUDE_PLUGIN_ROOT\}/g) ?? []
        if (pluginRootMatches.length > 0) pluginRootCounts.set(rel, pluginRootMatches.length)
        for (const [name, pattern] of denied) {
          const count = text.match(pattern)?.length ?? 0
          expect(
            count,
            `${profile}: ${rel} exceeds its narrowly reviewed ${name} allowance`,
          ).toBeLessThanOrEqual(CLAUDE_TERM_ALLOWANCE.get(`${rel}:${name}`) ?? 0)
        }
      }

      for (const [rel, count] of pluginRootCounts) {
        expect(
          count,
          `${profile}: ${rel} exceeds its narrowly reviewed Claude-contract allowance`,
        ).toBeLessThanOrEqual(CLAUDE_CONTRACT_ALLOWANCE.get(rel) ?? 0)
      }
    }
  })

  it('renders profile-specific bootstrap truth instead of a universal session-start claim', () => {
    const expected = {
      'claude-code': 'actively injected at session start',
      cursor: 'actively injected at session start',
      codex: 'native skill discovery only',
      kimi: 'named bootstrap skill',
      opencode: 'actively injected at session start',
      pi: 'actively injected at session start',
      'agent-plugins-1.0': 'no bootstrap mechanism',
      copilot: 'actively injected at session start',
    } as const

    for (const [profile, relRoot] of Object.entries(PROFILE_DIRS)) {
      const bootstrap = readFileSync(join(root, relRoot, 'using-moe/SKILL.md'), 'utf8')
      expect(bootstrap, profile).toContain(expected[profile as keyof typeof expected])
    }
  })
})
