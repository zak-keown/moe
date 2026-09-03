import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import type { AdapterPackageContribution } from '../src/adapters/types.js'
import type { MintConfig } from '../src/config.js'
import { composePackageManifest } from '../src/package-manifest.js'

const fixtureRoot = fileURLToPath(new URL('./fixtures/package-consumer/', import.meta.url))
const artifactFixture = join(fixtureRoot, 'artifact')

const config = {
  source: 'packages/package-consumer/mint/package-consumer.yaml',
  name: 'package-consumer',
  version: '1.0.0',
  description: 'Offline package loader fixture',
  bootstrap: { kind: 'none' },
  components: { skills: 'skills', commands: 'commands', agents: 'agents', hooks: 'hooks/hooks.json', mcp: '.mcp.json' },
  harnesses: { exclude: [], settings: {} },
  distribution: { npm: '@bubstack/package-consumer' },
  artifact: { payloads: [] },
  targets: {} as MintConfig['targets'],
  importedWorks: [],
} satisfies MintConfig

const artifactPaths = new Set([
  '.pi/extensions/package-consumer.ts',
  'dist/cli.js',
  'dist/index.d.ts',
  'dist/index.js',
  'dist/server.js',
  'skills/demo/SKILL.md',
])

const contributions = [
  { owner: 'opencode', exports: { './server': './dist/server.js' } },
  { owner: 'pi', pi: { extensions: ['./.pi/extensions/package-consumer.ts'], skills: ['./skills'] } },
] satisfies readonly AdapterPackageContribution[]

describe('composed package loader contract', () => {
  it('resolves the root and pinned OpenCode server subpath beside bins and Pi metadata', () => {
    const manifest = composePackageManifest({
      source: {
        name: '@bubstack/package-consumer',
        version: '1.0.0',
        description: 'Offline package loader fixture',
        type: 'module',
        main: './dist/index.js',
        types: './dist/index.d.ts',
        bin: { 'package-consumer': './dist/cli.js' },
      },
      config,
      contributions,
      artifactPaths,
      registryUrl: 'https://registry.npmjs.org',
      releaseVersions: {},
    })
    const consumerRoot = mkdtempSync(join(tmpdir(), 'mint-package-consumer-'))
    const packageRoot = join(consumerRoot, 'node_modules', '@bubstack', 'package-consumer')
    cpSync(artifactFixture, packageRoot, { recursive: true })
    cpSync(join(fixtureRoot, 'consumer.mjs'), join(consumerRoot, 'consumer.mjs'))
    writeFileSync(join(packageRoot, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)

    const loaded = spawnSync(process.execPath, ['consumer.mjs'], { cwd: consumerRoot, encoding: 'utf8' })
    expect({ status: loaded.status, stderr: loaded.stderr, stdout: loaded.stdout }).toEqual({
      status: 0,
      stderr: '',
      stdout: '{"root":"root-entry","server":"server-entry"}',
    })
    const cli = spawnSync(process.execPath, [join(packageRoot, 'dist', 'cli.js')], { encoding: 'utf8' })
    expect({ status: cli.status, stderr: cli.stderr, stdout: cli.stdout }).toEqual({
      status: 0,
      stderr: '',
      stdout: 'cli-entry',
    })

    const packageJson = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as Record<string, unknown>
    expect(packageJson).toMatchObject({
      bin: { 'package-consumer': './dist/cli.js' },
      pi: { extensions: ['./.pi/extensions/package-consumer.ts'], skills: ['./skills'] },
    })
    expect(existsSync(join(packageRoot, 'dist', 'cli.js'))).toBe(true)
    for (const path of (packageJson.pi as { extensions: string[] }).extensions) {
      expect(existsSync(join(packageRoot, path))).toBe(true)
    }
  })
})
