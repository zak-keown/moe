import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { init } from '../src/init.js'
import { ConfigError } from '../src/config.js'
import { loadConfig } from '../src/config.js'

const REPO_ROOT = process.cwd()
const CLI = join(REPO_ROOT, 'dist', 'cli.js')

function tmpDir(name: string): string {
  const base = mkdtempSync(join(tmpdir(), 'mint-init-'))
  const dir = join(base, name)
  mkdirSync(dir, { recursive: true })
  return dir
}

function runCli(args: string[], cwd: string) {
  return spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' })
}

describe('init function', () => {
  it('scaffolds a fresh plugin in a temp dir with proper sanitization', () => {
    const testDir = tmpDir('My Plugin!!')
    const result = init(testDir)

    expect(result.created).toContain('moe-mint.yaml')
    expect(result.created).toContain('skills/getting-started/SKILL.md')
    expect(result.generated).toBeGreaterThan(0)

    // Check moe-mint.yaml was created with correct name sanitization
    const configPath = join(testDir, 'moe-mint.yaml')
    expect(existsSync(configPath)).toBe(true)

    const config = loadConfig(testDir)
    expect(config.name).toBe('my-plugin')
    expect(config.version).toBe('0.1.0')
    expect(config.description).toBe('TODO describe this plugin')
    expect(config.bootstrap.kind).toBe('generate')

    // Check skill file was created
    const skillPath = join(testDir, 'skills/getting-started/SKILL.md')
    expect(existsSync(skillPath)).toBe(true)
    const skillContent = readFileSync(skillPath, 'utf8')
    expect(skillContent).toContain('name: getting-started')
    expect(skillContent).toContain('Use when getting started with this plugin')

    // Check .moe-mint/manifest.json exists (proof generate ran)
    const manifestPath = join(testDir, '.moe-mint', 'manifest.json')
    expect(existsSync(manifestPath)).toBe(true)
  })

  it('correctly sanitizes directory names with consecutive hyphens', () => {
    const testDir = tmpDir('My---Plugin!!!')
    init(testDir)

    const config = loadConfig(testDir)
    expect(config.name).toBe('my-plugin')
  })

  it('preserves names starting with digits (literal name sanitization)', () => {
    const testDir = tmpDir('3d-tools')
    init(testDir)

    const config = loadConfig(testDir)
    expect(config.name).toBe('3d-tools')
  })

  it('sanitizes special characters to hyphens, then collapses and strips them', () => {
    const testDir = tmpDir('!!!my@plugin$$$')
    init(testDir)

    const config = loadConfig(testDir)
    expect(config.name).toBe('my-plugin')
  })

  it('falls back to my-plugin when directory name is all special characters', () => {
    const testDir = tmpDir('!!!')
    init(testDir)

    const config = loadConfig(testDir)
    expect(config.name).toBe('my-plugin')
  })

  it('refuses to init when moe-mint.yaml already exists', () => {
    const testDir = tmpDir('existing')
    writeFileSync(join(testDir, 'moe-mint.yaml'), 'name: existing\nversion: 1.0.0\ndescription: test\n')

    expect(() => init(testDir)).toThrow(/already exists/)
  })

  it('re-scaffolds config only with --force, leaving pre-existing skill untouched', () => {
    const testDir = tmpDir('force-test')
    const skillPath = join(testDir, 'skills/getting-started/SKILL.md')

    // First init
    init(testDir)
    const originalContent = readFileSync(skillPath, 'utf8')

    // Modify the skill file
    const modifiedContent = originalContent + '\nExtra line added manually\n'
    writeFileSync(skillPath, modifiedContent)

    // Re-init with force
    init(testDir, { force: true })

    // Skill file should be unchanged
    const skillAfter = readFileSync(skillPath, 'utf8')
    expect(skillAfter).toBe(modifiedContent)

    // But config should be rewritten
    const config = loadConfig(testDir)
    expect(config.name).toMatch(/^[a-z0-9-]+$/)
  })

  it('does not overwrite pre-existing skill file on first init', () => {
    const testDir = tmpDir('skill-exists')
    const skillPath = join(testDir, 'skills/getting-started/SKILL.md')

    // Create the skill manually before init
    mkdirSync(join(testDir, 'skills/getting-started'), { recursive: true })
    writeFileSync(skillPath, 'Custom skill content\n')

    // Init should not overwrite it
    init(testDir)

    const skillContent = readFileSync(skillPath, 'utf8')
    expect(skillContent).toBe('Custom skill content\n')
  })

  it('reports partial scaffold on generate failure', () => {
    const testDir = tmpDir('generate-fail')
    // Pre-place a file that generate would emit (agent-plugins-1.0's root
    // plugin.json), with content that differs from what generate would write,
    // to trip the refuse-to-overwrite path inside init()'s wrapped generate().
    writeFileSync(join(testDir, 'plugin.json'), 'existing hand-written content, not generated\n')

    try {
      init(testDir)
      expect.fail('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigError)
      const message = (err as Error).message
      expect(message).toMatch(/scaffolded .* but generate failed/)
      expect(message).toMatch(/plugin\.json/)
    }

    // Verify moe-mint.yaml exists (partial scaffold survives)
    expect(existsSync(join(testDir, 'moe-mint.yaml'))).toBe(true)
  })
})

describe('CLI init command', () => {
  // dist/cli.js is built once via test/global-setup.ts (vitest globalSetup),
  // before any test file runs.
  it('exits 0 and prints created files and next steps', () => {
    const testDir = mkdtempSync(join(tmpdir(), 'mint-cli-init-'))
    const result = runCli(['init'], testDir)

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('created: moe-mint.yaml')
    expect(result.stdout).toContain('created: skills/getting-started/SKILL.md')
    expect(result.stdout).toContain('Generated')
    expect(result.stdout).toContain('Next: edit moe-mint.yaml, then re-run moe-mint generate')
  })

  it('respects --dir option', () => {
    const base = mkdtempSync(join(tmpdir(), 'mint-cli-init-dir-'))
    const testDir = join(base, 'my-plugin-dir')
    const result = runCli(['init', '--dir', testDir], base)

    if (result.status !== 0) {
      console.error('STDOUT:', result.stdout)
      console.error('STDERR:', result.stderr)
    }

    expect(result.status).toBe(0)
    expect(existsSync(join(testDir, 'moe-mint.yaml'))).toBe(true)
  })

  it('refuses with --force not specified when config exists, exits 1', () => {
    const testDir = mkdtempSync(join(tmpdir(), 'mint-cli-init-exists-'))
    writeFileSync(join(testDir, 'moe-mint.yaml'), 'name: test\nversion: 1.0.0\ndescription: test\n')

    const result = runCli(['init'], testDir)

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('already exists')
  })

  it('re-scaffolds with --force', () => {
    const testDir = mkdtempSync(join(tmpdir(), 'mint-cli-init-force-'))
    writeFileSync(join(testDir, 'moe-mint.yaml'), 'name: old-name\nversion: 1.0.0\ndescription: old\n')

    const result = runCli(['init', '--force'], testDir)

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('created: moe-mint.yaml')
  })
})
