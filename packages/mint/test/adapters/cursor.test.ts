import { describe, it, expect } from 'vitest'
import { byPathMap, mustGet, withV1Policy } from '../helpers.js'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildModel } from '../../src/model.js'
import { adjustedModel } from '../../src/vocabulary.js'
import { cursor } from '../../src/adapters/cursor.js'
import { claudeCode } from '../../src/adapters/claude-code.js'
import { adapters, getAdapter } from '../../src/adapters/index.js'

const model = adjustedModel(buildModel('fixtures/kitchen-sink'), cursor.skillLayout)

describe('adapter registry', () => {
  it('registers cursor', () => {
    expect(adapters.map((a) => a.name)).toContain('cursor')
    expect(getAdapter('cursor')).toBe(cursor)
  })
})

describe('cursor adapter', () => {
  const result = cursor.emit(model)
  const byPath = byPathMap(result.files)

  it('emits .cursor-plugin/plugin.json with config fields including category, tags, commands, agents, mcpServers (no homepage leak from claude-code override)', () => {
    const manifest = JSON.parse(mustGet(byPath, '.cursor-plugin/plugin.json'))
    expect(manifest).toEqual({
      name: 'kitchen-sink',
      displayName: 'kitchen-sink',
      description: 'Fixture plugin exercising every component type',
      version: '0.1.0',
      author: { name: 'Bubstack', email: 'dev@bubstack.example' },
      license: 'MIT',
      repository: 'https://github.com/example/kitchen-sink',
      keywords: ['fixture'],
      skills: './.cursor-plugin/skills/',
      category: 'Developer Tools',
      tags: ['demo', 'fixture'],
      commands: './commands/',
      agents: './agents/',
      mcpServers: './.cursor-plugin/mcp.json',
      hooks: './.cursor-plugin/hooks/moe-mint/hooks.json',
    })
  })

  it('emits .cursor-plugin/marketplace.json with cursor multi-plugin format', () => {
    const marketplace = JSON.parse(mustGet(byPath, '.cursor-plugin/marketplace.json'))
    expect(marketplace).toEqual({
      name: 'kitchen-sink-market',
      owner: { name: 'Bubstack', email: 'dev@bubstack.example' },
      metadata: { description: 'Fixture plugin exercising every component type' },
      plugins: [
        {
          name: 'kitchen-sink',
          source: './',
          description: 'Fixture plugin exercising every component type',
        },
      ],
    })
  })

  it('emits .cursor-plugin/mcp.json with the model mcp config', () => {
    const mcp = JSON.parse(mustGet(byPath, '.cursor-plugin/mcp.json'))
    expect(mcp).toEqual({
      mcpServers: {
        'ks-demo': {
          command: 'node',
          args: ['./mcp-demo-server.js'],
        },
      },
    })
  })

  it('emits its private hooks.json with the sessionStart command', () => {
    const hooks = JSON.parse(mustGet(byPath, '.cursor-plugin/hooks/moe-mint/hooks.json'))
    expect(hooks).toEqual({
      version: 1,
      hooks: {
        sessionStart: [{ command: './.cursor-plugin/hooks/moe-mint/run-hook.cmd session-start' }],
      },
    })
  })

  it('emits an adapter-private session-start and the compatible polyglot wrapper, executable', () => {
    const claudeResult = claudeCode.emit(model)
    const claudeByPath = Object.fromEntries(claudeResult.files.map((f) => [f.path, f]))
    const cursorByPath = Object.fromEntries(result.files.map((f) => [f.path, f]))

    const sessionStart = cursorByPath['.cursor-plugin/hooks/moe-mint/session-start']
    expect(sessionStart?.executable).toBe(true)
    expect(sessionStart?.content).toContain('.cursor-plugin/skills/using-kitchen-sink/SKILL.md')
    expect(sessionStart?.content).not.toBe(claudeByPath['hooks/moe-mint/session-start']?.content)

    const runHookCmd = cursorByPath['.cursor-plugin/hooks/moe-mint/run-hook.cmd']
    expect(runHookCmd?.executable).toBe(true)
    expect(runHookCmd?.content).toBe(claudeByPath['hooks/moe-mint/run-hook.cmd']?.content)
  })

  it('warns about user hooks, commands, agents, and mcp not being translated/emitted', () => {
    expect(result.limitations.map((limitation) => limitation.message)).toEqual([
      'user hooks are not translated for cursor in v1',
      'commands are not emitted for cursor in v1',
      'agents are not emitted for cursor in v1',
      'mcp servers are not emitted for cursor in v1',
    ])
  })

  it('derives capabilities from emitted Cursor projection files', () => {
    expect(result.emittedCapabilities).toEqual(['skill-discovery', 'hook-execution', 'bootstrap-routing'])
  })

  it('declares expected support levels', () => {
    expect(cursor.support).toEqual({
      skills: 'full',
      commands: 'full',
      agents: 'full',
      hooks: 'partial',
      mcp: 'full',
      bootstrap: 'full',
      rules: 'none',
      variables: 'none',
    })
  })
})

describe('cursor adapter with harnesses.cursor.manifest', () => {
  it('overrides displayName via harnesses.cursor.manifest', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mint-cursor-override-'))
    writeFileSync(
      join(dir, 'moe-mint.yaml'),
      withV1Policy([
        'name: override-demo',
        'version: 1.0.0',
        'description: override fixture for cursor displayName',
        'bootstrap: none',
        'harnesses:',
        '  cursor:',
        '    manifest:',
        '      displayName: Fancy',
      ].join('\n')),
    )
    const overrideModel = buildModel(dir)
    const result = cursor.emit(overrideModel)
    const manifest = JSON.parse(result.files.find((f) => f.path === '.cursor-plugin/plugin.json')!.content)
    expect(manifest.displayName).toBe('Fancy')
  })
})

describe('cursor adapter with harnesses.cursor.hooks: own', () => {
  it('emits no hooks/ files and no manifest hooks key for skill mode', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mint-cursor-emithooks-skill-'))
    mkdirSync(join(dir, 'skills', 'using-demo'), { recursive: true })
    writeFileSync(
      join(dir, 'skills', 'using-demo', 'SKILL.md'),
      '---\nname: using-demo\ndescription: demo bootstrap skill\n---\n\nBody.\n',
    )
    writeFileSync(
      join(dir, 'moe-mint.yaml'),
      withV1Policy('name: no-hooks\nversion: 1.0.0\ndescription: hooks own fixture\nbootstrap:\n  skill: using-demo\nharnesses:\n  cursor:\n    hooks: own\n'),
    )
    const noHooksModel = buildModel(dir)
    const result = cursor.emit(noHooksModel)
    expect(result.files.map((f) => f.path).filter((p) => p.startsWith('.cursor-plugin/hooks/'))).toEqual([])
    const manifest = JSON.parse(result.files.find((f) => f.path === '.cursor-plugin/plugin.json')!.content)
    expect(manifest).not.toHaveProperty('hooks')
  })

  it('still writes the generated bootstrap.md for generate mode, but no shell-hook files or manifest hooks key', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mint-cursor-emithooks-generate-'))
    writeFileSync(
      join(dir, 'moe-mint.yaml'),
      withV1Policy('name: no-hooks-generate\nversion: 1.0.0\ndescription: hooks own generate fixture\nbootstrap: generate\nharnesses:\n  cursor:\n    hooks: own\n'),
    )
    const noHooksModel = buildModel(dir)
    const result = cursor.emit(noHooksModel)
    const bootstrapMd = result.files.find((f) => f.path === 'hooks/moe-mint/bootstrap.md')
    expect(bootstrapMd).toBeDefined()
    expect(bootstrapMd?.content).toContain('# no-hooks-generate plugin')
    const hookFiles = result.files.map((f) => f.path).filter((p) => p.startsWith('.cursor-plugin/hooks/'))
    expect(hookFiles).toEqual([])
    const manifest = JSON.parse(result.files.find((f) => f.path === '.cursor-plugin/plugin.json')!.content)
    expect(manifest).not.toHaveProperty('hooks')
  })

  it('drops the bootstrap-hook bullet from installDoc', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mint-cursor-emithooks-installdoc-'))
    mkdirSync(join(dir, 'skills', 'using-demo'), { recursive: true })
    writeFileSync(
      join(dir, 'skills', 'using-demo', 'SKILL.md'),
      '---\nname: using-demo\ndescription: demo bootstrap skill\n---\n\nBody.\n',
    )
    writeFileSync(
      join(dir, 'moe-mint.yaml'),
      withV1Policy('name: no-hooks-doc\nversion: 1.0.0\ndescription: hooks own installDoc fixture\nbootstrap:\n  skill: using-demo\nharnesses:\n  cursor:\n    hooks: own\n'),
    )
    const noHooksModel = buildModel(dir)
    const body = cursor.installDoc!(noHooksModel)
    expect(body).not.toContain('bootstrap hook')
  })

  it('does not claim a bootstrap hook is emitted in the Caveats section when the plugin has hand-written hooks', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mint-cursor-emithooks-installdoc-hooks-'))
    mkdirSync(join(dir, 'skills', 'using-demo'), { recursive: true })
    writeFileSync(
      join(dir, 'skills', 'using-demo', 'SKILL.md'),
      '---\nname: using-demo\ndescription: demo bootstrap skill\n---\n\nBody.\n',
    )
    mkdirSync(join(dir, 'hooks'), { recursive: true })
    writeFileSync(join(dir, 'hooks', 'hooks.json'), '{"hooks":{}}\n')
    writeFileSync(
      join(dir, 'moe-mint.yaml'),
      withV1Policy('name: no-hooks-doc-hooks\nversion: 1.0.0\ndescription: hooks own installDoc fixture with hand-written hooks\nbootstrap:\n  skill: using-demo\nharnesses:\n  cursor:\n    hooks: own\n'),
    )
    const noHooksModel = buildModel(dir)
    const body = cursor.installDoc!(noHooksModel)
    expect(body).toContain('## Caveats')
    expect(body).not.toContain('only the bootstrap sessionStart hook is emitted')
    expect(body).toContain('no hooks are emitted for Cursor')
  })
})

describe('per-harness hooks: own', () => {
  it('suppresses claude-code hooks while cursor keeps its default-true hooks, from one shared config', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mint-mixed-emithooks-'))
    mkdirSync(join(dir, 'skills', 'using-demo'), { recursive: true })
    writeFileSync(
      join(dir, 'skills', 'using-demo', 'SKILL.md'),
      '---\nname: using-demo\ndescription: demo bootstrap skill\n---\n\nBody.\n',
    )
    writeFileSync(
      join(dir, 'moe-mint.yaml'),
      withV1Policy([
        'name: mixed-emithooks',
        'version: 1.0.0',
        'description: per-harness hooks fixture',
        'bootstrap:',
        '  skill: using-demo',
        'harnesses:',
        '  claude-code:',
        '    hooks: own',
      ].join('\n')),
    )
    const mixedModel = buildModel(dir)

    const claudeResult = claudeCode.emit(mixedModel)
    expect(claudeResult.files.map((f) => f.path).filter((p) => p.startsWith('hooks/'))).toEqual([])
    const claudeManifest = JSON.parse(
      claudeResult.files.find((f) => f.path === '.claude-plugin/plugin.json')!.content,
    )
    expect(claudeManifest).not.toHaveProperty('hooks')

    const cursorResult = cursor.emit(mixedModel)
    expect(cursorResult.files.map((f) => f.path)).toEqual(
      expect.arrayContaining([
        '.cursor-plugin/hooks/moe-mint/session-start',
        '.cursor-plugin/hooks/moe-mint/run-hook.cmd',
        '.cursor-plugin/hooks/moe-mint/hooks.json',
      ]),
    )
    const cursorManifest = JSON.parse(
      cursorResult.files.find((f) => f.path === '.cursor-plugin/plugin.json')!.content,
    )
    expect(cursorManifest.hooks).toBe('./.cursor-plugin/hooks/moe-mint/hooks.json')
  })
})

describe('cursor adapter with bootstrap.generate', () => {
  it('emits a generated bootstrap.md wired into the session-start hook', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mint-cursor-generate-'))
    writeFileSync(
      join(dir, 'moe-mint.yaml'),
      withV1Policy('name: generate-bootstrap\nversion: 1.0.0\ndescription: bootstrap.generate fixture\nbootstrap: generate\n'),
    )
    const generateModel = buildModel(dir)
    const result = cursor.emit(generateModel)
    expect(result.limitations).toEqual([])
    const bootstrapMd = result.files.find((f) => f.path === 'hooks/moe-mint/bootstrap.md')
    expect(bootstrapMd?.content).toContain('# generate-bootstrap plugin')
    const sessionStart = result.files.find((f) => f.path === '.cursor-plugin/hooks/moe-mint/session-start')
    expect(sessionStart?.executable).toBe(true)
    expect(sessionStart?.content).toContain('hooks/moe-mint/bootstrap.md')
    const manifest = JSON.parse(result.files.find((f) => f.path === '.cursor-plugin/plugin.json')!.content)
    expect(manifest.hooks).toBe('./.cursor-plugin/hooks/moe-mint/hooks.json')
  })
})

describe('cursor adapter omits optional manifest fields when model is empty', () => {
  it('does not include commands, agents, or mcpServers in manifest when model has none', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mint-cursor-empty-'))
    writeFileSync(
      join(dir, 'moe-mint.yaml'),
      [
        'name: empty-demo', 'version: 1.0.0', 'description: empty fixture', 'bootstrap: none',
        'distribution:', '  npm: "@scope/empty-demo"',
        'artifact:', '  payloads: []',
        'harnesses:', '  exclude: [claude-code, codex, kimi, opencode, pi, agent-plugins-1.0, copilot]',
        'targets:',
        '  claude-code: { intent: omit }', '  cursor: { intent: preview, expected_capabilities: [skill-discovery], operating_systems: [macos] }',
        '  codex: { intent: omit }', '  kimi: { intent: omit }', '  opencode: { intent: omit }',
        '  pi: { intent: omit }', '  agent-plugins-1.0: { intent: omit }', '  copilot: { intent: omit }',
        'imported_works: []',
      ].join('\n') + '\n',
    )
    const emptyModel = buildModel(dir)
    const result = cursor.emit(emptyModel)
    const manifest = JSON.parse(result.files.find((f) => f.path === '.cursor-plugin/plugin.json')!.content)
    expect(manifest).not.toHaveProperty('commands')
    expect(manifest).not.toHaveProperty('agents')
    expect(manifest).not.toHaveProperty('mcpServers')
    expect(manifest).not.toHaveProperty('category')
    expect(manifest).not.toHaveProperty('tags')
  })

  it('does not emit .cursor-plugin/mcp.json when model has no mcp', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mint-cursor-no-mcp-'))
    writeFileSync(
      join(dir, 'moe-mint.yaml'),
      [
        'name: no-mcp-demo', 'version: 1.0.0', 'description: no mcp fixture', 'bootstrap: none',
        'distribution:', '  npm: "@scope/no-mcp-demo"',
        'artifact:', '  payloads: []',
        'harnesses:', '  exclude: [claude-code, codex, kimi, opencode, pi, agent-plugins-1.0, copilot]',
        'targets:',
        '  claude-code: { intent: omit }', '  cursor: { intent: preview, expected_capabilities: [skill-discovery], operating_systems: [macos] }',
        '  codex: { intent: omit }', '  kimi: { intent: omit }', '  opencode: { intent: omit }',
        '  pi: { intent: omit }', '  agent-plugins-1.0: { intent: omit }', '  copilot: { intent: omit }',
        'imported_works: []',
      ].join('\n') + '\n',
    )
    const noMcpModel = buildModel(dir)
    const result = cursor.emit(noMcpModel)
    expect(result.files.find((f) => f.path === '.cursor-plugin/mcp.json')).toBeUndefined()
  })
})
