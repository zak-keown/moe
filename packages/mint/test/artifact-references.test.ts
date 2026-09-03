import { describe, expect, it } from 'vitest'
import type { ArtifactManifestV1 } from '../src/artifact/artifact-manifest.js'
import { validateArtifactReferences, type ArtifactReferenceContext } from '../src/artifact/references.js'

const hash = '0'.repeat(64)

function manifest(paths: readonly string[]): ArtifactManifestV1 {
  return {
    schema: 1,
    plugin: { id: 'demo', package: '@example/demo', version: '1.0.0' },
    files: paths.map((path) => ({ path, size: 0, sha256: hash, mode: '0644' as const })),
    tree_sha256: hash,
    targets: {},
  }
}

const paths = [
  '.agents/plugins/marketplace.json',
  '.claude-plugin/plugin.json',
  '.codex-plugin/plugin.json',
  '.cursor-plugin/plugin.json',
  '.kimi-plugin/plugin.json',
  '.mcp.json',
  '.opencode/plugins/demo.js',
  '.pi/extensions/demo.ts',
  'agents/helper.md',
  'commands/run.md',
  'dist/cli.js',
  'dist/effect.css',
  'dist/index.d.ts',
  'dist/index.js',
  'dist/internal.js',
  'dist/mcp-server.js',
  'dist/server.js',
  'hooks/hooks.json',
  'hooks/run-hook.cmd',
  'prompts/welcome.md',
  'skills/demo/SKILL.md',
]

function context(artifactPaths = paths): ArtifactReferenceContext {
  return {
    artifactManifest: manifest(artifactPaths),
    packageManifest: {
      main: './dist/index.js',
      types: './dist/index.d.ts',
      bin: { demo: './dist/cli.js' },
      exports: { '.': './dist/server.js', './server': './.opencode/plugins/demo.js' },
      imports: { '#runtime': './dist/internal.js' },
      sideEffects: ['./dist/effect.css'],
      pi: {
        extensions: ['./.pi/extensions/demo.ts'],
        skills: ['./skills'],
        prompts: ['./prompts'],
      },
    },
    componentDirectories: {
      skills: 'skills',
      commands: 'commands',
      agents: 'agents',
      hooks: 'hooks/hooks.json',
      prompts: 'prompts',
      mcp: '.mcp.json',
    },
    generatedFiles: [
      {
        path: '.claude-plugin/plugin.json',
        content: JSON.stringify({
          skills: './skills', commands: './commands', agents: './agents',
          hooks: './hooks/hooks.json', mcpServers: './.mcp.json',
        }),
      },
      { path: '.codex-plugin/plugin.json', content: JSON.stringify({ skills: './skills/', hooks: {} }) },
      { path: '.cursor-plugin/plugin.json', content: JSON.stringify({ skills: './skills/', hooks: './hooks/hooks.json' }) },
      { path: '.kimi-plugin/plugin.json', content: JSON.stringify({ skills: './skills/', sessionStart: { skill: 'demo' } }) },
      { path: '.agents/plugins/marketplace.json', content: JSON.stringify({ plugins: [{ source: { source: 'url', url: './' } }] }) },
      { path: 'hooks/hooks.json', content: JSON.stringify({ hooks: { SessionStart: [{ hooks: [{ type: 'command', command: '"${CLAUDE_PLUGIN_ROOT}/hooks/run-hook.cmd" start' }] }] } }) },
    ],
    componentFiles: [{
      path: '.mcp.json',
      content: JSON.stringify({ mcpServers: { demo: { command: 'node', args: ['./dist/mcp-server.js'] } } }),
    }],
  }
}

describe('complete artifact references', () => {
  it('accepts package, Pi, OpenCode, component, MCP, bootstrap, marketplace, and generated harness references', () => {
    expect(() => validateArtifactReferences(context())).not.toThrow()
  })

  it.each([
    ['main', 'dist/index.js', 'PACKAGE_REFERENCE_MISSING'],
    ['types', 'dist/index.d.ts', 'PACKAGE_REFERENCE_MISSING'],
    ['bin', 'dist/cli.js', 'PACKAGE_REFERENCE_MISSING'],
    ['local export', 'dist/server.js', 'PACKAGE_REFERENCE_MISSING'],
    ['local import', 'dist/internal.js', 'PACKAGE_REFERENCE_MISSING'],
    ['side effect', 'dist/effect.css', 'PACKAGE_REFERENCE_MISSING'],
    ['OpenCode server', '.opencode/plugins/demo.js', 'PACKAGE_REFERENCE_MISSING'],
    ['Pi extension', '.pi/extensions/demo.ts', 'PACKAGE_REFERENCE_MISSING'],
    ['skills', 'skills/demo/SKILL.md', 'PACKAGE_REFERENCE_MISSING'],
    ['commands', 'commands/run.md', 'ARTIFACT_REFERENCE_MISSING'],
    ['agents', 'agents/helper.md', 'ARTIFACT_REFERENCE_MISSING'],
    ['hooks', 'hooks/hooks.json', 'ARTIFACT_REFERENCE_MISSING'],
    ['prompts', 'prompts/welcome.md', 'PACKAGE_REFERENCE_MISSING'],
    ['MCP', '.mcp.json', 'ARTIFACT_REFERENCE_MISSING'],
    ['MCP runtime', 'dist/mcp-server.js', 'ARTIFACT_REFERENCE_MISSING'],
    ['bootstrap command', 'hooks/run-hook.cmd', 'ARTIFACT_REFERENCE_MISSING'],
    ['generated harness manifest', '.cursor-plugin/plugin.json', 'ARTIFACT_REFERENCE_MISSING'],
  ])('rejects a missing %s reference', (_name, missing, code) => {
    expect(() => validateArtifactReferences(context(paths.filter((path) => path !== missing))))
      .toThrow(expect.objectContaining({ diagnostic: expect.objectContaining({ code }) }))
  })

  it('rejects path escapes and directory prefix lookalikes', () => {
    expect(() => validateArtifactReferences({
      ...context(),
      generatedFiles: [{ path: '.claude-plugin/plugin.json', content: JSON.stringify({ skills: '../skills' }) }],
    })).toThrow(expect.objectContaining({ diagnostic: expect.objectContaining({ code: 'ARTIFACT_REFERENCE_ESCAPE' }) }))

    const lookalike = context(paths.map((path) => path === 'skills/demo/SKILL.md' ? 'skills-other/demo/SKILL.md' : path))
    expect(() => validateArtifactReferences(lookalike)).toThrow(expect.objectContaining({ diagnostic: expect.objectContaining({ code: 'PACKAGE_REFERENCE_MISSING' }) }))
  })

  it('rejects malformed known generated manifest shapes without scanning arbitrary strings', () => {
    expect(() => validateArtifactReferences({
      ...context(),
      generatedFiles: [{ path: '.claude-plugin/plugin.json', content: JSON.stringify({ skills: 42 }) }],
    })).toThrow(expect.objectContaining({ diagnostic: expect.objectContaining({ code: 'ARTIFACT_REFERENCE_INVALID' }) }))

    expect(() => validateArtifactReferences({
      ...context([...paths, 'docs/install/claude-code.md']),
      generatedFiles: [{ path: 'docs/install/claude-code.md', content: '../not-an-artifact-reference' }],
    })).not.toThrow()
  })

  it('uses configured component paths when parsing hook and MCP runtime references', () => {
    const custom = context([...paths, 'config/custom-mcp.json', 'config/custom-hooks.json'])
    expect(() => validateArtifactReferences({
      ...custom,
      componentDirectories: { ...custom.componentDirectories, mcp: 'config/custom-mcp.json', hooks: 'config/custom-hooks.json' },
      componentFiles: [
        { path: 'config/custom-mcp.json', content: JSON.stringify({ mcpServers: { demo: { command: 'node', args: ['./missing-mcp.js'] } } }) },
        { path: 'config/custom-hooks.json', content: JSON.stringify({ hooks: { SessionStart: [{ command: './missing-hook.cmd' }] } }) },
      ],
    })).toThrow(expect.objectContaining({ diagnostic: expect.objectContaining({ code: 'ARTIFACT_REFERENCE_MISSING' }) }))
  })

  it('rejects case-folded generated-file aliases before lookup', () => {
    const aliased = context([...paths, '.CURSOR-PLUGIN/plugin.json'])
    expect(() => validateArtifactReferences(aliased)).toThrow(expect.objectContaining({ diagnostic: expect.objectContaining({ code: 'ARTIFACT_REFERENCE_COLLISION' }) }))
  })
})
