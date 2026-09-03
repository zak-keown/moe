import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolvePlatform } from '../src/platform/load.js'
import { TARGET_IDS, type TargetId } from '../src/vocabulary.js'

const REPO_ROOT = join(import.meta.dirname, '../../..')
const CANONICAL_REPOSITORY = 'https://github.com/zak-keown/moe'
const HOST_OPERATING_SYSTEMS = ['macos', 'linux', 'wsl2', 'windows']
const CREW_OPERATING_SYSTEMS = ['macos', 'linux', 'wsl2']

type ExpectedTarget = {
  intent: 'certify' | 'preview' | 'omit'
  capabilities?: readonly string[]
  operatingSystems?: readonly string[]
}

type PublicPluginExpectation = {
  id: string
  npmPackage: string
  source: string
  config: string
  version: string
  license: string
  description: string
  keywords: readonly string[]
  payloads: readonly { from: string; to: string; required: boolean }[]
  targets: Record<TargetId, ExpectedTarget>
}

const OMIT: ExpectedTarget = { intent: 'omit' }

function target(
  capabilities: readonly string[],
  operatingSystems: readonly string[] = HOST_OPERATING_SYSTEMS,
  intent: 'certify' | 'preview' = 'preview',
): ExpectedTarget {
  return { intent, capabilities, operatingSystems }
}

const PUBLIC_PLUGINS: readonly PublicPluginExpectation[] = [
  {
    id: 'moe',
    npmPackage: '@bubstack/moe-core',
    source: 'packages/core',
    config: 'packages/core/mint/moe.yaml',
    version: '0.1.4',
    license: 'MIT AND Apache-2.0',
    description: 'The Moe skill library — brainstorming, planning, TDD, systematic debugging, code review, worktrees, parallel dispatch, plugin authoring, and more.',
    keywords: ['skills', 'brainstorming', 'planning', 'tdd', 'debugging', 'code-review', 'workflow', 'writing', 'plugin-authoring'],
    payloads: [],
    targets: {
      'claude-code': target(['skill-discovery', 'agent-discovery', 'hook-execution', 'bootstrap-routing'], HOST_OPERATING_SYSTEMS, 'certify'),
      cursor: target(['skill-discovery', 'hook-execution', 'bootstrap-routing']),
      codex: target(['skill-discovery']),
      kimi: target(['skill-discovery', 'bootstrap-routing']),
      opencode: target(['skill-discovery', 'agent-discovery', 'bootstrap-routing']),
      pi: target(['skill-discovery', 'bootstrap-routing']),
      'agent-plugins-1.0': { intent: 'preview', capabilities: ['skill-discovery', 'format-conformance'] },
      copilot: target(['skill-discovery', 'agent-discovery', 'hook-execution', 'bootstrap-routing']),
    },
  },
  {
    id: 'moe-backstory',
    npmPackage: '@bubstack/moe-backstory',
    source: 'packages/backstory',
    config: 'packages/backstory/mint/moe-backstory.yaml',
    version: '0.1.4',
    license: 'Apache-2.0',
    description: 'Recover a behavioral spec from a codebase that never had one.',
    keywords: ['reverse-engineering', 'specification', 'analysis', 'archaeology', 'documentation'],
    payloads: [],
    targets: {
      'claude-code': target(['skill-discovery', 'command-discovery', 'agent-discovery'], HOST_OPERATING_SYSTEMS, 'certify'),
      cursor: target(['skill-discovery']),
      codex: target(['skill-discovery']),
      kimi: target(['skill-discovery']),
      opencode: target(['skill-discovery', 'command-discovery', 'agent-discovery']),
      pi: target(['skill-discovery']),
      'agent-plugins-1.0': { intent: 'preview', capabilities: ['skill-discovery', 'format-conformance'] },
      copilot: target(['skill-discovery', 'command-discovery', 'agent-discovery']),
    },
  },
  {
    id: 'moe-memory',
    npmPackage: '@bubstack/moe-memory',
    source: 'packages/memory',
    config: 'packages/memory/mint/moe-memory.yaml',
    version: '0.1.4',
    license: 'MIT',
    description: 'Semantic recall over past sessions and journal entries.',
    keywords: ['memory', 'search', 'embeddings', 'journal', 'mcp'],
    payloads: [{ from: 'dist', to: 'dist', required: true }, { from: 'prompts', to: 'prompts', required: true }],
    targets: {
      'claude-code': target(['skill-discovery', 'agent-discovery', 'hook-execution', 'mcp-registration', 'bootstrap-routing'], HOST_OPERATING_SYSTEMS, 'certify'),
      cursor: target(['skill-discovery', 'hook-execution', 'bootstrap-routing']),
      codex: target(['skill-discovery']),
      kimi: target(['skill-discovery', 'bootstrap-routing']),
      opencode: target(['skill-discovery', 'agent-discovery', 'bootstrap-routing']),
      pi: target(['skill-discovery', 'bootstrap-routing']),
      'agent-plugins-1.0': { intent: 'preview', capabilities: ['skill-discovery', 'mcp-registration', 'format-conformance'] },
      copilot: target(['skill-discovery', 'agent-discovery', 'hook-execution', 'mcp-registration', 'bootstrap-routing']),
    },
  },
  {
    id: 'moe-glass',
    npmPackage: '@bubstack/moe-glass',
    source: 'packages/glass',
    config: 'packages/glass/mint/moe-glass.yaml',
    version: '0.1.4',
    license: 'MIT',
    description: 'Direct Chrome DevTools Protocol access. Skill mode plus MCP mode, zero dependencies.',
    keywords: ['chrome', 'devtools-protocol', 'browser', 'automation', 'screenshots'],
    payloads: [{ from: 'dist', to: 'dist', required: true }],
    targets: {
      'claude-code': target(['skill-discovery', 'agent-discovery'], HOST_OPERATING_SYSTEMS, 'certify'),
      cursor: target(['skill-discovery']),
      codex: target(['skill-discovery']),
      kimi: target(['skill-discovery']),
      opencode: target(['skill-discovery', 'agent-discovery']),
      pi: target(['skill-discovery']),
      'agent-plugins-1.0': { intent: 'preview', capabilities: ['skill-discovery', 'format-conformance'] },
      copilot: target(['skill-discovery', 'agent-discovery']),
    },
  },
  {
    id: 'moe-crew',
    npmPackage: '@bubstack/moe-crew',
    source: 'packages/crew',
    config: 'packages/crew/mint/moe-crew.yaml',
    version: '0.1.4',
    license: 'MIT',
    description: 'Launch, control and monitor Claude Code, Codex, and Pi workers over tmux.',
    keywords: ['tmux', 'orchestration', 'subagents', 'sessions'],
    payloads: [{ from: 'dist', to: 'dist', required: true }],
    targets: {
      'claude-code': target(['skill-discovery', 'hook-execution'], CREW_OPERATING_SYSTEMS, 'certify'),
      cursor: target(['skill-discovery'], CREW_OPERATING_SYSTEMS),
      codex: target(['skill-discovery'], CREW_OPERATING_SYSTEMS),
      kimi: target(['skill-discovery'], CREW_OPERATING_SYSTEMS),
      opencode: target(['skill-discovery'], CREW_OPERATING_SYSTEMS),
      pi: target(['skill-discovery'], CREW_OPERATING_SYSTEMS),
      'agent-plugins-1.0': { intent: 'preview', capabilities: ['skill-discovery', 'format-conformance'] },
      copilot: target(['skill-discovery', 'hook-execution'], CREW_OPERATING_SYSTEMS),
    },
  },
  {
    id: 'moe-statusline',
    npmPackage: '@bubstack/moe-statusline',
    source: 'packages/statusline',
    config: 'packages/statusline/mint/moe-statusline.yaml',
    version: '0.1.0',
    license: 'MIT',
    description: 'Configures a vendored, MIT-licensed Claude Code statusline (ccstatusline) automatically on session start.',
    keywords: ['statusline', 'claude-code', 'terminal'],
    payloads: [{ from: 'dist', to: 'dist', required: true }, { from: 'vendor', to: 'vendor', required: true }],
    targets: {
      'claude-code': target(['hook-execution'], HOST_OPERATING_SYSTEMS, 'certify'),
      cursor: OMIT,
      codex: OMIT,
      kimi: OMIT,
      opencode: OMIT,
      pi: OMIT,
      'agent-plugins-1.0': OMIT,
      copilot: OMIT,
    },
  },
]

describe('public plugin registry', () => {
  it('resolves each public package with its canonical metadata and target policy', async () => {
    const platform = await resolvePlatform(REPO_ROOT)

    expect(platform.registry.targets.copilot.requires).toEqual(['claude-code'])
    expect(platform.plugins.map(({ id, npmPackage }) => [id, npmPackage])).toEqual([
      ['moe', '@bubstack/moe-core'],
      ['moe-backstory', '@bubstack/moe-backstory'],
      ['moe-memory', '@bubstack/moe-memory'],
      ['moe-glass', '@bubstack/moe-glass'],
      ['moe-crew', '@bubstack/moe-crew'],
      ['moe-statusline', '@bubstack/moe-statusline'],
    ])

    for (const expected of PUBLIC_PLUGINS) {
      const resolved = platform.plugins.find((plugin) => plugin.id === expected.id)
      expect(resolved, expected.id).toBeDefined()
      if (resolved === undefined) continue

      expect(resolved).toMatchObject({
        id: expected.id,
        npmPackage: expected.npmPackage,
        version: expected.version,
        sourcePath: join(REPO_ROOT, expected.source),
        configPath: join(REPO_ROOT, expected.config),
      })
      expect(resolved.config).toMatchObject({
        description: expected.description,
        author: { name: 'Zak Keown', email: 'zak.keown@outlook.com' },
        license: expected.license,
        repository: CANONICAL_REPOSITORY,
        homepage: CANONICAL_REPOSITORY,
        keywords: expected.keywords,
        artifact: { payloads: expected.payloads },
      })
      expect(resolved.packageJson).toMatchObject({
        name: expected.npmPackage,
        version: expected.version,
        description: expected.description,
        author: { name: 'Zak Keown', email: 'zak.keown@outlook.com' },
        license: expected.license,
        repository: CANONICAL_REPOSITORY,
        homepage: CANONICAL_REPOSITORY,
        keywords: expected.keywords,
      })

      for (const targetId of TARGET_IDS) {
        const targetPolicy = expected.targets[targetId]
        const actual = resolved.targets[targetId]
        expect(actual.intent, `${expected.id}/${targetId} intent`).toBe(targetPolicy.intent)
        expect(actual.expectedCapabilities, `${expected.id}/${targetId} capabilities`).toEqual(targetPolicy.capabilities ?? [])
        expect(actual.operatingSystems, `${expected.id}/${targetId} operating systems`).toEqual(targetPolicy.operatingSystems)
        expect(resolved.config.harnesses.exclude.includes(targetId), `${expected.id}/${targetId} exclusion`).toBe(targetPolicy.intent === 'omit')
      }
    }
  })
})
