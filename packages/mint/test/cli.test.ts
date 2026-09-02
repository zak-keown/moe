import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, cpSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// The only test file allowed to shell out: it exercises the built dist/cli.js
// binary directly (spawnSync) to prove the process-level exit-code contract,
// which the in-process unit tests (generate.test.ts, validate.test.ts) can't
// observe since they call the exported functions instead of the CLI.
const REPO_ROOT = process.cwd()
const CLI = join(REPO_ROOT, 'dist', 'cli.js')

function tmpPluginDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'mint-cli-'))
  cpSync(join(REPO_ROOT, 'fixtures', 'kitchen-sink'), dir, { recursive: true })
  return dir
}

function runCli(args: string[], cwd: string) {
  return spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' })
}

describe('CLI end-to-end', () => {
  // dist/cli.js is built once via test/global-setup.ts (vitest globalSetup),
  // before any test file runs.
  it('generate exits 0 and reports generated harness files', () => {
    const dir = tmpPluginDir()
    const result = runCli(['generate'], dir)
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Generated')
    expect(result.stdout).toContain('harness(es)')
  })

  it('prints the ephemeral registry publish matrix as canonical JSON without writing a matrix file', () => {
    const result = runCli(['publish-matrix', '--repo', join(REPO_ROOT, '../..')], REPO_ROOT)

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(JSON.parse(result.stdout)).toEqual([
      { plugin: 'moe', package: '@bubstack/moe-core', version: '0.1.4', sourcePackagePath: 'packages/core', generatedArtifactPath: 'plugins/moe' },
      { plugin: 'moe-backstory', package: '@bubstack/moe-backstory', version: '0.1.4', sourcePackagePath: 'packages/backstory', generatedArtifactPath: 'plugins/moe-backstory' },
      { plugin: 'moe-memory', package: '@bubstack/moe-memory', version: '0.1.4', sourcePackagePath: 'packages/memory', generatedArtifactPath: 'plugins/moe-memory' },
      { plugin: 'moe-glass', package: '@bubstack/moe-glass', version: '0.1.4', sourcePackagePath: 'packages/glass', generatedArtifactPath: 'plugins/moe-glass' },
      { plugin: 'moe-crew', package: '@bubstack/moe-crew', version: '0.1.4', sourcePackagePath: 'packages/crew', generatedArtifactPath: 'plugins/moe-crew' },
      { plugin: 'moe-statusline', package: '@bubstack/moe-statusline', version: '0.1.0', sourcePackagePath: 'packages/statusline', generatedArtifactPath: 'plugins/moe-statusline' },
    ])
    for (const sourcePackage of ['core', 'backstory', 'memory', 'glass', 'crew', 'statusline']) {
      expect(existsSync(join(REPO_ROOT, '..', sourcePackage, '.claude-plugin', 'plugin.json'))).toBe(false)
    }
  })

  it('formats registry MintError failures without exposing an object or stack', () => {
    const missing = join(mkdtempSync(join(tmpdir(), 'mint-cli-missing-registry-')), 'missing')
    const result = runCli(['publish-matrix', '--repo', missing], REPO_ROOT)

    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(/^error: repository root /)
    expect(result.stderr).not.toContain('MintError:')
    expect(result.stderr).not.toContain('\n    at ')
  })

  it('does not claim to rewrite a human-authored README when the fixture has historical markers', () => {
    const dir = tmpPluginDir()
    const first = runCli(['generate'], dir)
    expect(first.status).toBe(0)
    expect(first.stdout).not.toContain('README.md install section updated')

    const second = runCli(['generate'], dir)
    expect(second.status).toBe(0)
    expect(second.stdout).not.toContain('README.md install section updated')
  })

  it('validate on a freshly generated plugin exits 0 clean', () => {
    const dir = tmpPluginDir()
    runCli(['generate'], dir)
    const result = runCli(['validate'], dir)
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('validate: clean')
  })

  it('validate exits 1 with the same config-error message as generate when moe-mint.yaml is v1 syntax (issue #10)', () => {
    const dir = tmpPluginDir()
    runCli(['generate'], dir)
    const yamlPath = join(dir, 'moe-mint.yaml')
    const yaml = readFileSync(yamlPath, 'utf8')
    writeFileSync(yamlPath, yaml.replace('bootstrap:\n  skill: using-kitchen-sink', 'bootstrap:\n  generate: true'))

    const validateResult = runCli(['validate'], dir)
    expect(validateResult.status).toBe(1)
    expect(validateResult.stderr).toContain('error:')
    expect(validateResult.stderr).toMatch(/bootstrap is now a tagged value/)

    const generateResult = runCli(['generate'], dir)
    expect(generateResult.status).toBe(1)
    expect(generateResult.stderr).toBe(validateResult.stderr)
  })

  it('prints one "pruned: <path>" line per removed file before the summary count line', () => {
    const dir = tmpPluginDir()
    runCli(['generate'], dir)
    const yamlPath = join(dir, 'moe-mint.yaml')
    const yaml = readFileSync(yamlPath, 'utf8')
    // Excluding opencode drops its four uniquely-owned files (the plugin JS,
    // the translated command/agent .md files, and the install doc); the shared
    // package.json stays because pi still emits it byte-identically.
    writeFileSync(yamlPath, yaml
      .replace('  opencode: { intent: preview, expected_capabilities: [skill-discovery, command-discovery, agent-discovery, bootstrap-routing], operating_systems: [macos] }', '  opencode: { intent: omit }')
      .replace('harnesses:\n', 'harnesses:\n  exclude: [opencode]\n'))

    const result = runCli(['generate'], dir)

    expect(result.status).toBe(0)
    const pluginJsIndex = result.stdout.indexOf('pruned: .opencode/plugins/kitchen-sink.js')
    const commandIndex = result.stdout.indexOf('pruned: .opencode/command/ks-hello.md')
    const agentIndex = result.stdout.indexOf('pruned: .opencode/agent/ks-reviewer.md')
    const installDocIndex = result.stdout.indexOf('pruned: docs/install/opencode.md')
    const countIndex = result.stdout.indexOf('Pruned 4 stale file(s)')
    expect(pluginJsIndex).toBeGreaterThanOrEqual(0)
    expect(commandIndex).toBeGreaterThanOrEqual(0)
    expect(agentIndex).toBeGreaterThanOrEqual(0)
    expect(installDocIndex).toBeGreaterThanOrEqual(0)
    expect(countIndex).toBeGreaterThan(pluginJsIndex)
    expect(countIndex).toBeGreaterThan(commandIndex)
    expect(countIndex).toBeGreaterThan(agentIndex)
    expect(countIndex).toBeGreaterThan(installDocIndex)
  })

  it('second generate run prunes nothing and validate exits 0', () => {
    const dir = tmpPluginDir()
    runCli(['generate'], dir)
    const secondRun = runCli(['generate'], dir)
    expect(secondRun.status).toBe(0)
    expect(secondRun.stdout).not.toContain('Pruned')
    const validateResult = runCli(['validate'], dir)
    expect(validateResult.status).toBe(0)
  })

  it('validate exits 3 and reports drift after the manifest is tampered with', () => {
    const dir = tmpPluginDir()
    runCli(['generate'], dir)
    writeFileSync(join(dir, '.claude-plugin', 'plugin.json'), JSON.stringify({ tampered: true }))
    const result = runCli(['validate'], dir)
    expect(result.status).toBe(3)
    expect(result.stderr).toContain('drift:')
  })

  it('generate exits 1 with a config error when moe-mint.yaml is missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mint-cli-'))
    const result = runCli(['generate'], dir)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('error:')
  })

  it('generate refuses a pre-existing hand-written file, and --force overwrites it', () => {
    const dir = tmpPluginDir()
    writeFileSync(join(dir, 'plugin.json'), 'hand-written content, not generated\n')

    const refused = runCli(['generate'], dir)
    expect(refused.status).toBe(1)
    expect(refused.stderr).toContain('refusing to overwrite')

    const forced = runCli(['generate', '--force'], dir)
    expect(forced.status).toBe(0)
    expect(forced.stdout).toContain('Generated')
  })

  it('bump <version> exits 0 and rewrites the version everywhere', () => {
    const dir = tmpPluginDir()
    runCli(['generate'], dir)
    const result = runCli(['bump', '9.9.9'], dir)
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Bumping to 9.9.9')
    expect(result.stdout).toContain('All clear')
    expect(JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version).toBe('9.9.9')
    expect(JSON.parse(readFileSync(join(dir, '.claude-plugin', 'plugin.json'), 'utf8')).version).toBe('9.9.9')
  })

  it('bump --check exits 0 clean and exits 3 on drift', () => {
    const dir = tmpPluginDir()
    runCli(['generate'], dir)

    const clean = runCli(['bump', '--check'], dir)
    expect(clean.status).toBe(0)
    expect(clean.stdout).toContain('in sync')

    writeFileSync(join(dir, '.claude-plugin', 'plugin.json'), '{"tampered": true}\n')
    const drift = runCli(['bump', '--check'], dir)
    expect(drift.status).toBe(3)
    expect(drift.stdout).toContain('DRIFT DETECTED')
  })

  it('bump --audit exits 0 and flags an undeclared version reference', () => {
    const dir = tmpPluginDir()
    runCli(['generate'], dir)
    writeFileSync(join(dir, 'notes.txt'), 'we shipped 0.1.0 today\n')
    const result = runCli(['bump', '--audit'], dir)
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('notes.txt')
  })

  it('bump rejects a non-semver version with exit 1', () => {
    const dir = tmpPluginDir()
    runCli(['generate'], dir)
    const result = runCli(['bump', 'not-a-version'], dir)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('semver')
  })

  it('bump with no version and no flag exits 1', () => {
    const dir = tmpPluginDir()
    const result = runCli(['bump'], dir)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('exactly one')
  })

  it('init → generate → validate happy path exits 0 at each step', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mint-cli-e2e-'))

    const initResult = runCli(['init'], dir)
    expect(initResult.status).toBe(0)
    expect(initResult.stdout).toContain('created: moe-mint.yaml')
    expect(initResult.stdout).toContain('created: skills/getting-started/SKILL.md')
    expect(initResult.stdout).toContain('Generated')

    const validateResult = runCli(['validate'], dir)
    expect(validateResult.status).toBe(0)
    expect(validateResult.stdout).toContain('validate: clean')
  })
})
