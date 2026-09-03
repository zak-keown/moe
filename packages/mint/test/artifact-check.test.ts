import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkArtifactSet, } from '../src/artifact/check.js'
import { resolvePlatform } from '../src/platform/load.js'

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..')

const EXPECTED_PLUGINS = [
  'moe',
  'moe-backstory',
  'moe-memory',
  'moe-glass',
  'moe-crew',
  'moe-statusline',
]

describe('artifact check — six-plugin gate', () => {
  it('validates all six registry plugins with zero problems', async () => {
    const { results, problems } = await checkArtifactSet(REPO_ROOT)

    expect(problems).toEqual([])
    expect(results.map((r) => r.plugin).sort()).toEqual([...EXPECTED_PLUGINS].sort())

    for (const r of results) {
      expect(r.files).toBeGreaterThan(0)
      expect(r.treeDigest).toMatch(/^[a-f0-9]{64}$/)
      expect(r.tarballBytes).toBeGreaterThan(0)
      expect(r.tarballSha256).toMatch(/^[a-f0-9]{64}$/)
      expect(r.tarballIntegrity).toMatch(/^sha512-/)
      expect(r.legalDiagnostics).toBe(0)
    }
  }, 120_000)

  it.each(EXPECTED_PLUGINS)('%s has scoped npm identity and valid version', async (pluginId) => {
    const { results } = await checkArtifactSet(REPO_ROOT)
    const r = results.find((x) => x.plugin === pluginId)!
    expect(r).toBeDefined()
    expect(r.package).toMatch(/^@bubstack\//)
    expect(r.version).toMatch(/^\d+\.\d+\.\d+/)
  }, 120_000)

  it.each(EXPECTED_PLUGINS)('%s artifact manifest matches committed tree', async (pluginId) => {
    const artifactRoot = join(REPO_ROOT, 'plugins', pluginId)
    const manifest = JSON.parse(
      await readFile(join(artifactRoot, '.moe', 'artifact.json'), 'utf8'),
    )
    expect(manifest.schema).toBe(1)
    expect(manifest.plugin.id).toBe(pluginId)
    expect(manifest.tree_sha256).toMatch(/^[a-f0-9]{64}$/)
    expect(manifest.files.length).toBeGreaterThan(0)

    for (const f of manifest.files) {
      expect(f.mode).toMatch(/^0(644|755)$/)
      expect(f.sha256).toMatch(/^[a-f0-9]{64}$/)
    }
  })

  it.each(EXPECTED_PLUGINS)('%s has a valid package.json with required fields', async (pluginId) => {
    const artifactRoot = join(REPO_ROOT, 'plugins', pluginId)
    const pkg = JSON.parse(
      await readFile(join(artifactRoot, 'package.json'), 'utf8'),
    )
    expect(pkg.name).toMatch(/^@bubstack\//)
    expect(pkg.version).toBeDefined()
    expect(pkg.license).toBeDefined()
  })

  it.each(EXPECTED_PLUGINS)('%s excludes source-only content from the artifact', async (pluginId) => {
    const artifactRoot = join(REPO_ROOT, 'plugins', pluginId)
    const manifest = JSON.parse(
      await readFile(join(artifactRoot, '.moe', 'artifact.json'), 'utf8'),
    )
    const paths = manifest.files.map((f: { path: string }) => f.path)
    const excluded = ['tsconfig.json', 'tsconfig.tests.json', 'vitest.config.ts', '.gitignore']
    for (const ex of excluded) {
      expect(paths).not.toContain(ex)
    }
  })

  it('platform resolution matches the six registered plugins', async () => {
    const platform = await resolvePlatform(REPO_ROOT)
    expect(platform.plugins.map((p) => p.id).sort()).toEqual([...EXPECTED_PLUGINS].sort())
  })
})
