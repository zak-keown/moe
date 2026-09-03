import { describe, it, expect } from 'vitest'
import { cpSync, mkdtempSync, mkdirSync, existsSync, readFileSync, writeFileSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { generate, validateGeneration } from '../src/generate.js'
import { MANIFEST_PATH, checkDrift, sha256 } from '../src/manifest.js'
import type { HarnessAdapter } from '../src/adapters/index.js'
import { opencode } from '../src/adapters/opencode.js'
import { pi } from '../src/adapters/pi.js'
import { withV1Policy } from './helpers.js'
import { parse, stringify } from 'yaml'
import { TARGET_IDS, type CapabilityId, type TargetId } from '../src/vocabulary.js'

function freshFixture(): string {
  const dir = mkdtempSync(join(tmpdir(), 'mint-gen-'))
  // Exclude the fixture's own moe-mint-vocab.yaml: most tests in this file
  // exercise generate() with vocabulary inactive, and the "vocabulary
  // integration" tests below opt in explicitly with their own
  // writeFileSync. Copying it unconditionally would make every freshFixture()
  // caller vocab-active by accident.
  cpSync('fixtures/kitchen-sink', dir, {
    recursive: true,
    filter: (src) => !src.endsWith('moe-mint-vocab.yaml'),
  })
  return dir
}

function withTargetCapabilities(yaml: string, capabilities: Partial<Record<TargetId, readonly CapabilityId[]>>): string {
  const config = parse(withV1Policy(yaml)) as { targets: Record<TargetId, { intent: string; expected_capabilities?: readonly CapabilityId[] }> }
  for (const target of TARGET_IDS) {
    if (config.targets[target].intent !== 'omit') config.targets[target].expected_capabilities = capabilities[target] ?? []
  }
  return stringify(config)
}

describe('generate', () => {
  it('validates current adapter emissions without writing generated files or a manifest', () => {
    const dir = freshFixture()

    const result = validateGeneration(dir)

    expect(result.emissions['claude-code']?.emittedCapabilities).toContain('skill-discovery')
    expect(existsSync(join(dir, '.claude-plugin', 'plugin.json'))).toBe(false)
    expect(existsSync(join(dir, MANIFEST_PATH))).toBe(false)
  })

  it('writes adapter files and a clean manifest', () => {
    const dir = freshFixture()
    const result = generate(dir)
    expect(result.adaptersRun).toEqual(['claude-code', 'cursor', 'codex', 'kimi', 'opencode', 'pi', 'agent-plugins-1.0', 'copilot'])
    expect(existsSync(join(dir, '.claude-plugin/plugin.json'))).toBe(true)
    expect(existsSync(join(dir, MANIFEST_PATH))).toBe(true)
    expect(checkDrift(dir).clean).toBe(true)
  })

  it('emits docs/support-matrix.md as a normal generated file, tracked in the manifest and drift-clean', () => {
    const dir = freshFixture()
    const result = generate(dir)
    expect(result.files.some((f) => f.path === 'docs/support-matrix.md')).toBe(true)
    expect(existsSync(join(dir, 'docs/support-matrix.md'))).toBe(true)
    expect(checkDrift(dir).clean).toBe(true)
    const manifest = JSON.parse(readFileSync(join(dir, MANIFEST_PATH), 'utf8'))
    expect(manifest.files['docs/support-matrix.md']).toBeDefined()
  })

  it('leaves README.md wholly human-authored even when historical install markers are present', () => {
    const dir = freshFixture()
    const before = readFileSync(join(dir, 'README.md'), 'utf8')
    generate(dir)

    const readme = readFileSync(join(dir, 'README.md'), 'utf8')
    expect(readme).toBe(before)

    const manifest = JSON.parse(readFileSync(join(dir, MANIFEST_PATH), 'utf8'))
    expect(manifest.files['README.md']).toBeUndefined()
    expect(checkDrift(dir).clean).toBe(true)
  })

  it('uses a projection-owned marketplace name consistently in the Claude descriptor and Claude/Copilot install docs', () => {
    const dir = freshFixture()
    generate(dir, undefined, { marketplaceName: 'core' })

    expect(JSON.parse(readFileSync(join(dir, '.claude-plugin', 'marketplace.json'), 'utf8')).name).toBe('core')
    expect(readFileSync(join(dir, 'docs', 'install', 'claude-code.md'), 'utf8')).toContain('/plugin install kitchen-sink@core')
    expect(readFileSync(join(dir, 'docs', 'install', 'copilot.md'), 'utf8')).toContain('copilot plugin install kitchen-sink@core')
  })

  it('prunes docs/install/<name>.md when its adapter is later excluded, like any other generated file', () => {
    const dir = freshFixture()
    generate(dir)
    expect(existsSync(join(dir, 'docs/install/claude-code.md'))).toBe(true)

    const yaml = readFileSync(join(dir, 'moe-mint.yaml'), 'utf8')
    writeFileSync(join(dir, 'moe-mint.yaml'), yaml
      .replace('  claude-code: { intent: preview, expected_capabilities: [skill-discovery, command-discovery, agent-discovery, hook-execution, mcp-registration, bootstrap-routing], operating_systems: [macos] }', '  claude-code: { intent: omit }')
      .replace('  copilot: { intent: preview, expected_capabilities: [skill-discovery, command-discovery, agent-discovery, hook-execution, mcp-registration, bootstrap-routing], operating_systems: [macos] }', '  copilot: { intent: omit }')
      .replace('harnesses:\n  claude-code:\n    manifest:\n      homepage: https://example.com/kitchen-sink\n', 'harnesses:\n')
      .replace('harnesses:\n', 'harnesses:\n  exclude: [claude-code, copilot]\n'))
    const result = generate(dir)

    expect(result.pruned).toContain('docs/install/claude-code.md')
    expect(existsSync(join(dir, 'docs/install/claude-code.md'))).toBe(false)
    expect(existsSync(join(dir, 'docs/support-matrix.md'))).toBe(true) // unaffected: independent of the active adapter list
  })

  it('is idempotent', () => {
    const dir = freshFixture()
    generate(dir)
    const first = readFileSync(join(dir, '.claude-plugin/plugin.json'), 'utf8')
    generate(dir)
    expect(readFileSync(join(dir, '.claude-plugin/plugin.json'), 'utf8')).toBe(first)
    expect(checkDrift(dir).clean).toBe(true)
  })

  it('respects harnesses.exclude', () => {
    const dir = freshFixture()
    const yaml = readFileSync(join(dir, 'moe-mint.yaml'), 'utf8')
    const patched = yaml
      .replace('  claude-code: { intent: preview, expected_capabilities: [skill-discovery, command-discovery, agent-discovery, hook-execution, mcp-registration, bootstrap-routing], operating_systems: [macos] }', '  claude-code: { intent: omit }')
      .replace('  copilot: { intent: preview, expected_capabilities: [skill-discovery, command-discovery, agent-discovery, hook-execution, mcp-registration, bootstrap-routing], operating_systems: [macos] }', '  copilot: { intent: omit }')
      .replace('harnesses:\n  claude-code:\n    manifest:\n      homepage: https://example.com/kitchen-sink\n', 'harnesses:\n')
      .replace('harnesses:\n', 'harnesses:\n  exclude: [claude-code, copilot]\n')
    writeFileSync(join(dir, 'moe-mint.yaml'), patched)
    const result = generate(dir)
    expect(result.adaptersRun).toEqual(['cursor', 'codex', 'kimi', 'opencode', 'pi', 'agent-plugins-1.0'])
    expect(existsSync(join(dir, '.claude-plugin/plugin.json'))).toBe(false)
  })

  it('rejects an active Copilot target when its Claude projection owner is omitted', () => {
    const dir = freshFixture()
    const yaml = readFileSync(join(dir, 'moe-mint.yaml'), 'utf8')
    writeFileSync(join(dir, 'moe-mint.yaml'), yaml
      .replace('  claude-code: { intent: preview, expected_capabilities: [skill-discovery, command-discovery, agent-discovery, hook-execution, mcp-registration, bootstrap-routing], operating_systems: [macos] }', '  claude-code: { intent: omit }')
      .replace('harnesses:\n  claude-code:\n    manifest:\n      homepage: https://example.com/kitchen-sink\n', 'harnesses:\n')
      .replace('harnesses:\n', 'harnesses:\n  exclude: [claude-code]\n'))
    try {
      generate(dir)
      throw new Error('expected missing Copilot projection owner rejection')
    } catch (error) {
      expect((error as { diagnostic?: unknown }).diagnostic).toMatchObject({
        code: 'CAPABILITY_PROJECTION_OWNER_MISSING', plugin: 'kitchen-sink', target: 'copilot', source: 'moe-mint.yaml',
      })
    }
  })

  it('snapshots the generated tree for the kitchen-sink fixture', () => {
    const dir = freshFixture()
    const result = generate(dir)
    const tree = [...result.files]
      .sort((a, b) => a.path.localeCompare(b.path))
      .map((f) => `=== ${f.path} ===\n${f.content}`)
      .join('\n')
    expect(tree).toMatchSnapshot()
  })

  it('throws a ConfigError naming both adapters when they emit the same path', () => {
    const dir = freshFixture()
    const a: HarnessAdapter = {
      name: 'adapter-a',
      emit: () => ({ files: [{ path: 'gen/collide.txt', content: 'a' }], limitations: [], emittedCapabilities: [] }),
    }
    const b: HarnessAdapter = {
      name: 'adapter-b',
      emit: () => ({ files: [{ path: 'gen/collide.txt', content: 'b' }], limitations: [], emittedCapabilities: [] }),
    }
    expect(() => generate(dir, [a, b])).toThrowError(/both emit/)
    try {
      generate(dir, [a, b])
    } catch (err) {
      expect((err as Error).message).toContain('adapter-a')
      expect((err as Error).message).toContain('adapter-b')
    }
    expect(existsSync(join(dir, MANIFEST_PATH))).toBe(false)
  })

  it('rejects unrecognized free-form adapter warnings', () => {
    const dir = freshFixture()
    const synthetic: HarnessAdapter = {
      name: 'synthetic',
      emit: () => ({
        files: [{ path: 'gen/x.txt', content: 'x' }],
        limitations: [],
        emittedCapabilities: [],
        warnings: ['thing not supported'],
      }),
    }
    try {
      generate(dir, [synthetic])
      throw new Error('expected free-form warning rejection')
    } catch (error) {
      expect((error as { diagnostic?: unknown }).diagnostic).toMatchObject({
        code: 'CAPABILITY_ADAPTER_WARNING_UNRECOGNIZED', plugin: 'kitchen-sink', target: 'synthetic', source: 'moe-mint.yaml', field: 'adapters.synthetic.warnings',
      })
    }
  })

  it('reports a contradictory typed limitation through a stable diagnostic', () => {
    const dir = freshFixture()
    const synthetic: HarnessAdapter = {
      name: 'claude-code',
      emit: () => ({
        files: [],
        limitations: [{ code: 'COMPONENT_OMITTED', component: 'skills', message: 'fixture contradiction' }],
        emittedCapabilities: ['skill-discovery', 'command-discovery', 'agent-discovery', 'hook-execution', 'mcp-registration', 'bootstrap-routing'],
      }),
    }
    try {
      generate(dir, [synthetic])
      throw new Error('expected limitation contradiction')
    } catch (error) {
      expect((error as { diagnostic?: unknown }).diagnostic).toMatchObject({
        code: 'CAPABILITY_LIMITATION_CONTRADICTION', plugin: 'kitchen-sink', target: 'claude-code', source: 'moe-mint.yaml', field: 'targets.claude-code.expected_capabilities',
      })
    }
  })

  it('reports a projection emitting independent output through a stable diagnostic', () => {
    const dir = freshFixture()
    const owner: HarnessAdapter = {
      name: 'claude-code',
      emit: () => ({
        files: [], limitations: [],
        emittedCapabilities: ['skill-discovery', 'command-discovery', 'agent-discovery', 'hook-execution', 'mcp-registration', 'bootstrap-routing'],
      }),
    }
    const projection: HarnessAdapter = {
      name: 'copilot',
      emit: () => ({ files: [{ path: 'gen/unexpected.txt', content: 'x' }], limitations: [], emittedCapabilities: [], projectionOwner: 'claude-code' }),
    }
    try {
      generate(dir, [owner, projection])
      throw new Error('expected projection owner conflict')
    } catch (error) {
      expect((error as { diagnostic?: unknown }).diagnostic).toMatchObject({
        code: 'CAPABILITY_PROJECTION_OWNER_CONFLICT', plugin: 'kitchen-sink', target: 'copilot', source: 'moe-mint.yaml', field: 'targets.copilot.projection_owner',
      })
    }
  })

  it('rejects a projection carrying package metadata through the projection-owner diagnostic', () => {
    const dir = freshFixture()
    const owner: HarnessAdapter = {
      name: 'claude-code',
      emit: () => ({
        files: [], limitations: [],
        emittedCapabilities: ['skill-discovery', 'command-discovery', 'agent-discovery', 'hook-execution', 'mcp-registration', 'bootstrap-routing'],
      }),
    }
    const projection: HarnessAdapter = {
      name: 'copilot',
      emit: () => ({
        files: [], limitations: [], emittedCapabilities: [], projectionOwner: 'claude-code',
        packageContribution: { owner: 'copilot', pi: { extensions: ['./foreign.ts'] } },
      }),
    }

    try {
      generate(dir, [owner, projection])
      expect.unreachable('projection package metadata should have been rejected')
    } catch (error) {
      expect((error as { diagnostic?: unknown }).diagnostic).toMatchObject({
        code: 'CAPABILITY_PROJECTION_OWNER_CONFLICT', plugin: 'kitchen-sink', target: 'copilot', source: 'moe-mint.yaml', field: 'targets.copilot.projection_owner',
      })
    }
  })

  it('dedupes identical-content collisions between adapters', () => {
    const dir = freshFixture()
    const file = { path: 'gen/shared.txt', content: 'same', executable: undefined }
    const a = { name: 'adapter-a', emit: () => ({ files: [{ ...file }], limitations: [], emittedCapabilities: [] }) }
    const b = { name: 'adapter-b', emit: () => ({ files: [{ ...file }], limitations: [], emittedCapabilities: [] }) }
    const result = generate(dir, [a, b])
    expect(result.files.filter((f) => f.path === 'gen/shared.txt')).toHaveLength(1)
    expect(result.warnings).toEqual([])
  })

  it('still rejects differing-content collisions', () => {
    const dir = freshFixture()
    const a = { name: 'adapter-a', emit: () => ({ files: [{ path: 'gen/x.txt', content: 'one' }], limitations: [], emittedCapabilities: [] }) }
    const b = { name: 'adapter-b', emit: () => ({ files: [{ path: 'gen/x.txt', content: 'two' }], limitations: [], emittedCapabilities: [] }) }
    expect(() => generate(dir, [a, b])).toThrowError(/both emit/)
  })

  it('rejects an adapter emitting over a source component path', () => {
    const dir = freshFixture()
    const evil = { name: 'evil', emit: () => ({ files: [{ path: 'moe-mint.yaml', content: 'gotcha' }], limitations: [], emittedCapabilities: [] }) }
    expect(() => generate(dir, [evil])).toThrowError(/would overwrite source/)
    const evil2 = { name: 'evil2', emit: () => ({ files: [{ path: 'skills/greeting/SKILL.md', content: 'x' }], limitations: [], emittedCapabilities: [] }) }
    expect(() => generate(dir, [evil2])).toThrowError(/would overwrite source/)
  })

  it('rejects adapter emission over source paths even when components have trailing slashes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mint-gen-trailing-'))
    writeFileSync(join(dir, 'moe-mint.yaml'), withV1Policy([
      'name: test-trailing',
      'version: 1.0.0',
      'description: Test with trailing slashes',
      'components:',
      '  skills: skills/',
      'bootstrap: none',
    ].join('\n')))
    mkdirSync(join(dir, 'skills'))
    writeFileSync(join(dir, 'skills', 'demo.md'), '# Demo Skill\n')
    const evilAdapter = { name: 'evil', emit: () => ({ files: [{ path: 'skills/demo.md', content: 'overwritten' }], limitations: [], emittedCapabilities: [] }) }
    expect(() => generate(dir, [evilAdapter])).toThrowError(/would overwrite source/)
  })

  it('isSourcePath: allows non-.md siblings under commands/agents but still blocks .md and any skills path', () => {
    const dir = freshFixture()
    const toml = { name: 'toml', emit: () => ({ files: [{ path: 'commands/x.toml', content: 'x' }], limitations: [], emittedCapabilities: [] }) }
    expect(() => generate(dir, [toml])).not.toThrow()

    const md = { name: 'md', emit: () => ({ files: [{ path: 'commands/x.md', content: 'x' }], limitations: [], emittedCapabilities: [] }) }
    expect(() => generate(dir, [md])).toThrowError(/would overwrite source/)

    const skillFile = { name: 'skill-file', emit: () => ({ files: [{ path: 'skills/x/whatever.txt', content: 'x' }], limitations: [], emittedCapabilities: [] }) }
    expect(() => generate(dir, [skillFile])).toThrowError(/would overwrite source/)
  })

  it('prunes files dropped from the new generation when unmodified', () => {
    const dir = freshFixture()
    const a = { name: 'a', emit: () => ({ files: [{ path: 'gen/old.txt', content: 'v1' }], limitations: [], emittedCapabilities: [] }) }
    generate(dir, [a])
    const b = { name: 'a', emit: () => ({ files: [{ path: 'gen2/new.txt', content: 'v2' }], limitations: [], emittedCapabilities: [] }) }
    const result = generate(dir, [b])
    expect(result.pruned).toEqual(['gen/old.txt'])
    expect(existsSync(join(dir, 'gen/old.txt'))).toBe(false)
    expect(existsSync(join(dir, 'gen'))).toBe(false) // empty parent removed
    expect(existsSync(join(dir, 'gen2/new.txt'))).toBe(true)
  })

  it('leaves hand-modified stale files and warns', () => {
    const dir = freshFixture()
    const a = { name: 'a', emit: () => ({ files: [{ path: 'gen/old.txt', content: 'v1' }], limitations: [], emittedCapabilities: [] }) }
    generate(dir, [a])
    writeFileSync(join(dir, 'gen/old.txt'), 'edited')
    const result = generate(dir, [{ name: 'a', emit: () => ({ files: [], limitations: [], emittedCapabilities: [] }) }])
    expect(result.pruned).toEqual([])
    expect(result.warnings.join('\n')).toMatch(/stale generated file gen\/old\.txt/)
    expect(existsSync(join(dir, 'gen/old.txt'))).toBe(true)
  })

  it('ignores manifest entries with unsafe paths and warns', () => {
    const dir = freshFixture()
    const synthetic: HarnessAdapter = {
      name: 'synthetic',
      emit: () => ({ files: [{ path: 'gen/file.txt', content: 'v1' }], limitations: [], emittedCapabilities: [] }),
    }
    generate(dir, [synthetic])

    // Hand-edit manifest to add an unsafe entry with parent-directory traversal
    const manifestPath = join(dir, MANIFEST_PATH)
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    manifest.files['../escape.txt'] = {
      sha256: '0000000000000000000000000000000000000000000000000000000000000000',
    }
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')

    // Create a file outside the plugin root
    const parentDir = dirname(dir)
    const outsideFile = join(parentDir, 'escape.txt')
    writeFileSync(outsideFile, 'should not be deleted')

    try {
      // Regenerate with empty adapter — should skip the unsafe entry and warn
      const result = generate(dir, [{ name: 'empty', emit: () => ({ files: [], limitations: [], emittedCapabilities: [] }) }])

      expect(existsSync(outsideFile)).toBe(true)
      expect(result.pruned).not.toContain('../escape.txt')
      expect(result.warnings.join('\n')).toMatch(/unsafe path.*\.\.\/escape\.txt/)
    } finally {
      rmSync(outsideFile, { force: true })
    }
  })

  it('recovers from a corrupt manifest instead of dead-ending, and rewrites it valid', () => {
    const dir = freshFixture()
    generate(dir)
    writeFileSync(join(dir, MANIFEST_PATH), 'null')

    const result = generate(dir) // content is unchanged, so no --force is needed

    expect(result.warnings.join('\n')).toMatch(/unreadable generation manifest/)
    expect(checkDrift(dir).clean).toBe(true)
    const manifest = JSON.parse(readFileSync(join(dir, MANIFEST_PATH), 'utf8'))
    expect(manifest.schema).toBe(1)
    expect(Object.keys(manifest.files).length).toBeGreaterThan(0)
  })

  it('refuses to overwrite a pre-existing hand-written file not created by moe-mint', () => {
    const dir = freshFixture()
    writeFileSync(join(dir, 'plugin.json'), 'hand-written content, not generated\n')
    expect(() => generate(dir)).toThrowError(/refusing to overwrite existing file\(s\).*plugin\.json/)
    expect(readFileSync(join(dir, 'plugin.json'), 'utf8')).toBe('hand-written content, not generated\n')
    expect(existsSync(join(dir, MANIFEST_PATH))).toBe(false)
  })

  it('leaves a pre-existing package.json untouched because adapters contribute metadata instead', () => {
    const dir = freshFixture()
    const source = JSON.stringify({ name: 'hand-written', private: true })
    writeFileSync(join(dir, 'package.json'), source)

    const result = generate(dir)

    expect(readFileSync(join(dir, 'package.json'), 'utf8')).toBe(source)
    expect(result.files.some((file) => file.path === 'package.json')).toBe(false)
    expect(result.packageContributions).toEqual([
      { owner: 'opencode', exports: { './server': './.opencode/plugins/kitchen-sink.js' } },
      {
        owner: 'pi',
        pi: {
          extensions: ['./.pi/extensions/kitchen-sink.ts'],
          skills: ['./skills'],
        },
      },
    ])
  })

  it('preserves a tracked retired package.json during upgrade while pruning other stale output', () => {
    const dir = freshFixture()
    const packageJson = '{"name":"generated-by-the-previous-mint"}\n'
    const obsoletePath = 'gen/obsolete.txt'
    const obsoleteContent = 'old generated output\n'
    writeFileSync(join(dir, 'package.json'), packageJson)
    mkdirSync(join(dir, '.moe-mint'), { recursive: true })
    mkdirSync(join(dir, 'gen'), { recursive: true })
    writeFileSync(join(dir, obsoletePath), obsoleteContent)
    writeFileSync(join(dir, MANIFEST_PATH), JSON.stringify({
      schema: 1,
      tool: 'moe-mint@previous',
      files: {
        'package.json': { sha256: sha256(packageJson) },
        [obsoletePath]: { sha256: sha256(obsoleteContent) },
      },
    }))

    const result = generate(dir)

    expect(readFileSync(join(dir, 'package.json'), 'utf8')).toBe(packageJson)
    expect(result.pruned).toEqual([obsoletePath])
    expect(existsSync(join(dir, obsoletePath))).toBe(false)
    const currentManifest = JSON.parse(readFileSync(join(dir, MANIFEST_PATH), 'utf8'))
    expect(currentManifest.files['package.json']).toBeUndefined()
  })

  it('reports a dangling symlink at a generated path as a conflict, not silently absent (CR-080)', () => {
    // existsSync (the old check) follows symlinks and reports false for a
    // dangling one, so this used to look like "nothing there" and generate
    // would write straight through it, creating the outside file.
    const dir = freshFixture()
    const outsideDir = mkdtempSync(join(tmpdir(), 'mint-outside-'))
    const outsideTarget = join(outsideDir, 'plugin.json')
    mkdirSync(join(dir, '.claude-plugin'), { recursive: true })
    symlinkSync(outsideTarget, join(dir, '.claude-plugin', 'plugin.json'))
    expect(() => generate(dir)).toThrow(/refusing to overwrite existing file\(s\).*\.claude-plugin\/plugin\.json/)
    expect(existsSync(outsideTarget)).toBe(false)
  })

  it('refuses to overwrite an existing file outside the plugin root through a symlink, even with --force (CR-080)', () => {
    const dir = freshFixture()
    const outsideDir = mkdtempSync(join(tmpdir(), 'mint-victim-'))
    const victim = join(outsideDir, 'plugin.json')
    writeFileSync(victim, 'PRECIOUS USER DATA')
    mkdirSync(join(dir, '.claude-plugin'), { recursive: true })
    symlinkSync(victim, join(dir, '.claude-plugin', 'plugin.json'))
    expect(() => generate(dir, undefined, { force: true })).toThrow(/symlink/)
    expect(readFileSync(victim, 'utf8')).toBe('PRECIOUS USER DATA')
  })

  it('overwrites a pre-existing hand-written file when force is set', () => {
    const dir = freshFixture()
    writeFileSync(join(dir, 'plugin.json'), 'hand-written content, not generated\n')
    const result = generate(dir, undefined, { force: true })
    const generatedPluginJson = result.files.find((f) => f.path === 'plugin.json')!
    expect(readFileSync(join(dir, 'plugin.json'), 'utf8')).toBe(generatedPluginJson.content)
    expect(readFileSync(join(dir, 'plugin.json'), 'utf8')).not.toBe('hand-written content, not generated\n')
    expect(existsSync(join(dir, MANIFEST_PATH))).toBe(true)
  })

  it('warns about a stray root mcp.json when the MCP source default was not customized away from .mcp.json', () => {
    const dir = freshFixture()
    rmSync(join(dir, '.mcp.json'))
    const yaml = readFileSync(join(dir, 'moe-mint.yaml'), 'utf8')
    writeFileSync(join(dir, 'moe-mint.yaml'), yaml.replaceAll('mcp-registration, ', '').replaceAll(', mcp-registration', ''))
    writeFileSync(join(dir, 'mcp.json'), JSON.stringify({ mcpServers: {} }))
    const result = generate(dir)
    expect(result.warnings).toContain(
      'found mcp.json at the plugin root; the source MCP default is .mcp.json — rename it if it is your MCP config',
    )
  })

  it('does not warn about mcp.json for the kitchen-sink fixture, where agent-plugins-1.0 legitimately emits it', () => {
    const dir = freshFixture()
    const result = generate(dir)
    expect(result.warnings.some((w) => w.includes('found mcp.json at the plugin root'))).toBe(false)
  })

  it('does not warn about a stray root mcp.json when components.mcp is explicitly set to mcp.json', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mint-gen-mcp-explicit-'))
    writeFileSync(join(dir, 'moe-mint.yaml'), withTargetCapabilities([
      'name: explicit-mcp-json',
      'version: 1.0.0',
      'description: components.mcp explicitly set to mcp.json',
      'components:',
      '  mcp: mcp.json',
      'bootstrap: none',
    ].join('\n'), { 'claude-code': ['mcp-registration'], 'agent-plugins-1.0': ['format-conformance'], copilot: ['mcp-registration'] }))
    writeFileSync(join(dir, 'mcp.json'), JSON.stringify({ mcpServers: { demo: { command: 'node' } } }))
    const result = generate(dir)
    expect(result.warnings.some((w) => w.includes('found mcp.json at the plugin root'))).toBe(false)
  })

  it('succeeds with agent-plugins-1.0 active when components.mcp collides with the spec on-disk mcp.json name, warning instead of throwing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mint-gen-mcp-collision-'))
    writeFileSync(join(dir, 'moe-mint.yaml'), withTargetCapabilities([
      'name: explicit-mcp-json',
      'version: 1.0.0',
      'description: components.mcp explicitly set to mcp.json',
      'components:',
      '  mcp: mcp.json',
      'bootstrap: none',
    ].join('\n'), { 'claude-code': ['mcp-registration'], 'agent-plugins-1.0': ['format-conformance'], copilot: ['mcp-registration'] }))
    writeFileSync(join(dir, 'mcp.json'), JSON.stringify({ mcpServers: { demo: { command: 'node' } } }))
    const result = generate(dir)
    expect(result.emissions['agent-plugins-1.0']?.limitations).toContainEqual({
      code: 'COMPONENT_OMITTED',
      component: 'mcp',
      message: 'mcp.json is occupied by the source MCP config (components.mcp); agent-plugins-1.0 mcp output skipped — rename the source to .mcp.json',
    })
    expect(result.files.some((f) => f.path === 'mcp.json')).toBe(false)
    expect(existsSync(join(dir, 'plugin.json'))).toBe(true)
  })

  it('emits hooks/moe-mint/bootstrap.md when only the in-process adapters (opencode and pi) are active in bootstrap.generate mode', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mint-gen-inprocess-bootstrap-'))
    writeFileSync(
      join(dir, 'moe-mint.yaml'),
      withTargetCapabilities('name: inprocess-demo\nversion: 1.0.0\ndescription: in-process adapters generate-mode fixture\nbootstrap: generate\n', {
        opencode: ['bootstrap-routing'], pi: ['bootstrap-routing'],
      }),
    )
    const result = generate(dir, [opencode, pi])
    expect(result.adaptersRun).toEqual(['opencode', 'pi'])
    expect(existsSync(join(dir, 'hooks/moe-mint/bootstrap.md'))).toBe(true)
    expect(readFileSync(join(dir, 'hooks/moe-mint/bootstrap.md'), 'utf8')).toContain('# inprocess-demo plugin')
  })

  it('does not refuse a pre-existing file whose content is byte-identical to what would be generated', () => {
    const referenceDir = freshFixture()
    const referenceResult = generate(referenceDir)
    const generatedPluginJsonContent = referenceResult.files.find((f) => f.path === 'plugin.json')!.content

    const dir = freshFixture()
    writeFileSync(join(dir, 'plugin.json'), generatedPluginJsonContent)
    expect(() => generate(dir)).not.toThrow()
    expect(existsSync(join(dir, MANIFEST_PATH))).toBe(true)
  })
})

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
