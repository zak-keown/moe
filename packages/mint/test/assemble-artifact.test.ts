import { chmod, cp, mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config.js'
import { assembleArtifact, assembleArtifactSet, inspectArtifact } from '../src/artifact/assemble.js'
import type { ResolvedPlatform, ResolvedPlugin } from '../src/platform/load.js'
import type { PlatformRegistryV1 } from '../src/platform/schema.js'

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url))
const sourceFixture = fileURLToPath(new URL('./fixtures/composed-plugin', import.meta.url))
const workspaces: string[] = []

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

async function fixturePlugin(
  root: string,
  id = 'composed-plugin',
  configRelative = 'mint/composed-plugin.yaml',
): Promise<ResolvedPlugin> {
  const sourcePath = join(root, 'packages', id)
  await mkdir(join(root, 'packages'), { recursive: true })
  await cp(sourceFixture, sourcePath, { recursive: true })
  const originalConfigPath = join(sourcePath, 'mint', 'composed-plugin.yaml')
  const configPath = join(sourcePath, configRelative)
  let configText = await readFile(originalConfigPath, 'utf8')
  configText = configText
    .replace(/^name: composed-plugin$/m, `name: ${id}`)
    .replace('distribution: {npm: "@example/composed-plugin"}', `distribution: {npm: "@example/${id}"}`)
  await mkdir(dirname(configPath), { recursive: true })
  await writeFile(configPath, configText)
  if (configPath !== originalConfigPath) await rm(originalConfigPath)
  await writeFile(join(sourcePath, 'dist', 'data.bin'), Buffer.from([0x00, 0xff, 0xfe, 0x41]))
  await chmod(join(sourcePath, 'dist', 'cli.js'), 0o755)
  const packagePath = join(sourcePath, 'package.json')
  const packageJson = JSON.parse(await readFile(packagePath, 'utf8')) as Record<string, unknown>
  packageJson.name = `@example/${id}`
  await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`)
  const config = loadConfig(sourcePath, configRelative, `packages/${id}/${configRelative}`)
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
    await chmod(join(plugin.sourcePath, 'skills/demo/test-runtime.js'), 0o740)
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
    expect((await stat(join(artifact.root, 'skills/demo/test-runtime.js'))).mode & 0o777).toBe(0o740)
    for (const privateRoot of ['.claude-plugin/skills', '.opencode/skills', '.pi/skills']) {
      expect(paths).not.toContain(`${privateRoot}/demo/test-unlinked.js`)
      expect(paths).toContain(`${privateRoot}/demo/test-runtime.js`)
      expect((await stat(join(artifact.root, privateRoot, 'demo/test-runtime.js'))).mode & 0o777).toBe(0o740)
    }
    expect(paths).not.toContain('skills/demo/.gitignore')
    expect(paths).not.toContain('moe-mint.yaml')
    expect(paths).toContain('.moe/artifact.json')
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
      pi: { skills: ['./.pi/skills'] },
      publishConfig: { access: 'public', registry: 'https://registry.npmjs.org' },
    })
    expect(await readFile(join(artifact.root, 'dist/data.bin'))).toEqual(Buffer.from([0x00, 0xff, 0xfe, 0x41]))
    expect((await stat(join(artifact.root, 'dist/cli.js'))).mode & 0o777).toBe(0o755)
    expect((await stat(join(artifact.root, 'dist/data.bin'))).mode & 0o777).toBe(0o644)
    expect(manifest.files).toEqual([...paths.filter((path) => path !== 'package.json' && path !== '.moe/artifact.json'), '.moe/artifact.json'].sort())
  })

  it('retains a developer-shaped support file referenced by a semantic resource expression', async () => {
    const root = await mkdtemp(join(tmpdir(), 'moe-assemble-resource-'))
    workspaces.push(root)
    await Promise.all([
      cp(join(repoRoot, 'LICENSE'), join(root, 'LICENSE')),
      cp(join(repoRoot, 'LICENSE-MIT'), join(root, 'LICENSE-MIT')),
      cp(join(repoRoot, 'NOTICE'), join(root, 'NOTICE')),
    ])
    const plugin = await fixturePlugin(root)
    await writeFile(
      join(plugin.sourcePath, 'skills/demo/SKILL.md'),
      `${await readFile(join(plugin.sourcePath, 'skills/demo/SKILL.md'), 'utf8')}\nRun {resource:skills/demo/test-unlinked.js}.\n`,
    )
    const destinationRoot = join(root, 'plugins.next-resource')
    await mkdir(destinationRoot)

    const artifact = await assembleArtifact({ repoRoot: root, platform: platform(root, [plugin]), plugin, destinationRoot })
    const paths = await inventory(artifact.root)
    expect(paths).toContain('skills/demo/test-unlinked.js')
    expect(paths).toContain('.claude-plugin/skills/demo/test-unlinked.js')
    expect(await readFile(join(artifact.root, '.claude-plugin/skills/demo/SKILL.md'), 'utf8'))
      .toContain('[skills/demo/test-unlinked.js](test-unlinked.js)')
  })

  it('loads the companion vocabulary beside a non-root canonical config', async () => {
    const root = await mkdtemp(join(tmpdir(), 'moe-assemble-vocab-'))
    workspaces.push(root)
    await Promise.all([
      cp(join(repoRoot, 'LICENSE'), join(root, 'LICENSE')),
      cp(join(repoRoot, 'LICENSE-MIT'), join(root, 'LICENSE-MIT')),
      cp(join(repoRoot, 'NOTICE'), join(root, 'NOTICE')),
    ])
    const plugin = await fixturePlugin(root)
    await writeFile(
      join(plugin.sourcePath, 'skills/demo/SKILL.md'),
      `${await readFile(join(plugin.sourcePath, 'skills/demo/SKILL.md'), 'utf8')}\nUse {ask}.\n`,
    )
    await writeFile(
      join(plugin.sourcePath, 'mint/composed-plugin-vocab.yaml'),
      [
        'tokens:',
        '  ask:',
        '    claude-code: CLAUDE',
        '    opencode: OPENCODE',
        '    pi: PI',
        'blocks: {}',
        '',
      ].join('\n'),
    )
    const destinationRoot = join(root, 'plugins.next-vocab')
    await mkdir(destinationRoot)

    const artifact = await assembleArtifact({ repoRoot: root, platform: platform(root, [plugin]), plugin, destinationRoot })
    expect(await readFile(join(artifact.root, '.claude-plugin/skills/demo/SKILL.md'), 'utf8')).toContain('Use CLAUDE.')
    expect(await readFile(join(artifact.root, '.opencode/skills/demo/SKILL.md'), 'utf8')).toContain('Use OPENCODE.')
    expect(await readFile(join(artifact.root, '.pi/skills/demo/SKILL.md'), 'utf8')).toContain('Use PI.')
  })

  it('rejects a post-payload component directory that aliases an adapter directory', async () => {
    const root = await mkdtemp(join(tmpdir(), 'moe-assemble-alias-'))
    workspaces.push(root)
    await Promise.all([
      cp(join(repoRoot, 'LICENSE'), join(root, 'LICENSE')),
      cp(join(repoRoot, 'LICENSE-MIT'), join(root, 'LICENSE-MIT')),
      cp(join(repoRoot, 'NOTICE'), join(root, 'NOTICE')),
    ])
    const plugin = await fixturePlugin(root)
    plugin.config.components.agents = 'Docs'
    await writeFile(
      plugin.configPath,
      (await readFile(plugin.configPath, 'utf8')).replace('  agents: agents', '  agents: Docs'),
    )
    await mkdir(join(plugin.sourcePath, 'Docs'))
    await writeFile(join(plugin.sourcePath, 'Docs', 'component.md'), 'component\n')
    const destinationRoot = join(root, 'plugins.next-alias')
    await mkdir(destinationRoot)

    await expect(assembleArtifact({ repoRoot: root, platform: platform(root, [plugin]), plugin, destinationRoot }))
      .rejects.toMatchObject({ diagnostic: { code: 'ARTIFACT_PATH_COLLISION' } })

    expect(await readFile(join(destinationRoot, plugin.id, 'dist/data.bin'))).toEqual(Buffer.from([0x00, 0xff, 0xfe, 0x41]))
    await expect(readFile(join(destinationRoot, plugin.id, '.moe-mint/manifest.json'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('rejects a component file that aliases the compositor-owned package manifest', async () => {
    const root = await mkdtemp(join(tmpdir(), 'moe-assemble-package-alias-'))
    workspaces.push(root)
    await Promise.all([
      cp(join(repoRoot, 'LICENSE'), join(root, 'LICENSE')),
      cp(join(repoRoot, 'LICENSE-MIT'), join(root, 'LICENSE-MIT')),
      cp(join(repoRoot, 'NOTICE'), join(root, 'NOTICE')),
    ])
    const plugin = await fixturePlugin(root)
    plugin.config.components.agents = 'PACKAGE.JSON'
    await writeFile(
      plugin.configPath,
      (await readFile(plugin.configPath, 'utf8')).replace('  agents: agents', '  agents: PACKAGE.JSON'),
    )
    await rm(join(plugin.sourcePath, 'package.json'))
    await writeFile(join(plugin.sourcePath, 'PACKAGE.JSON'), '{}\n')
    const destinationRoot = join(root, 'plugins.next-package-alias')
    await mkdir(destinationRoot)

    await expect(assembleArtifact({ repoRoot: root, platform: platform(root, [plugin]), plugin, destinationRoot }))
      .rejects.toMatchObject({ diagnostic: { code: 'ARTIFACT_PATH_COLLISION' } })
  })

  it('rejects a component directory that aliases reserved artifact metadata', async () => {
    const root = await mkdtemp(join(tmpdir(), 'moe-assemble-metadata-alias-'))
    workspaces.push(root)
    await Promise.all([
      cp(join(repoRoot, 'LICENSE'), join(root, 'LICENSE')),
      cp(join(repoRoot, 'LICENSE-MIT'), join(root, 'LICENSE-MIT')),
      cp(join(repoRoot, 'NOTICE'), join(root, 'NOTICE')),
    ])
    const plugin = await fixturePlugin(root)
    plugin.config.components.agents = '.MOE'
    await writeFile(
      plugin.configPath,
      (await readFile(plugin.configPath, 'utf8')).replace('  agents: agents', '  agents: .MOE'),
    )
    await mkdir(join(plugin.sourcePath, '.MOE'))
    await writeFile(join(plugin.sourcePath, '.MOE/component.md'), 'component\n')
    const destinationRoot = join(root, 'plugins.next-metadata-alias')
    await mkdir(destinationRoot)

    await expect(assembleArtifact({ repoRoot: root, platform: platform(root, [plugin]), plugin, destinationRoot }))
      .rejects.toMatchObject({ diagnostic: { code: 'ARTIFACT_PATH_COLLISION' } })
  })

  it('folds component deny names and excludes the exact nonstandard Mint config path', async () => {
    const root = await mkdtemp(join(tmpdir(), 'moe-assemble-deny-'))
    workspaces.push(root)
    await Promise.all([
      cp(join(repoRoot, 'LICENSE'), join(root, 'LICENSE')),
      cp(join(repoRoot, 'LICENSE-MIT'), join(root, 'LICENSE-MIT')),
      cp(join(repoRoot, 'NOTICE'), join(root, 'NOTICE')),
    ])
    const plugin = await fixturePlugin(root, 'composed-plugin', 'skills/demo/custom-policy.yml')
    await Promise.all([
      mkdir(join(plugin.sourcePath, 'skills/demo/.Git'), { recursive: true }),
      mkdir(join(plugin.sourcePath, 'skills/demo/Tests'), { recursive: true }),
      mkdir(join(plugin.sourcePath, 'skills/demo/SPEC'), { recursive: true }),
      mkdir(join(plugin.sourcePath, 'skills/demo/specs'), { recursive: true }),
    ])
    await Promise.all([
      writeFile(join(plugin.sourcePath, 'skills/demo/.Git/config'), 'vcs\n'),
      writeFile(join(plugin.sourcePath, 'skills/demo/Tests/example.js'), 'test\n'),
      writeFile(join(plugin.sourcePath, 'skills/demo/SPEC/example.js'), 'spec\n'),
      writeFile(join(plugin.sourcePath, 'skills/demo/specs/example.js'), 'specs\n'),
      writeFile(join(plugin.sourcePath, 'skills/demo/test_example.py'), 'test\n'),
      writeFile(join(plugin.sourcePath, 'skills/demo/example_test.py'), 'test\n'),
      writeFile(join(plugin.sourcePath, 'skills/demo/example.SPEC.JS'), 'test\n'),
    ])
    const destinationRoot = join(root, 'plugins.next-deny')
    await mkdir(destinationRoot)

    const artifact = await assembleArtifact({ repoRoot: root, platform: platform(root, [plugin]), plugin, destinationRoot })
    const paths = await inventory(artifact.root)

    for (const forbidden of [
      'skills/demo/.Git/config',
      'skills/demo/Tests/example.js',
      'skills/demo/SPEC/example.js',
      'skills/demo/specs/example.js',
      'skills/demo/test_example.py',
      'skills/demo/example_test.py',
      'skills/demo/example.SPEC.JS',
      'skills/demo/custom-policy.yml',
    ]) expect(paths).not.toContain(forbidden)
    expect(paths).toContain('skills/test-driven-development/SKILL.md')
  })

  it('rejects alternate-case source-map suffixes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'moe-assemble-map-'))
    workspaces.push(root)
    const plugin = await fixturePlugin(root)
    await writeFile(join(plugin.sourcePath, 'skills/demo/bundle.MAP'), '{}\n')
    const destinationRoot = join(root, 'plugins.next-map')
    await mkdir(destinationRoot)

    await expect(assembleArtifact({ repoRoot: root, platform: platform(root, [plugin]), plugin, destinationRoot }))
      .rejects.toMatchObject({ diagnostic: { code: 'ARTIFACT_COMPONENT_FORBIDDEN' } })
  })

  it('rejects a source component symlink before following it outside the package', async () => {
    const root = await mkdtemp(join(tmpdir(), 'moe-assemble-source-link-'))
    const outside = await mkdtemp(join(tmpdir(), 'moe-assemble-source-link-target-'))
    workspaces.push(root, outside)
    const plugin = await fixturePlugin(root)
    const secret = join(outside, 'secret.txt')
    await writeFile(secret, 'outside bytes\n')
    await symlink(secret, join(plugin.sourcePath, 'skills/demo/leak.txt'))
    const destinationRoot = join(root, 'plugins.next-source-link')
    await mkdir(destinationRoot)

    await expect(assembleArtifact({ repoRoot: root, platform: platform(root, [plugin]), plugin, destinationRoot }))
      .rejects.toMatchObject({
        diagnostic: {
          code: 'ARTIFACT_COMPONENT_UNSAFE_TYPE',
          path: 'skills/demo/leak.txt',
        },
      })

    expect(await readFile(secret, 'utf8')).toBe('outside bytes\n')
    await expect(readFile(join(destinationRoot, plugin.id, 'skills/demo/leak.txt')))
      .rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('rejects component and final-tree aliases of the reserved build-evidence root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'moe-assemble-build-evidence-'))
    workspaces.push(root)
    const plugin = await fixturePlugin(root)
    plugin.config.components.agents = '.MOE-BUILD'
    await mkdir(join(plugin.sourcePath, '.MOE-BUILD'))
    await writeFile(join(plugin.sourcePath, '.MOE-BUILD', 'bundle-inventory.json'), '[]\n')
    const destinationRoot = join(root, 'plugins.next-build-evidence')
    await mkdir(destinationRoot)

    await expect(assembleArtifact({ repoRoot: root, platform: platform(root, [plugin]), plugin, destinationRoot }))
      .rejects.toMatchObject({ diagnostic: { code: 'ARTIFACT_COMPONENT_FORBIDDEN' } })
  })

  it('directly rejects reserved build evidence during final artifact inspection', async () => {
    const root = await mkdtemp(join(tmpdir(), 'moe-inspect-build-evidence-'))
    workspaces.push(root)
    const plugin = await fixturePlugin(root)
    const artifactRoot = join(root, 'untrusted-artifact')
    await mkdir(join(artifactRoot, '.MOE-BUILD'), { recursive: true })
    await writeFile(join(artifactRoot, '.MOE-BUILD', 'bundle-inventory.json'), '[]\n')

    await expect(inspectArtifact(plugin, artifactRoot))
      .rejects.toMatchObject({ diagnostic: { code: 'ARTIFACT_COMPONENT_FORBIDDEN' } })
  })

  it('rejects mismatched repository authority before either entry point creates output', async () => {
    const sourceRoot = await mkdtemp(join(tmpdir(), 'moe-assemble-authority-source-'))
    const foreignRoot = await mkdtemp(join(tmpdir(), 'moe-assemble-authority-foreign-'))
    workspaces.push(sourceRoot, foreignRoot)
    const plugin = await fixturePlugin(sourceRoot)
    const resolved = platform(sourceRoot, [plugin])
    const singleDestination = join(foreignRoot, 'single-destination')
    const setDestination = join(foreignRoot, 'plugins.next-mismatch')
    await mkdir(singleDestination)

    await expect(assembleArtifact({ repoRoot: foreignRoot, platform: resolved, plugin, destinationRoot: singleDestination }))
      .rejects.toMatchObject({ diagnostic: { code: 'ARTIFACT_REPOSITORY_PROVENANCE' } })
    await expect(assembleArtifactSet({ repoRoot: foreignRoot, platform: resolved, destinationRoot: setDestination }))
      .rejects.toMatchObject({ diagnostic: { code: 'ARTIFACT_REPOSITORY_PROVENANCE' } })

    expect(await readdir(singleDestination)).toEqual([])
    await expect(readdir(setDestination)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('cleans only its own failed nonce tree and leaves the canonical tree unchanged when plugin six fails', { timeout: 15_000 }, async () => {
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

    sixth.config.artifact.payloads = []
    sixth.config.importedWorks = [{ name: 'superpowers', artifactRoots: [] }]
    const legalDestination = join(root, 'plugins.next-legal-six')
    await expect(assembleArtifactSet({ repoRoot: root, platform: platform(root, plugins), destinationRoot: legalDestination }))
      .rejects.toMatchObject({ diagnostic: { code: 'LEGAL_IMPORT_UNREPRESENTED' } })
    expect(await inventory(canonical)).toEqual(before)
    await expect(readdir(legalDestination)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('rejects a mutated canonical bundled-license template before writing an artifact manifest', async () => {
    const root = await mkdtemp(join(tmpdir(), 'moe-assemble-legal-template-'))
    workspaces.push(root)
    await Promise.all([
      cp(join(repoRoot, 'LICENSE'), join(root, 'LICENSE')),
      cp(join(repoRoot, 'LICENSE-MIT'), join(root, 'LICENSE-MIT')),
      cp(join(repoRoot, 'LICENSE-BSD-3-CLAUSE'), join(root, 'LICENSE-BSD-3-CLAUSE')),
      cp(join(repoRoot, 'LICENSE-ISC'), join(root, 'LICENSE-ISC')),
      cp(join(repoRoot, 'NOTICE'), join(root, 'NOTICE')),
    ])
    await writeFile(join(root, 'LICENSE-BSD-3-CLAUSE'), 'mutated grant\n')
    const plugin = await fixturePlugin(root)
    plugin.config.importedWorks = [{ name: 'fast-uri', artifactRoots: ['skills'] }]
    const destinationRoot = join(root, 'plugins.next-legal-template')
    await mkdir(destinationRoot)

    await expect(assembleArtifact({ repoRoot: root, platform: platform(root, [plugin]), plugin, destinationRoot }))
      .rejects.toMatchObject({ diagnostic: { code: 'LEGAL_TEMPLATE_DRIFT' } })
    await expect(readFile(join(destinationRoot, plugin.id, '.moe/artifact.json'))).rejects.toMatchObject({ code: 'ENOENT' })
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
