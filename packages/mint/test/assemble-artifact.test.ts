import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config.js'
import { assembleArtifact, assembleArtifactSet } from '../src/artifact/assemble.js'
import type { ResolvedPlatform, ResolvedPlugin } from '../src/platform/load.js'
import type { PlatformRegistryV1 } from '../src/platform/schema.js'

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url))
const sourceFixture = fileURLToPath(new URL('./fixtures/composed-plugin', import.meta.url))
const workspaces: string[] = []

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

async function fixturePlugin(root: string, id = 'composed-plugin'): Promise<ResolvedPlugin> {
  const sourcePath = join(root, 'packages', id)
  await mkdir(join(root, 'packages'), { recursive: true })
  await cp(sourceFixture, sourcePath, { recursive: true })
  const configPath = join(sourcePath, 'mint', 'composed-plugin.yaml')
  let configText = await readFile(configPath, 'utf8')
  configText = configText
    .replace(/^name: composed-plugin$/m, `name: ${id}`)
    .replace('distribution: {npm: "@example/composed-plugin"}', `distribution: {npm: "@example/${id}"}`)
  await writeFile(configPath, configText)
  const packagePath = join(sourcePath, 'package.json')
  const packageJson = JSON.parse(await readFile(packagePath, 'utf8')) as Record<string, unknown>
  packageJson.name = `@example/${id}`
  await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`)
  const config = loadConfig(sourcePath, 'mint/composed-plugin.yaml', `packages/${id}/mint/composed-plugin.yaml`)
  return {
    id,
    npmPackage: `@example/${id}`,
    version: '1.2.3',
    sourcePackagePath: `packages/${id}`,
    sourcePath,
    configPath,
    packageJson,
    config,
    targets: config.targets,
  }
}

function platform(root: string, plugins: readonly ResolvedPlugin[]): ResolvedPlatform {
  const registry = {
    schema: 1,
    targets: {},
    profiles: { core: { default: true, plugins: [plugins[0]?.id ?? 'missing'] } },
    plugins: plugins.map((plugin) => ({
      id: plugin.id,
      source: plugin.sourcePackagePath,
      config: plugin.config.source,
      sourcePath: plugin.sourcePath,
      configPath: plugin.configPath,
    })),
    platform: {
      known_operating_systems: ['macos'],
      contributor_operating_systems: ['macos'],
      core_cli_required_operating_systems: ['macos'],
      formal_release_requires_target_os_matrix: true,
    },
    release: {
      origin: { kind: 'npm', registry: 'https://registry.npmjs.org' },
      mirror: { kind: 'github-release' },
      channels: { stable: 'latest', prerelease: 'next' },
    },
  } as unknown as PlatformRegistryV1
  return { repositoryRoot: root, registry, plugins }
}

async function inventory(root: string, relative = ''): Promise<string[]> {
  const paths: string[] = []
  for (const entry of await readdir(join(root, relative), { withFileTypes: true })) {
    const path = relative ? `${relative}/${entry.name}` : entry.name
    if (entry.isDirectory()) paths.push(...await inventory(root, path))
    else paths.push(path)
  }
  return paths.sort()
}

describe('complete artifact assembly', () => {
  it('combines classified components, binary payloads, adapters, legal files, and a composed package', async () => {
    const root = await mkdtemp(join(tmpdir(), 'moe-assemble-'))
    workspaces.push(root)
    await Promise.all([
      cp(join(repoRoot, 'LICENSE'), join(root, 'LICENSE')),
      cp(join(repoRoot, 'LICENSE-MIT'), join(root, 'LICENSE-MIT')),
      cp(join(repoRoot, 'NOTICE'), join(root, 'NOTICE')),
    ])
    const plugin = await fixturePlugin(root)
    const resolved = platform(root, [plugin])
    const destinationRoot = join(root, 'plugins.next-testnonce')
    await mkdir(destinationRoot)

    const artifact = await assembleArtifact({ repoRoot: root, platform: resolved, plugin, destinationRoot })

    expect(artifact.root).toBe(join(destinationRoot, plugin.id))
    expect(artifact.emissions).toBe(artifact.projection.emissions)
    expect(artifact.omittedOptionalPayloads).toEqual([])
    const paths = await inventory(artifact.root)
    expect(paths).toContain('skills/demo/test-runtime.js')
    expect(paths).toContain('skills/demo/__tests__/test-transitive.js')
    expect(paths).toContain('skills/test-driven-development/SKILL.md')
    expect(paths).not.toContain('skills/demo/test-unlinked.js')
    expect(paths).not.toContain('skills/demo/.gitignore')
    expect(paths).not.toContain('moe-mint.yaml')
    expect(paths).toContain('.moe-mint/manifest.json')
    expect(paths).toContain('LICENSE')
    expect(paths).toContain('NOTICE')
    expect(paths).not.toContain('THIRD_PARTY_NOTICES')
    const manifest = JSON.parse(await readFile(join(artifact.root, 'package.json'), 'utf8')) as Record<string, unknown>
    expect(manifest).not.toHaveProperty('scripts')
    expect(manifest).not.toHaveProperty('devDependencies')
    expect(manifest).toMatchObject({
      name: '@example/composed-plugin',
      main: 'dist/index.js',
      pi: { skills: ['./skills'] },
      publishConfig: { access: 'public', registry: 'https://registry.npmjs.org' },
    })
    expect(manifest.files).toEqual(expect.arrayContaining(['.moe/artifact.json', '.moe-mint/manifest.json', 'LICENSE', 'NOTICE', 'dist/index.js']))
  })

  it('cleans only its own failed nonce tree and leaves the canonical tree unchanged when plugin six fails', async () => {
    const root = await mkdtemp(join(tmpdir(), 'moe-assemble-six-'))
    workspaces.push(root)
    await Promise.all([
      cp(join(repoRoot, 'LICENSE'), join(root, 'LICENSE')),
      cp(join(repoRoot, 'LICENSE-MIT'), join(root, 'LICENSE-MIT')),
      cp(join(repoRoot, 'NOTICE'), join(root, 'NOTICE')),
    ])
    const plugins: ResolvedPlugin[] = []
    for (let index = 1; index <= 6; index += 1) plugins.push(await fixturePlugin(root, `fixture-${index}`))
    const sixth = plugins[5]
    if (sixth === undefined) throw new Error('sixth fixture missing')
    sixth.config.artifact.payloads = [{ from: 'absent', to: 'dist', required: true }]
    const canonical = join(root, 'plugins')
    await mkdir(canonical)
    await writeFile(join(canonical, 'sentinel'), 'canonical\n')
    const before = await inventory(canonical)
    const destinationRoot = join(root, 'plugins.next-sixnonce')

    await expect(assembleArtifactSet({ repoRoot: root, platform: platform(root, plugins), destinationRoot }))
      .rejects.toMatchObject({ diagnostic: { code: 'ARTIFACT_PAYLOAD_MISSING' } })

    expect(await inventory(canonical)).toEqual(before)
    await expect(readdir(destinationRoot)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('refuses to assemble through a symbolic-link destination root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'moe-assemble-link-'))
    workspaces.push(root)
    const plugin = await fixturePlugin(root)
    const outside = join(root, 'outside')
    const destinationRoot = join(root, 'destination-link')
    await mkdir(outside)
    await symlink(outside, destinationRoot)

    await expect(assembleArtifact({ repoRoot: root, platform: platform(root, [plugin]), plugin, destinationRoot }))
      .rejects.toMatchObject({ diagnostic: { code: 'ARTIFACT_STAGING_DESTINATION_INVALID' } })

    expect(await readdir(outside)).toEqual([])
  })
})
