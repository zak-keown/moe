import { describe, it, expect, vi } from 'vitest'
import { mkdtemp, rm, writeFile, } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { prepareCandidate, type CandidateInput, type CandidatePreparationDeps, type CandidateArtifactInput } from '../src/release/candidate.js'
import { parsePlatformTag } from '../src/release/tag-policy.js'
import { sha256, REGISTRY_PLUGIN_COUNT, type ReleasePreflightV1 } from '../src/release/catalog.js'
import type { PackedArtifact } from '../src/artifact/pack.js'
import type { ResolvedPlugin } from '../src/platform/load.js'
import { createFakeReleaseStore } from './helpers/fake-release-store.js'

const PLUGINS = [
  { id: 'moe', pkg: '@bubstack/moe-core', version: '0.1.5' },
  { id: 'moe-backstory', pkg: '@bubstack/moe-backstory', version: '0.1.5' },
  { id: 'moe-memory', pkg: '@bubstack/moe-memory', version: '0.1.5' },
  { id: 'moe-glass', pkg: '@bubstack/moe-glass', version: '0.1.5' },
  { id: 'moe-crew', pkg: '@bubstack/moe-crew', version: '0.1.5' },
  { id: 'moe-statusline', pkg: '@bubstack/moe-statusline', version: '0.1.1' },
]

function fakeResolvedPlugin(p: typeof PLUGINS[0]): ResolvedPlugin {
  return {
    id: p.id,
    npmPackage: p.pkg,
    version: p.version,
    sourcePackagePath: `packages/${p.id.replace('moe-', '')}`,
    sourcePath: `/fake/packages/${p.id}`,
    configPath: `/fake/packages/${p.id}/mint/${p.id}.yaml`,
    packageJson: { name: p.pkg, version: p.version },
    config: {} as any,
    targets: {} as any,
  }
}

function fakeArtifactInput(p: typeof PLUGINS[0]): CandidateArtifactInput {
  return {
    plugin: fakeResolvedPlugin(p),
    artifactRoot: `/fake/plugins/${p.id}`,
    expected: {
      plugin: { id: p.id, package: p.pkg, version: p.version },
      targets: {},
      omitted_optional_payloads: [],
    },
    bundleInventory: [],
    treeSha256: sha256(`tree-${p.id}`),
    manifestSha256: sha256(`manifest-${p.id}`),
  }
}

function fakePreflight(): ReleasePreflightV1 {
  return {
    schema: 1,
    platform_version: '0.1.5-rc.1',
    source_sha: '0'.repeat(40),
    plugins: PLUGINS.map((p) => ({
      plugin: p.id,
      package: p.pkg,
      proposed_version: p.version,
      proposed: { state: 'absent' as const },
      predecessor: { state: 'absent' as const },
    })),
  }
}

function makeFakePack(): {
  fn: CandidatePreparationDeps['pack']
  calls: string[]
} {
  const calls: string[] = []
  const fn = async (_artifactRoot: string, outputDir: string, expected: any): Promise<PackedArtifact> => {
    calls.push(expected.plugin.id)
    const filename = `${expected.plugin.package.replace('@bubstack/', 'bubstack-').replace('/', '-')}-${expected.plugin.version}.tgz`
    const content = Buffer.from(`fake-tarball-${expected.plugin.id}`)
    await writeFile(join(outputDir, filename), content)
    return {
      tarballPath: join(outputDir, filename),
      filename,
      bytes: content.length,
      sha256: sha256(content.toString()),
      integrity: `sha512-${Buffer.from('fake').toString('base64')}` as `sha512-${string}`,
    }
  }
  return { fn, calls }
}

describe('prepareCandidate', () => {
  let workDir: string

  const setup = async () => {
    workDir = await mkdtemp(join(tmpdir(), 'candidate-test-'))
  }

  const cleanup = async () => {
    if (workDir) await rm(workDir, { recursive: true, force: true })
  }

  it('packs all six for genesis', async () => {
    await setup()
    try {
      const tag = parsePlatformTag('v0.1.5-rc.1')
      const packer = makeFakePack()
      const store = createFakeReleaseStore()

      const input: CandidateInput = {
        tag,
        sourceSha: '0'.repeat(40),
        preflight: fakePreflight(),
        publishMatrix: PLUGINS.map((p) => ({
          plugin: p.id,
          package: p.pkg,
          version: p.version,
          sourcePackagePath: `packages/${p.id}`,
          generatedArtifactPath: `plugins/${p.id}`,
        })),
        artifacts: PLUGINS.map(fakeArtifactInput),
        lockfileSha256: '1'.repeat(64),
        registrySha256: '2'.repeat(64),
        mintVersion: '0.0.0',
        outputDir: workDir,
      }

      const result = await prepareCandidate(input, {
        pack: packer.fn,
        verify: vi.fn(),
        releases: store,
      })

      expect(packer.calls).toHaveLength(REGISTRY_PLUGIN_COUNT)
      expect(result.lock.plugins).toHaveLength(REGISTRY_PLUGIN_COUNT)
      expect(result.lock.plugins.every((p) => p.changed)).toBe(true)
      expect(result.lock.release_assets.filter((a) => a.kind === 'tarball')).toHaveLength(REGISTRY_PLUGIN_COUNT)
      expect(result.lock.release_assets.filter((a) => a.kind === 'bundle-inventory')).toHaveLength(REGISTRY_PLUGIN_COUNT)
      expect(result.lock.release_assets.filter((a) => a.kind === 'checksums')).toHaveLength(2)
      expect(result.lock.release_assets.filter((a) => a.kind === 'catalog')).toHaveLength(1)
    } finally {
      await cleanup()
    }
  })

  it('rejects stable tag', async () => {
    await setup()
    try {
      const tag = parsePlatformTag('v0.1.5')
      const input: CandidateInput = {
        tag,
        sourceSha: '0'.repeat(40),
        preflight: fakePreflight(),
        publishMatrix: [],
        artifacts: PLUGINS.map(fakeArtifactInput),
        lockfileSha256: '1'.repeat(64),
        registrySha256: '2'.repeat(64),
        mintVersion: '0.0.0',
        outputDir: workDir,
      }
      await expect(prepareCandidate(input, {
        pack: vi.fn(),
        verify: vi.fn(),
        releases: createFakeReleaseStore(),
      })).rejects.toThrow(/prerelease/)
    } finally {
      await cleanup()
    }
  })

  it('rejects preflight platform version mismatch', async () => {
    await setup()
    try {
      const tag = parsePlatformTag('v0.1.5-rc.1')
      const badPreflight = { ...fakePreflight(), platform_version: '0.1.6-rc.1' }
      const input: CandidateInput = {
        tag,
        sourceSha: '0'.repeat(40),
        preflight: badPreflight,
        publishMatrix: [],
        artifacts: PLUGINS.map(fakeArtifactInput),
        lockfileSha256: '1'.repeat(64),
        registrySha256: '2'.repeat(64),
        mintVersion: '0.0.0',
        outputDir: workDir,
      }
      await expect(prepareCandidate(input, {
        pack: vi.fn(),
        verify: vi.fn(),
        releases: createFakeReleaseStore(),
      })).rejects.toThrow(/preflight/)
    } finally {
      await cleanup()
    }
  })

  it('rejects wrong artifact count', async () => {
    await setup()
    try {
      const tag = parsePlatformTag('v0.1.5-rc.1')
      const input: CandidateInput = {
        tag,
        sourceSha: '0'.repeat(40),
        preflight: fakePreflight(),
        publishMatrix: [],
        artifacts: PLUGINS.slice(0, 3).map(fakeArtifactInput),
        lockfileSha256: '1'.repeat(64),
        registrySha256: '2'.repeat(64),
        mintVersion: '0.0.0',
        outputDir: workDir,
      }
      await expect(prepareCandidate(input, {
        pack: vi.fn(),
        verify: vi.fn(),
        releases: createFakeReleaseStore(),
      })).rejects.toThrow(/6/)
    } finally {
      await cleanup()
    }
  })

  it('pack calls equals changed plugin count', async () => {
    await setup()
    try {
      const tag = parsePlatformTag('v0.1.5-rc.1')
      const packer = makeFakePack()
      const result = await prepareCandidate(
        {
          tag,
          sourceSha: '0'.repeat(40),
          preflight: fakePreflight(),
          publishMatrix: PLUGINS.map((p) => ({
            plugin: p.id,
            package: p.pkg,
            version: p.version,
            sourcePackagePath: `packages/${p.id}`,
            generatedArtifactPath: `plugins/${p.id}`,
          })),
          artifacts: PLUGINS.map(fakeArtifactInput),
          lockfileSha256: '1'.repeat(64),
          registrySha256: '2'.repeat(64),
          mintVersion: '0.0.0',
          outputDir: workDir,
        },
        {
          pack: packer.fn,
          verify: vi.fn(),
          releases: createFakeReleaseStore(),
        },
      )
      const changedCount = result.lock.plugins.filter((p) => p.changed).length
      expect(packer.calls.length).toBe(changedCount)
    } finally {
      await cleanup()
    }
  })
})

describe('prepareCandidate source (CR-100)', () => {
  it('never hashes an empty string to stand in for a tarball digest', () => {
    // _pluginHashes was dead scaffolding that computed
    // createHash('sha512').update('').digest('hex') for every plugin — the
    // well-known empty-SHA-512 constant below, regardless of the actual
    // tarball bytes. It was never read (the real SHA512SUMS content comes
    // from packed.integrity, a few lines later), but its shape matched
    // buildTarballChecksumRows exactly, so a future edit that wired it back
    // in would silently corrupt every release's SHA512SUMS with this
    // constant, content-independent digest. Guard against reintroducing it.
    const src = readFileSync(fileURLToPath(new URL('../src/release/candidate.ts', import.meta.url)), 'utf8')
    expect(src).not.toMatch(/createHash\(['"]sha512['"]\)\.update\(['"]{2}\)/)
  })
})
