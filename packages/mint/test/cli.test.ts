import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, cpSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { parse, stringify } from 'yaml'

// The only test file allowed to shell out: it exercises the built dist/cli.js
// binary directly (spawnSync) to prove the process-level exit-code contract,
// which the in-process unit tests (generate.test.ts, validate.test.ts) can't
// observe since they call the exported functions instead of the CLI.
const REPO_ROOT = process.cwd()
const WORKSPACE_ROOT = resolve(REPO_ROOT, '../..')
const CLI = join(REPO_ROOT, 'dist', 'cli.js')

type RecoveryState = 'unstarted' | 'backed-up' | 'committed' | 'clean'

const RECOVERY_TARGETS = [
  { kind: 'directory', current: 'plugins', next: 'plugins.next-recovery', backup: 'plugins.backup-recovery' },
  { kind: 'file', current: '.claude-plugin/marketplace.json', next: '.claude-plugin/marketplace.next-recovery.json', backup: '.claude-plugin/marketplace.backup-recovery.json' },
  { kind: 'file', current: 'docs/moe/generated/plugin-catalog.md', next: 'docs/moe/generated/plugin-catalog.next-recovery.md', backup: 'docs/moe/generated/plugin-catalog.backup-recovery.md' },
] as const

function writeGenerationPath(root: string, target: (typeof RECOVERY_TARGETS)[number], path: string, generation: 'old' | 'new'): void {
  const absolute = join(root, path)
  if (target.kind === 'directory') {
    mkdirSync(absolute, { recursive: true })
    writeFileSync(join(absolute, 'generation.txt'), `${generation}\n`)
    return
  }
  mkdirSync(dirname(absolute), { recursive: true })
  writeFileSync(absolute, `${generation}\n`)
}

function seedRecoveryFixture(states: readonly RecoveryState[], recovery?: 'old'): string {
  const root = mkdtempSync(join(tmpdir(), 'mint-root-recovery-'))
  mkdirSync(join(root, 'scripts', 'lib'), { recursive: true })
  mkdirSync(join(root, 'bin'), { recursive: true })
  cpSync(join(WORKSPACE_ROOT, 'scripts', 'clean-package-dist.mjs'), join(root, 'scripts', 'clean-package-dist.mjs'))
  cpSync(join(WORKSPACE_ROOT, 'scripts', 'mint-prepare.mjs'), join(root, 'scripts', 'mint-prepare.mjs'))
  cpSync(join(WORKSPACE_ROOT, 'scripts', 'mint-recover.mjs'), join(root, 'scripts', 'mint-recover.mjs'))
  cpSync(join(WORKSPACE_ROOT, 'scripts', 'lib', 'mint-diagnostics.mjs'), join(root, 'scripts', 'lib', 'mint-diagnostics.mjs'))
  cpSync(join(WORKSPACE_ROOT, 'scripts', 'lib', 'mint-host-contract.mjs'), join(root, 'scripts', 'lib', 'mint-host-contract.mjs'))
  cpSync(join(WORKSPACE_ROOT, 'scripts', 'lib', 'mint-generation-transaction.mjs'), join(root, 'scripts', 'lib', 'mint-generation-transaction.mjs'))
  const scripts = (JSON.parse(readFileSync(join(WORKSPACE_ROOT, 'package.json'), 'utf8')) as { scripts: Record<string, string> }).scripts
  if (scripts.mint === undefined || scripts['mint:check'] === undefined) throw new Error('root Mint scripts missing')
  writeFileSync(join(root, 'package.json'), `${JSON.stringify({
    private: true,
    type: 'module',
    scripts: { mint: scripts.mint, 'mint:check': scripts['mint:check'] },
  }, null, 2)}\n`)
  const fakeTurbo = join(root, 'bin', 'turbo')
  writeFileSync(fakeTurbo, `#!/usr/bin/env node
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
const packages = ["memory", "glass", "crew", "statusline"]
for (const packageName of packages) {
  const dist = \`packages/\${packageName}/dist\`
  for (const stale of ["stale.js.map", "stale.d.ts.map", "obsolete.js"]) {
    if (existsSync(\`\${dist}/\${stale}\`)) throw new Error(\`stale output reached Turbo: \${dist}/\${stale}\`)
  }
  mkdirSync(dist, { recursive: true })
  writeFileSync(\`\${dist}/index.js\`, "cache-restored\\n")
}
writeFileSync("turbo-ran", "yes\\n")
`)
  chmodSync(fakeTurbo, 0o755)

  for (const packageName of ['memory', 'glass', 'crew', 'statusline']) {
    const dist = join(root, 'packages', packageName, 'dist')
    mkdirSync(dist, { recursive: true })
    writeFileSync(join(dist, 'stale.js.map'), '{}\n')
    writeFileSync(join(dist, 'stale.d.ts.map'), '{}\n')
    writeFileSync(join(dist, 'obsolete.js'), 'obsolete\n')
  }

  for (const [index, target] of RECOVERY_TARGETS.entries()) {
    const state = states[index]
    if (state === undefined) throw new Error('missing recovery state')
    if (state === 'unstarted') {
      writeGenerationPath(root, target, target.current, 'old')
      writeGenerationPath(root, target, target.next, 'new')
    } else if (state === 'backed-up') {
      writeGenerationPath(root, target, target.backup, 'old')
      writeGenerationPath(root, target, target.next, 'new')
    } else if (state === 'committed') {
      writeGenerationPath(root, target, target.current, 'new')
      writeGenerationPath(root, target, target.backup, 'old')
    } else {
      writeGenerationPath(root, target, target.current, recovery === 'old' ? 'old' : 'new')
    }
  }
  writeFileSync(join(root, '.moe-mint-generation-recovery.json'), `${JSON.stringify({
    schema: 1,
    transactionId: 'recovery',
    targets: RECOVERY_TARGETS,
    ...(recovery === undefined ? {} : { recovery }),
  })}\n`)
  return root
}

function runRootMint(root: string) {
  return spawnSync('pnpm', ['--ignore-workspace', 'run', 'mint'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, PATH: `${join(root, 'bin')}:${process.env.PATH ?? ''}` },
  })
}

function runRootMintCheck(root: string) {
  return spawnSync('pnpm', ['--ignore-workspace', 'run', 'mint:check'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, PATH: `${join(root, 'bin')}:${process.env.PATH ?? ''}` },
  })
}

function sixPluginFailureFixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'mint-cli-six-'))
  for (const legal of ['LICENSE', 'LICENSE-MIT', 'NOTICE']) cpSync(join(WORKSPACE_ROOT, legal), join(root, legal))
  const registry = parse(readFileSync(join(WORKSPACE_ROOT, 'moe-platform.yaml'), 'utf8')) as Record<string, any>
  const coreConfig = parse(readFileSync(join(WORKSPACE_ROOT, 'packages/core/mint/moe.yaml'), 'utf8')) as Record<string, any>
  const corePackage = JSON.parse(readFileSync(join(WORKSPACE_ROOT, 'packages/core/package.json'), 'utf8')) as Record<string, any>
  registry.plugins = []
  registry.profiles = { fixtures: { default: true, plugins: ['fixture-1'] } }
  for (let index = 1; index <= 6; index += 1) {
    const id = `fixture-${index}`
    const source = `packages/${id}`
    const packageRoot = join(root, source)
    cpSync(join(WORKSPACE_ROOT, 'packages/core'), packageRoot, { recursive: true })
    rmSync(join(packageRoot, 'mint'), { recursive: true, force: true })
    mkdirSync(join(packageRoot, 'mint'), { recursive: true })
    const packageJson = structuredClone(corePackage)
    packageJson.name = `@example/${id}`
    if (packageJson.dependencies) {
      for (const [dep, range] of Object.entries(packageJson.dependencies as Record<string, string>)) {
        if (range.startsWith('workspace:')) delete packageJson.dependencies[dep]
      }
    }
    writeFileSync(join(packageRoot, 'package.json'), `${JSON.stringify(packageJson, null, 2)}\n`)
    const config = structuredClone(coreConfig)
    config.name = id
    config.distribution.npm = `@example/${id}`
    config.marketplace.name = id
    config.artifact.payloads = index === 6
      ? [{ from: 'missing-runtime', to: 'dist', required: true }]
      : []
    const configPath = `${source}/mint/${id}.yaml`
    writeFileSync(join(root, configPath), stringify(config))
    registry.plugins.push({ id, source, config: configPath })
  }
  writeFileSync(join(root, 'moe-platform.yaml'), stringify(registry))
  mkdirSync(join(root, 'plugins'))
  writeFileSync(join(root, 'plugins', 'canonical.bin'), Buffer.from([0x00, 0xff, 0x41, 0x0a]))
  return root
}

function tmpPluginDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'mint-cli-'))
  // Exclude the fixture's own moe-mint-vocab.yaml: none of these end-to-end
  // CLI tests exercise the vocabulary pipeline, and copying it unconditionally
  // would make every generate() call here vocab-active by accident (see
  // generate.test.ts's freshFixture for the same exclusion).
  cpSync(join(REPO_ROOT, 'fixtures', 'kitchen-sink'), dir, {
    recursive: true,
    filter: (src) => !src.endsWith('moe-mint-vocab.yaml'),
  })
  return dir
}

function runCli(args: string[], cwd: string) {
  return spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' })
}

describe('CLI end-to-end', { timeout: 45_000 }, () => {
  // dist/cli.js is built once via test/global-setup.ts (vitest globalSetup),
  // before any test file runs.
  it('generate exits 0 and reports generated harness files', () => {
    const dir = tmpPluginDir()
    const result = runCli(['generate'], dir)
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Generated')
    expect(result.stdout).toContain('harness(es)')
  })

  it.each([
    { name: 'unstarted', states: ['unstarted', 'unstarted', 'unstarted'] as const, expected: 'old' },
    { name: 'backed up', states: ['backed-up', 'backed-up', 'backed-up'] as const, expected: 'old' },
    { name: 'partly committed', states: ['committed', 'backed-up', 'unstarted'] as const, expected: 'old' },
    { name: 'fully committed', states: ['committed', 'committed', 'committed'] as const, expected: 'new' },
    { name: 'stale complete', states: ['clean', 'clean', 'clean'] as const, expected: 'new' },
    { name: 'interrupted old cleanup', states: ['clean', 'unstarted', 'unstarted'] as const, recovery: 'old' as const, expected: 'old' },
  ])('root mint recovers a $name journal, cleans runtime dist, then permits a Turbo cache restore', ({ states, recovery, expected }) => {
    const root = seedRecoveryFixture(states, recovery)

    const result = runRootMint(root)

    expect(result.status, result.stderr).toBe(0)
    expect(readFileSync(join(root, 'turbo-ran'), 'utf8')).toBe('yes\n')
    expect(existsSync(join(root, '.moe-mint-generation-recovery.json'))).toBe(false)
    for (const target of RECOVERY_TARGETS) {
      const canonical = target.kind === 'directory'
        ? join(root, target.current, 'generation.txt')
        : join(root, target.current)
      expect(readFileSync(canonical, 'utf8')).toBe(`${expected}\n`)
      expect(existsSync(join(root, target.next))).toBe(false)
      expect(existsSync(join(root, target.backup))).toBe(false)
    }
    for (const packageName of ['memory', 'glass', 'crew', 'statusline']) {
      const dist = join(root, 'packages', packageName, 'dist')
      expect(readFileSync(join(dist, 'index.js'), 'utf8')).toBe('cache-restored\n')
      expect(existsSync(join(dist, 'stale.js.map'))).toBe(false)
      expect(existsSync(join(dist, 'stale.d.ts.map'))).toBe(false)
      expect(existsSync(join(dist, 'obsolete.js'))).toBe(false)
    }
  })

  it('root mint:check stops an invalid journal before Turbo without labeling it projection drift', () => {
    const root = seedRecoveryFixture(['unstarted', 'unstarted', 'unstarted'])
    writeFileSync(join(root, '.moe-mint-generation-recovery.json'), '{not json\n')

    const result = runRootMintCheck(root)

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Mint preparation failed')
    expect(result.stderr).toContain('code: GENERATION_TRANSACTION_UNRECOVERABLE')
    expect(result.stderr).toContain('paths: .moe-mint-generation-recovery.json')
    expect(result.stderr).toContain('action: preserve the journal and outputs')
    expect(result.stdout).not.toContain('Generated plugin projections are not reproducible')
    expect(existsSync(join(root, 'turbo-ran'))).toBe(false)
    for (const packageName of ['memory', 'glass', 'crew', 'statusline']) {
      expect(existsSync(join(root, 'packages', packageName, 'dist', 'stale.js.map'))).toBe(true)
      expect(existsSync(join(root, 'packages', packageName, 'dist', 'stale.d.ts.map'))).toBe(true)
      expect(existsSync(join(root, 'packages', packageName, 'dist', 'obsolete.js'))).toBe(true)
    }
  })

  it('assemble fails at plugin six without changing one byte of the canonical plugin tree', () => {
    const root = sixPluginFailureFixture()
    const canonical = readFileSync(join(root, 'plugins', 'canonical.bin'))

    const result = runCli([
      'assemble',
      '--repo', root,
      '--destination', join(root, 'plugins.next-sixfailure'),
    ], REPO_ROOT)

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('missing-runtime')
    expect(readFileSync(join(root, 'plugins', 'canonical.bin'))).toEqual(canonical)
    expect(existsSync(join(root, 'plugins.next-sixfailure'))).toBe(false)
  }, 45_000)

  it('ships every core hook executable referenced by the canonical Claude hook manifest', () => {
    const pluginRoot = join(WORKSPACE_ROOT, 'plugins', 'moe')
    const hookManifest = readFileSync(join(pluginRoot, 'hooks', 'hooks.json'), 'utf8')
    const referenced = [...hookManifest.matchAll(/\$\{CLAUDE_PLUGIN_ROOT\}\/([^\\" ]+)/g)]
      .map((match) => match[1])

    expect(referenced).not.toEqual([])
    for (const path of referenced) {
      const absolute = join(pluginRoot, path as string)
      expect(existsSync(absolute)).toBe(true)
      expect(statSync(absolute).mode & 0o111).not.toBe(0)
    }
    expect(readdirSync(join(pluginRoot, 'hooks')).sort()).toEqual([
      'claude-judge-continuation',
      'developing-for-moe-notice',
      'governance-marker-check',
      'hooks.json',
      'jig-review-format-guard',
      'jig-worktree-guard',
      'moe-completion-evidence',
      'moe-mint',
      'plan-set',
      'plan-set-notice',
      'run-hook.cmd',
      'task-set',
    ])
  })

  it('prints the ephemeral registry publish matrix as canonical JSON without writing a matrix file', () => {
    const result = runCli(['publish-matrix', '--repo', join(REPO_ROOT, '../..')], REPO_ROOT)

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(JSON.parse(result.stdout)).toEqual([
      { plugin: 'moe', package: '@bubstack/moe-core', version: '0.1.6', sourcePackagePath: 'packages/core', generatedArtifactPath: 'plugins/moe' },
      { plugin: 'moe-backstory', package: '@bubstack/moe-backstory', version: '0.1.6', sourcePackagePath: 'packages/backstory', generatedArtifactPath: 'plugins/moe-backstory' },
      { plugin: 'moe-memory', package: '@bubstack/moe-memory', version: '0.2.0', sourcePackagePath: 'packages/memory', generatedArtifactPath: 'plugins/moe-memory' },
      { plugin: 'moe-glass', package: '@bubstack/moe-glass', version: '0.1.6', sourcePackagePath: 'packages/glass', generatedArtifactPath: 'plugins/moe-glass' },
      { plugin: 'moe-crew', package: '@bubstack/moe-crew', version: '0.1.6', sourcePackagePath: 'packages/crew', generatedArtifactPath: 'plugins/moe-crew' },
      { plugin: 'moe-statusline', package: '@bubstack/moe-statusline', version: '0.1.2', sourcePackagePath: 'packages/statusline', generatedArtifactPath: 'plugins/moe-statusline' },
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
    // Excluding opencode drops its uniquely-owned adapter files and complete
    // rendered skill tree. Every removed path must be itemized before an
    // exact summary count so users can audit the destructive change.
    writeFileSync(yamlPath, yaml
      .replace('  opencode: { intent: preview, expected_capabilities: [skill-discovery, command-discovery, agent-discovery, bootstrap-routing], operating_systems: [macos] }', '  opencode: { intent: omit }')
      .replace('harnesses:\n', 'harnesses:\n  exclude: [opencode]\n'))

    const result = runCli(['generate'], dir)

    expect(result.status).toBe(0)
    const pluginJsIndex = result.stdout.indexOf('pruned: .opencode/plugins/kitchen-sink.js')
    const commandIndex = result.stdout.indexOf('pruned: .opencode/command/ks-hello.md')
    const agentIndex = result.stdout.indexOf('pruned: .opencode/agent/ks-reviewer.md')
    const skillIndex = result.stdout.indexOf('pruned: .opencode/skills/greeting/SKILL.md')
    const installDocIndex = result.stdout.indexOf('pruned: docs/install/opencode.md')
    const pruneLines = result.stdout.split('\n').filter((line) => line.startsWith('pruned: '))
    const summary = result.stdout.match(/Pruned (\d+) stale file\(s\)/)
    expect(summary).not.toBeNull()
    expect(Number(summary?.[1])).toBe(pruneLines.length)
    const countIndex = summary?.index ?? -1
    expect(pluginJsIndex).toBeGreaterThanOrEqual(0)
    expect(commandIndex).toBeGreaterThanOrEqual(0)
    expect(agentIndex).toBeGreaterThanOrEqual(0)
    expect(skillIndex).toBeGreaterThanOrEqual(0)
    expect(installDocIndex).toBeGreaterThanOrEqual(0)
    expect(countIndex).toBeGreaterThan(pluginJsIndex)
    expect(countIndex).toBeGreaterThan(commandIndex)
    expect(countIndex).toBeGreaterThan(agentIndex)
    expect(countIndex).toBeGreaterThan(skillIndex)
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

  it('bump <version> exits 0 without synthesizing a root package.json', () => {
    const dir = tmpPluginDir()
    runCli(['generate'], dir)
    const result = runCli(['bump', '9.9.9'], dir)
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Bumping to 9.9.9')
    expect(result.stdout).toContain('All clear')
    expect(existsSync(join(dir, 'package.json'))).toBe(false)
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

  it('release certify-claude exits 0 in plan mode with candidate tag', () => {
    const result = runCli(['release', 'certify-claude', '--candidate', 'v0.1.5-rc.1', '--repo', '.'], REPO_ROOT)
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('certify-claude')
    expect(result.stdout).toContain('v0.1.5-rc.1')
  })

  it('release candidate exits 0 in plan mode', () => {
    const result = runCli(['release', 'candidate', '--tag', 'v0.1.5-rc.1', '--repo', '.'], REPO_ROOT)
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('candidate')
    expect(result.stdout).toContain('v0.1.5-rc.1')
  })

  it('release preflight exits 0 with tag', () => {
    const result = runCli(['release', 'preflight', '--tag', 'v0.1.5-rc.1', '--repo', '.'], REPO_ROOT)
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('preflight')
  })

  it('release verify exits 0 with catalog tag', () => {
    const result = runCli(['release', 'verify', '--catalog-tag', 'v0.1.5', '--repo', '.'], REPO_ROOT)
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('verify')
  })

  it('release promote exits 0 in plan mode with stable tag', () => {
    const result = runCli(['release', 'promote', '--tag', 'v0.1.5', '--repo', '.'], REPO_ROOT)
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('promote')
    expect(result.stdout).toContain('v0.1.5')
  })

  it('release certify-claude exits 1 when --execute is missing producer identity', () => {
    const result = runCli(['release', 'certify-claude', '--candidate', 'v0.1.5-rc.1', '--repo', '.', '--execute'], REPO_ROOT)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('error:')
  })

  it('release candidate --execute exits 1 instead of falsely claiming success', () => {
    const result = runCli(['release', 'candidate', '--tag', 'v0.1.5-rc.1', '--repo', '.', '--execute'], REPO_ROOT)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('error:')
    expect(result.stdout).not.toContain('preparing candidate')
  })

  it('release promote --execute exits 1 instead of falsely claiming success', () => {
    const result = runCli(['release', 'promote', '--tag', 'v0.1.5', '--repo', '.', '--execute'], REPO_ROOT)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('error:')
    expect(result.stdout).not.toContain('promoting')
  })

  it('release certify-claude --execute exits 1 instead of falsely claiming success, even with complete producer identity', () => {
    const result = runCli([
      'release', 'certify-claude',
      '--candidate', 'v0.1.5-rc.1',
      '--repo', '.',
      '--execute',
      '--producer-repository', 'bubstack/moe',
      '--producer-workflow', 'certify.yml',
      '--producer-workflow-sha', 'a'.repeat(40),
      '--producer-run-id', '123',
      '--producer-job-id', '456',
      '--producer-trigger-actor', 'zak',
      '--producer-runner-image', 'ubuntu-24.04',
      '--producer-deployment-id', '789',
      '--producer-approval-actor', 'zak',
      '--producer-approved-at', '2026-09-03T00:00:00Z',
    ], REPO_ROOT)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('error:')
    expect(result.stdout).not.toContain('certifying candidate')
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
