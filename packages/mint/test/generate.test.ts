import { describe, it, expect } from 'vitest'
import {
  chmodSync,
  cpSync,
  mkdtempSync,
  mkdirSync,
  existsSync,
  readFileSync,
  statSync,
  writeFileSync,
  rmSync,
  symlinkSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { generate } from '../src/generate.js'
import { MANIFEST_PATH, checkDrift } from '../src/manifest.js'
import type { HarnessAdapter } from '../src/adapters/index.js'
import type { FileSet } from '../src/fileset.js'
import { opencode } from '../src/adapters/opencode.js'
import { pi } from '../src/adapters/pi.js'

const fullSupport = {
  skills: 'full',
  commands: 'full',
  agents: 'full',
  hooks: 'full',
  mcp: 'full',
  bootstrap: 'full',
  rules: 'none',
  variables: 'none',
} as const

const defaultTestSkillLayout = {
  outputDir: '.test-adapter/skills',
  profile: 'test-adapter',
  mode: 'rendered',
} as const

function testAdapter(
  name: string,
  files: FileSet,
  outputDir = `.test-${name}/skills`,
): HarnessAdapter {
  return {
    name,
    support: fullSupport,
    skillLayout: { outputDir, profile: name, mode: 'rendered' },
    emit: () => ({ files, warnings: [] }),
  }
}

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

describe('generate', () => {
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

  it('injects the install matrix into README.md between the markers, reports readmeInjected, and leaves validate clean since README.md is not manifest-tracked', () => {
    const dir = freshFixture()
    const result = generate(dir)

    expect(result.readmeInjected).toBe(true)
    const readme = readFileSync(join(dir, 'README.md'), 'utf8')
    expect(readme).toContain('<!-- moe-mint:install:start -->')
    expect(readme).toContain('<!-- moe-mint:install:end -->')
    expect(readme).toContain('| Harness | Install |')
    expect(readme).toContain('| Claude Code | see docs/install/claude-code.md |')
    expect(readme).not.toContain('(install instructions go here)')

    const manifest = JSON.parse(readFileSync(join(dir, MANIFEST_PATH), 'utf8'))
    expect(manifest.files['README.md']).toBeUndefined()
    expect(checkDrift(dir).clean).toBe(true)
  })

  it('re-injecting the README on a second generate is idempotent (no change, readmeInjected false)', () => {
    const dir = freshFixture()
    generate(dir)
    const afterFirst = readFileSync(join(dir, 'README.md'), 'utf8')

    const second = generate(dir)

    expect(second.readmeInjected).toBe(false)
    expect(readFileSync(join(dir, 'README.md'), 'utf8')).toBe(afterFirst)
    expect(checkDrift(dir).clean).toBe(true)
  })

  it('prunes docs/install/<name>.md when its adapter is later excluded, like any other generated file', () => {
    const dir = freshFixture()
    generate(dir)
    expect(existsSync(join(dir, 'docs/install/claude-code.md'))).toBe(true)

    const yaml = readFileSync(join(dir, 'moe-mint.yaml'), 'utf8')
    writeFileSync(join(dir, 'moe-mint.yaml'), yaml.replace('harnesses:\n', 'harnesses:\n  exclude: [claude-code]\n'))
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
    const patched = yaml.replace('harnesses:\n', 'harnesses:\n  exclude: [claude-code]\n')
    writeFileSync(join(dir, 'moe-mint.yaml'), patched)
    const result = generate(dir)
    expect(result.adaptersRun).toEqual(['cursor', 'codex', 'kimi', 'opencode', 'pi', 'agent-plugins-1.0', 'copilot'])
    expect(existsSync(join(dir, '.claude-plugin/plugin.json'))).toBe(false)
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
      support: fullSupport,
      skillLayout: defaultTestSkillLayout,
      emit: () => ({ files: [{ path: 'gen/collide.txt', content: 'a' }], warnings: [] }),
    }
    const b: HarnessAdapter = {
      name: 'adapter-b',
      support: fullSupport,
      skillLayout: defaultTestSkillLayout,
      emit: () => ({ files: [{ path: 'gen/collide.txt', content: 'b' }], warnings: [] }),
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

  it('prefixes warnings with the adapter name', () => {
    const dir = freshFixture()
    const synthetic: HarnessAdapter = {
      name: 'synthetic',
      support: fullSupport,
      skillLayout: defaultTestSkillLayout,
      emit: () => ({
        files: [{ path: 'gen/x.txt', content: 'x' }],
        warnings: ['thing not supported'],
      }),
    }
    const result = generate(dir, [synthetic])
    expect(result.warnings).toEqual(['[synthetic] thing not supported'])
  })

  it('dedupes identical-content collisions between adapters', () => {
    const dir = freshFixture()
    const file = { path: 'gen/shared.txt', content: 'same', executable: undefined }
    const a = { name: 'adapter-a', support: fullSupport, skillLayout: defaultTestSkillLayout, emit: () => ({ files: [{ ...file }], warnings: [] }) }
    const b = { name: 'adapter-b', support: fullSupport, skillLayout: defaultTestSkillLayout, emit: () => ({ files: [{ ...file }], warnings: [] }) }
    const result = generate(dir, [a, b])
    expect(result.files.filter((f) => f.path === 'gen/shared.txt')).toHaveLength(1)
    expect(result.warnings).toEqual([])
  })

  it('still rejects differing-content collisions', () => {
    const dir = freshFixture()
    const a = { name: 'adapter-a', support: fullSupport, skillLayout: defaultTestSkillLayout, emit: () => ({ files: [{ path: 'gen/x.txt', content: 'one' }], warnings: [] }) }
    const b = { name: 'adapter-b', support: fullSupport, skillLayout: defaultTestSkillLayout, emit: () => ({ files: [{ path: 'gen/x.txt', content: 'two' }], warnings: [] }) }
    expect(() => generate(dir, [a, b])).toThrowError(/both emit/)
  })

  it('rejects an adapter emitting over a source component path', () => {
    const dir = freshFixture()
    const evil = { name: 'evil', support: fullSupport, skillLayout: defaultTestSkillLayout, emit: () => ({ files: [{ path: 'moe-mint.yaml', content: 'gotcha' }], warnings: [] }) }
    expect(() => generate(dir, [evil])).toThrowError(/would overwrite source/)
    const evil2 = { name: 'evil2', support: fullSupport, skillLayout: defaultTestSkillLayout, emit: () => ({ files: [{ path: 'skills/greeting/SKILL.md', content: 'x' }], warnings: [] }) }
    expect(() => generate(dir, [evil2])).toThrowError(/would overwrite source/)
  })

  it('rejects adapter emission over source paths even when components have trailing slashes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mint-gen-trailing-'))
    writeFileSync(join(dir, 'moe-mint.yaml'), [
      'name: test-trailing',
      'version: 1.0.0',
      'description: Test with trailing slashes',
      'components:',
      '  skills: skills/',
      'bootstrap: none',
    ].join('\n'))
    mkdirSync(join(dir, 'skills'))
    writeFileSync(join(dir, 'skills', 'demo.md'), '# Demo Skill\n')
    const evilAdapter = { name: 'evil', support: fullSupport, skillLayout: defaultTestSkillLayout, emit: () => ({ files: [{ path: 'skills/demo.md', content: 'overwritten' }], warnings: [] }) }
    expect(() => generate(dir, [evilAdapter])).toThrowError(/would overwrite source/)
  })

  it('isSourcePath: allows non-.md siblings under commands/agents but still blocks .md and any skills path', () => {
    const dir = freshFixture()
    const toml = { name: 'toml', support: fullSupport, skillLayout: defaultTestSkillLayout, emit: () => ({ files: [{ path: 'commands/x.toml', content: 'x' }], warnings: [] }) }
    expect(() => generate(dir, [toml])).not.toThrow()

    const md = { name: 'md', support: fullSupport, skillLayout: defaultTestSkillLayout, emit: () => ({ files: [{ path: 'commands/x.md', content: 'x' }], warnings: [] }) }
    expect(() => generate(dir, [md])).toThrowError(/would overwrite source/)

    const skillFile = { name: 'skill-file', support: fullSupport, skillLayout: defaultTestSkillLayout, emit: () => ({ files: [{ path: 'skills/x/whatever.txt', content: 'x' }], warnings: [] }) }
    expect(() => generate(dir, [skillFile])).toThrowError(/would overwrite source/)
  })

  it('prunes files dropped from the new generation when unmodified', () => {
    const dir = freshFixture()
    const a = { name: 'a', support: fullSupport, skillLayout: defaultTestSkillLayout, emit: () => ({ files: [{ path: 'gen/old.txt', content: 'v1' }], warnings: [] }) }
    generate(dir, [a])
    const b = { name: 'a', support: fullSupport, skillLayout: defaultTestSkillLayout, emit: () => ({ files: [{ path: 'gen2/new.txt', content: 'v2' }], warnings: [] }) }
    const result = generate(dir, [b])
    expect(result.pruned).toEqual(['gen/old.txt'])
    expect(existsSync(join(dir, 'gen/old.txt'))).toBe(false)
    expect(existsSync(join(dir, 'gen'))).toBe(false) // empty parent removed
    expect(existsSync(join(dir, 'gen2/new.txt'))).toBe(true)
  })

  it('leaves hand-modified stale files and warns', () => {
    const dir = freshFixture()
    const a = { name: 'a', support: fullSupport, skillLayout: defaultTestSkillLayout, emit: () => ({ files: [{ path: 'gen/old.txt', content: 'v1' }], warnings: [] }) }
    generate(dir, [a])
    writeFileSync(join(dir, 'gen/old.txt'), 'edited')
    const result = generate(dir, [{ name: 'a', support: fullSupport, skillLayout: defaultTestSkillLayout, emit: () => ({ files: [], warnings: [] }) }])
    expect(result.pruned).toEqual([])
    expect(result.warnings.join('\n')).toMatch(/stale generated file gen\/old\.txt/)
    expect(existsSync(join(dir, 'gen/old.txt'))).toBe(true)
  })

  it('ignores manifest entries with unsafe paths and warns', () => {
    const dir = freshFixture()
    const synthetic: HarnessAdapter = {
      name: 'synthetic',
      support: fullSupport,
      skillLayout: defaultTestSkillLayout,
      emit: () => ({ files: [{ path: 'gen/file.txt', content: 'v1' }], warnings: [] }),
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
      const result = generate(dir, [{ name: 'empty', support: fullSupport, skillLayout: defaultTestSkillLayout, emit: () => ({ files: [], warnings: [] }) }])

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

  it('appends an actionable note when the refused-overwrite list includes a pre-existing package.json', () => {
    const dir = freshFixture()
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'hand-written', private: true }))
    expect(() => generate(dir)).toThrowError(/REPLACE your package\.json/)
    try {
      generate(dir)
    } catch (err) {
      expect((err as Error).message).toContain('package.json merging is not yet supported')
      expect((err as Error).message).toContain('harnesses.exclude')
    }
    expect(existsSync(join(dir, MANIFEST_PATH))).toBe(false)
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
    writeFileSync(join(dir, 'moe-mint.yaml'), [
      'name: explicit-mcp-json',
      'version: 1.0.0',
      'description: components.mcp explicitly set to mcp.json',
      'components:',
      '  mcp: mcp.json',
      'bootstrap: none',
    ].join('\n'))
    writeFileSync(join(dir, 'mcp.json'), JSON.stringify({ mcpServers: { demo: { command: 'node' } } }))
    const result = generate(dir)
    expect(result.warnings.some((w) => w.includes('found mcp.json at the plugin root'))).toBe(false)
  })

  it('succeeds with agent-plugins-1.0 active when components.mcp collides with the spec on-disk mcp.json name, warning instead of throwing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mint-gen-mcp-collision-'))
    writeFileSync(join(dir, 'moe-mint.yaml'), [
      'name: explicit-mcp-json',
      'version: 1.0.0',
      'description: components.mcp explicitly set to mcp.json',
      'components:',
      '  mcp: mcp.json',
      'bootstrap: none',
    ].join('\n'))
    writeFileSync(join(dir, 'mcp.json'), JSON.stringify({ mcpServers: { demo: { command: 'node' } } }))
    const result = generate(dir)
    expect(result.warnings).toContain(
      '[agent-plugins-1.0] mcp.json is occupied by the source MCP config (components.mcp); agent-plugins-1.0 mcp output skipped — rename the source to .mcp.json',
    )
    expect(result.files.some((f) => f.path === 'mcp.json')).toBe(false)
    expect(existsSync(join(dir, 'plugin.json'))).toBe(true)
  })

  it('emits hooks/moe-mint/bootstrap.md when only the in-process adapters (opencode and pi) are active in bootstrap.generate mode', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mint-gen-inprocess-bootstrap-'))
    writeFileSync(
      join(dir, 'moe-mint.yaml'),
      'name: inprocess-demo\nversion: 1.0.0\ndescription: in-process adapters generate-mode fixture\nbootstrap: generate\n',
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
    const sourceSkill = readFileSync(join(dir, 'skills/greeting/SKILL.md'))
    const codexSkill = result.files.find(
      (f) => f.path === '.codex-plugin/skills/greeting/SKILL.md',
    )
    expect(codexSkill).toBeDefined()
    expect(Buffer.from(codexSkill!.content)).toEqual(sourceSkill)
  })

  it('emits complete per-adapter skill directories when vocab file is absent', () => {
    const dir = freshFixture()
    const result = generate(dir)
    expect(result.files.some((f) => f.path.startsWith('.codex-plugin/skills/'))).toBe(true)
  })

  it('adapter manifests reference their own skill directories when vocab is active', () => {
    const dir = freshFixture()
    writeFileSync(join(dir, 'moe-mint-vocab.yaml'), 'tokens: {}\nblocks: {}')
    const result = generate(dir)
    const codexManifest = JSON.parse(
      String(result.files.find((f) => f.path === '.codex-plugin/plugin.json')!.content),
    )
    expect(codexManifest.skills).toBe('./.codex-plugin/skills/')
  })

  it('is idempotent with vocabulary active', () => {
    const dir = freshFixture()
    const skillPath = join(dir, 'skills/greeting/SKILL.md')
    writeFileSync(skillPath, `${readFileSync(skillPath, 'utf8')}\nUse {ask}.\n`)
    writeFileSync(
      join(dir, 'moe-mint-vocab.yaml'),
      [
        'tokens:',
        '  ask:',
        '    claude-code: CLAUDE',
        '    agent-plugins-1.0: AGENT_PLUGINS',
        '    cursor: CURSOR',
        '    codex: CODEX',
        '    kimi: KIMI',
        '    opencode: OPENCODE',
        '    pi: PI',
        'blocks: {}',
      ].join('\n'),
    )

    const first = generate(dir)
    const firstRootSkill = readFileSync(skillPath)
    const firstManifest = readFileSync(join(dir, MANIFEST_PATH))
    const firstTree = first.files.map((file) => ({
      path: file.path,
      content: Buffer.from(file.content),
      executable: Boolean(file.executable),
    }))
    expect(firstRootSkill.toString()).toContain('AGENT_PLUGINS')
    expect(Buffer.from(first.files.find(
      (file) => file.path === '.codex-plugin/skills/greeting/SKILL.md',
    )!.content).toString()).toContain('CODEX')
    expect(Buffer.from(first.files.find(
      (file) => file.path === '.cursor-plugin/skills/greeting/SKILL.md',
    )!.content).toString()).toContain('CURSOR')

    const second = generate(dir)

    expect(second.files.map((file) => ({
      path: file.path,
      content: Buffer.from(file.content),
      executable: Boolean(file.executable),
    }))).toEqual(firstTree)
    expect(readFileSync(skillPath)).toEqual(firstRootSkill)
    expect(readFileSync(join(dir, MANIFEST_PATH))).toEqual(firstManifest)
    expect(checkDrift(dir).clean).toBe(true)
  })
})

describe('binary-safe full-tree generation', () => {
  it('writes binary skill assets byte-for-byte and preserves exact permission modes', () => {
    const dir = freshFixture()
    mkdirSync(join(dir, 'skills/greeting/assets'), { recursive: true })
    mkdirSync(join(dir, 'skills/greeting/scripts'), { recursive: true })
    const binary = Buffer.from([0x00, 0xff, 0x81, 0x0a])
    writeFileSync(join(dir, 'skills/greeting/assets/logo.bin'), binary)
    writeFileSync(join(dir, 'skills/greeting/scripts/run.sh'), '#!/bin/sh\nexit 0\n')
    chmodSync(join(dir, 'skills/greeting/assets/logo.bin'), 0o640)
    chmodSync(join(dir, 'skills/greeting/scripts/run.sh'), 0o700)
    const adapter = testAdapter('binary', [], '.binary/skills')

    generate(dir, [adapter])

    expect(readFileSync(join(dir, '.binary/skills/greeting/assets/logo.bin'))).toEqual(binary)
    expect(statSync(join(dir, '.binary/skills/greeting/assets/logo.bin')).mode & 0o777).toBe(0o640)
    expect(statSync(join(dir, '.binary/skills/greeting/scripts/run.sh')).mode & 0o777).toBe(0o700)
  })

  it('deduplicates equal byte content and rejects byte-different collisions', () => {
    const equalDir = freshFixture()
    const source = readFileSync(join(equalDir, 'skills/greeting/SKILL.md'), 'utf8')
    const equal = testAdapter('equal', [
      { path: '.test-equal/skills/greeting/SKILL.md', content: source },
    ])
    expect(generate(equalDir, [equal]).files.filter(
      (file) => file.path === '.test-equal/skills/greeting/SKILL.md',
    )).toHaveLength(1)

    const differentDir = freshFixture()
    const different = testAdapter('different', [
      { path: '.test-different/skills/greeting/SKILL.md', content: 'different bytes' },
    ])
    expect(() => generate(differentDir, [different])).toThrow(
      /both emit \.test-different\/skills\/greeting\/SKILL\.md/,
    )
  })

  it('produces the same ordered bytes and manifest on repeated generation', () => {
    const dir = freshFixture()
    const adapter = testAdapter('repeatable', [], '.repeatable/skills')
    const first = generate(dir, [adapter])
    const firstManifest = readFileSync(join(dir, MANIFEST_PATH))
    const firstTree = first.files.map((file) => ({
      path: file.path,
      content: Buffer.from(file.content),
      executable: Boolean(file.executable),
    }))

    const second = generate(dir, [adapter])

    expect(second.files.map((file) => ({
      path: file.path,
      content: Buffer.from(file.content),
      executable: Boolean(file.executable),
    }))).toEqual(firstTree)
    expect(readFileSync(join(dir, MANIFEST_PATH))).toEqual(firstManifest)
  })

  it('prunes an unmodified stale binary file but preserves a modified one', () => {
    const pristineDir = freshFixture()
    mkdirSync(join(pristineDir, 'skills/greeting/assets'), { recursive: true })
    writeFileSync(join(pristineDir, 'skills/greeting/assets/old.bin'), Buffer.from([0x00, 0xff, 0x80]))
    generate(pristineDir, [testAdapter('binary', [], '.old/skills')])
    const pristineResult = generate(pristineDir, [testAdapter('binary', [], '.new/skills')])
    expect(pristineResult.pruned).toContain('.old/skills/greeting/assets/old.bin')
    expect(existsSync(join(pristineDir, '.old/skills/greeting/assets/old.bin'))).toBe(false)

    const modifiedDir = freshFixture()
    mkdirSync(join(modifiedDir, 'skills/greeting/assets'), { recursive: true })
    writeFileSync(join(modifiedDir, 'skills/greeting/assets/old.bin'), Buffer.from([0x00, 0xff, 0x80]))
    generate(modifiedDir, [testAdapter('binary', [], '.old/skills')])
    writeFileSync(
      join(modifiedDir, '.old/skills/greeting/assets/old.bin'),
      Buffer.from([0x00, 0xff, 0x81]),
    )
    const modifiedResult = generate(modifiedDir, [testAdapter('binary', [], '.new/skills')])
    expect(modifiedResult.pruned).not.toContain('.old/skills/greeting/assets/old.bin')
    expect(modifiedResult.warnings.join('\n')).toMatch(
      /stale generated file \.old\/skills\/greeting\/assets\/old\.bin/,
    )
    expect(readFileSync(join(modifiedDir, '.old/skills/greeting/assets/old.bin'))).toEqual(
      Buffer.from([0x00, 0xff, 0x81]),
    )
  })
})
