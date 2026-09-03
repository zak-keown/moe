import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

// The root generation wrapper is operational JavaScript rather than package
// source; importing the real entry keeps these tests on the pnpm-mint path.
// @ts-expect-error scripts/mint-plugins.mjs intentionally has no package declaration file
const wrapper = await import('../../../scripts/mint-plugins.mjs')
// @ts-expect-error dependency-free bin registry intentionally has no package declaration file
const { HARNESS_IDS, PLUGINS } = await import('../../../bin/lib/plugin-registry.mjs')
// @ts-expect-error scripts/mint-recover.mjs intentionally has no package declaration file
const recovery = await import('../../../scripts/mint-recover.mjs')
// @ts-expect-error root transaction module intentionally has no package declaration file
const transactionModule = await import('../../../scripts/lib/mint-generation-transaction.mjs')

const FIXED_NONCE = 'wrappertestnonce'

function generationRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'mint-wrapper-'))
  mkdirSync(join(root, 'plugins'), { recursive: true })
  mkdirSync(join(root, '.claude-plugin'), { recursive: true })
  mkdirSync(join(root, 'docs', 'moe', 'generated'), { recursive: true })
  writeFileSync(join(root, 'plugins', 'canonical.bin'), Buffer.from([0x00, 0xff, 0x41, 0x0a]))
  writeFileSync(join(root, '.claude-plugin', 'marketplace.json'), '{"old":true}\n')
  writeFileSync(join(root, 'docs', 'moe', 'generated', 'plugin-catalog.md'), 'old catalog\n')
  return root
}

function treeSnapshot(root: string): Array<{ path: string; body?: string }> {
  const visit = (directory: string, prefix = ''): Array<{ path: string; body?: string }> =>
    readdirSync(directory).flatMap((name) => {
      const absolute = join(directory, name)
      const relative = prefix === '' ? name : `${prefix}/${name}`
      return statSync(absolute).isDirectory()
        ? [{ path: `${relative}/` }, ...visit(absolute, relative)]
        : [{ path: relative, body: readFileSync(absolute).toString('base64') }]
    })
  return visit(root)
}

function canonicalBytes(root: string) {
  return {
    plugins: treeSnapshot(join(root, 'plugins')),
    marketplace: readFileSync(join(root, '.claude-plugin', 'marketplace.json')).toString('base64'),
    catalog: readFileSync(join(root, 'docs', 'moe', 'generated', 'plugin-catalog.md')).toString('base64'),
  }
}

function host(repositoryRoot: string) {
  return { nodeVersion: '24.7.0', platform: 'linux', repositoryRoot, chdir: () => undefined }
}

function artifacts() {
  return Array.from({ length: 6 }, (_, index) => ({
    plugin: { id: `fixture-${index + 1}` },
    projection: { id: `record-${index + 1}` },
  }))
}

function transactionError(code: string, paths: string[], action: string): Error {
  return new transactionModule.GenerationTransactionError(code, `${code} message`, {
    paths,
    action,
    cause: new Error(`${code} cause`),
  })
}

type CanonicalPlugin = {
  name: string
  pkg: string
  config: string
  repository: string
  distribution: { npm: string }
  harnesses: string[]
}

function resolvedPlugins() {
  return (PLUGINS as CanonicalPlugin[]).map((plugin) => {
    const excluded = HARNESS_IDS.filter((harness: string) => !plugin.harnesses.includes(harness))
    return {
      id: plugin.name,
      npmPackage: plugin.distribution.npm,
      sourcePackagePath: `packages/${plugin.pkg}`,
      targets: Object.fromEntries(HARNESS_IDS.map((harness: string) => [
        harness,
        { intent: plugin.harnesses.includes(harness) ? 'preview' : 'omit' },
      ])),
      config: {
        source: `packages/${plugin.pkg}/${plugin.config}`,
        repository: plugin.repository,
        distribution: { npm: plugin.distribution.npm },
        harnesses: { exclude: excluded },
      },
    }
  })
}

describe('root Mint generation wrapper', () => {
  it('accepts the resolved platform only when it matches the canonical bin registry', () => {
    expect(() => wrapper.validateCanonicalPluginRegistry({ plugins: resolvedPlugins() })).not.toThrow()
  })

  it.each([
    ['source path', (plugin: ReturnType<typeof resolvedPlugins>[number]) => { plugin.sourcePackagePath = 'packages/wrong' }],
    ['config path', (plugin: ReturnType<typeof resolvedPlugins>[number]) => { plugin.config.source = 'packages/wrong/mint/moe.yaml' }],
    ['repository', (plugin: ReturnType<typeof resolvedPlugins>[number]) => { plugin.config.repository = 'https://example.com/wrong' }],
    ['resolved npm package', (plugin: ReturnType<typeof resolvedPlugins>[number]) => { plugin.npmPackage = '@wrong/package' }],
    ['config npm package', (plugin: ReturnType<typeof resolvedPlugins>[number]) => { plugin.config.distribution.npm = '@wrong/package' }],
    ['target intent activation', (plugin: ReturnType<typeof resolvedPlugins>[number]) => { plugin.targets.codex = { intent: 'omit' } }],
    ['harness exclusion activation', (plugin: ReturnType<typeof resolvedPlugins>[number]) => { plugin.config.harnesses.exclude.push('codex') }],
  ])('rejects %s drift before preparing generated outputs', async (_field, mutate) => {
    const operations: string[] = []
    const errors: string[] = []
    const plugins = resolvedPlugins()
    const first = plugins[0]
    if (first === undefined) throw new Error('canonical plugin fixture is empty')
    mutate(first)
    const status = await wrapper.executeMintPluginsCli({
      repositoryRoot: generationRoot(),
      host: host('/fixture/repository'),
      nonceFactory: () => {
        operations.push('nonce')
        return FIXED_NONCE
      },
      loadRuntime: async () => ({
        resolvePlatform: () => ({ plugins }),
        assembleArtifactSet: () => {
          operations.push('assemble')
          return []
        },
        projections: {},
      }),
    }, { error: (message: string) => errors.push(message) })

    expect(status).toBe(1)
    expect(operations).toEqual([])
    expect(errors.join('\n')).toContain('MINT_PLUGIN_REGISTRY_MISMATCH')
  })

  it('rejects missing, extra, and duplicate plugin records in either registry', () => {
    const canonical = PLUGINS as CanonicalPlugin[]
    const first = canonical[0]
    if (first === undefined) throw new Error('canonical plugin fixture is empty')
    const extra = { ...first, name: 'extra-plugin' }
    const resolved = resolvedPlugins()
    const firstResolved = resolved[0]
    if (firstResolved === undefined) throw new Error('resolved plugin fixture is empty')

    expect(() => wrapper.validateCanonicalPluginRegistry({ plugins: resolved.slice(1) })).toThrow(/moe/)
    expect(() => wrapper.validateCanonicalPluginRegistry({ plugins: resolved }, [...canonical, extra])).toThrow(/extra-plugin/)
    expect(() => wrapper.validateCanonicalPluginRegistry({ plugins: [...resolved, firstResolved] })).toThrow(/moe/)
    expect(() => wrapper.validateCanonicalPluginRegistry({ plugins: resolved }, [...canonical, first])).toThrow(/moe/)
  })

  it('rejects duplicate canonical harness activations and duplicate Mint exclusions', () => {
    const canonical = PLUGINS as CanonicalPlugin[]
    const duplicateHarness = canonical.map((plugin, index) => index === 0
      ? { ...plugin, harnesses: [...plugin.harnesses, plugin.harnesses[0]] }
      : plugin)
    const plugins = resolvedPlugins()
    const statusline = plugins.at(-1)
    if (statusline === undefined) throw new Error('resolved statusline fixture is missing')
    statusline.config.harnesses.exclude.push('cursor')

    expect(() => wrapper.validateCanonicalPluginRegistry({ plugins: resolvedPlugins() }, duplicateHarness)).toThrow(/moe/)
    expect(() => wrapper.validateCanonicalPluginRegistry({ plugins })).toThrow(/moe/)
  })

  it.each(['darwin', 'linux'])('accepts the supported %s host contract', (platform) => {
    let changedTo: string | undefined
    wrapper.validateHostContract({
      nodeVersion: '24.1.0',
      platform,
      repositoryRoot: '/fixture/repository',
      chdir: (value: string) => {
        changedTo = value
      },
    })
    expect(changedTo).toBe('/fixture/repository')
  })

  it('rejects native Windows with a stable WSL2 diagnostic without treating WSL2 as win32', () => {
    expect(() => wrapper.validateHostContract({
      nodeVersion: '24.1.0',
      platform: 'win32',
      chdir: () => undefined,
    })).toThrowError(expect.objectContaining({
      code: 'MINT_HOST_PLATFORM_UNSUPPORTED',
      action: 'run Mint inside WSL2; native Windows generation and recovery are not supported',
    }))
    expect(() => wrapper.validateHostContract({
      nodeVersion: '24.1.0',
      platform: 'linux',
      chdir: () => undefined,
    })).not.toThrow()
  })

  it('rejects native Windows before recovery changes directory, discovers a journal, or mutates outputs', async () => {
    const operations: string[] = []
    const errors: string[] = []
    const status = await recovery.executeMintRecoveryCli({
      nodeVersion: '24.1.0',
      platform: 'win32',
      args: ['--root', '/fixture/repository'],
      currentDirectory: '/fixture/current',
      chdir: () => operations.push('chdir'),
      discoverJournal: () => {
        operations.push('discover')
        return '.moe-mint-generation-test.json'
      },
      recover: () => operations.push('recover'),
    }, { error: (message: string) => errors.push(message) })

    expect(status).toBe(1)
    expect(operations).toEqual([])
    expect(errors).toEqual([expect.stringContaining('code: MINT_HOST_PLATFORM_UNSUPPORTED')])
    expect(errors[0]).toContain('run Mint inside WSL2')
  })

  it.each(['darwin', 'linux'])('allows recovery discovery and mutation on supported %s hosts', async (platform) => {
    const operations: string[] = []
    const status = await recovery.executeMintRecoveryCli({
      nodeVersion: '24.1.0',
      platform,
      args: ['--root', '/fixture/repository'],
      currentDirectory: '/fixture/current',
      chdir: (value: string) => operations.push(`chdir:${value}`),
      discoverJournal: (explicit: string | undefined) => {
        operations.push(`discover:${explicit ?? 'none'}`)
        return '.moe-mint-generation-test.json'
      },
      recover: ({ journalPath }: { journalPath: string }) => operations.push(`recover:${journalPath}`),
      log: (message: string) => operations.push(`log:${message}`),
    }, { error: () => undefined })

    expect(status).toBe(0)
    expect(operations).toEqual([
      'chdir:/fixture/repository',
      'discover:none',
      'recover:.moe-mint-generation-test.json',
      'log:Recovered generated outputs from .moe-mint-generation-test.json',
    ])
  })

  it('executes the pnpm-mint orchestration and cleans only its nonce when plugin six fails', async () => {
    const root = generationRoot()
    const before = canonicalBytes(root)
    const unrelated = join(root, 'plugins.next-unrelated')
    mkdirSync(unrelated)
    let transaction: ReturnType<typeof transactionModule.createGenerationTransaction> | undefined
    const platform = { identity: 'one-resolved-platform' }
    const errors: string[] = []

    const status = await wrapper.executeMintPluginsCli({
      repositoryRoot: root,
      host: host(root),
      nonceFactory: () => FIXED_NONCE,
      transactionFactory: (nonce: string) => {
        transaction = transactionModule.createGenerationTransaction(nonce)
        return transaction
      },
      validateRegistry: () => undefined,
      loadRuntime: async () => ({
        resolvePlatform: (repoRoot: string) => {
          expect(repoRoot).toBe(root)
          return platform
        },
        assembleArtifactSet: ({ repoRoot, platform: supplied, destinationRoot }: Record<string, unknown>) => {
          expect(repoRoot).toBe(root)
          expect(supplied).toBe(platform)
          expect(destinationRoot).toBe(join(root, `plugins.next-${FIXED_NONCE}`))
          mkdirSync(destinationRoot as string, { recursive: true })
          for (let index = 1; index <= 6; index += 1) {
            if (index === 6) throw new Error('controlled plugin six failure')
            writeFileSync(join(destinationRoot as string, `plugin-${index}`), `${index}\n`)
          }
          return artifacts()
        },
        projections: {
          renderMarketplace: () => { throw new Error('projection must not run') },
          renderPublicCatalog: () => { throw new Error('projection must not run') },
          resolvePublishMatrix: () => { throw new Error('projection must not run') },
        },
      }),
    }, { error: (message: string) => errors.push(message) })

    expect(status).toBe(1)
    expect(errors.join('\n')).toContain('controlled plugin six failure')
    expect(transaction).toBeDefined()
    expect(transaction?.journal.transactionId).toBe(FIXED_NONCE)
    expect(canonicalBytes(root)).toEqual(before)
    for (const target of transaction?.journal.targets ?? []) {
      expect(existsSync(join(root, target.next))).toBe(false)
      expect(existsSync(join(root, target.backup))).toBe(false)
    }
    expect(existsSync(join(root, `.moe-mint-generation-${FIXED_NONCE}.json`))).toBe(false)
    expect(existsSync(unrelated)).toBe(true)
  })

  it('passes exact assembly records and one factory nonce through both projections and replacement', async () => {
    const root = generationRoot()
    const assembled = artifacts()
    const platform = { identity: 'one-resolved-platform' }
    const seenRecords: unknown[][] = []
    const writes: string[] = []
    let replacement: ReturnType<typeof transactionModule.createGenerationTransaction> | undefined

    const status = await wrapper.executeMintPluginsCli({
      repositoryRoot: root,
      host: host(root),
      nonceFactory: () => FIXED_NONCE,
      validateRegistry: () => undefined,
      loadRuntime: async () => ({
        resolvePlatform: () => platform,
        assembleArtifactSet: () => assembled,
        projections: {
          renderMarketplace: (supplied: unknown, records: unknown[]) => {
            expect(supplied).toBe(platform)
            seenRecords.push(records)
            return 'marketplace\n'
          },
          renderPublicCatalog: (supplied: unknown, records: unknown[]) => {
            expect(supplied).toBe(platform)
            seenRecords.push(records)
            return 'catalog\n'
          },
          resolvePublishMatrix: (supplied: unknown, records: unknown[]) => {
            expect(supplied).toBe(platform)
            seenRecords.push(records)
            return []
          },
        },
      }),
      durableFileWriter: (filePath: string, body: string) => {
        mkdirSync(dirname(filePath), { recursive: true })
        writeFileSync(filePath, body)
        writes.push(filePath)
      },
      replaceOutputs: (value: ReturnType<typeof transactionModule.createGenerationTransaction>) => {
        replacement = value
      },
      log: () => undefined,
    }, { error: () => undefined })

    expect(status).toBe(0)
    expect(seenRecords).toHaveLength(3)
    for (const records of seenRecords) {
      expect(records).toEqual(assembled.map((artifact) => artifact.projection))
      records.forEach((record, index) => expect(record).toBe(assembled[index]?.projection))
    }
    expect(replacement?.journal.transactionId).toBe(FIXED_NONCE)
    expect(writes).toEqual([
      join(root, `.claude-plugin/marketplace.next-${FIXED_NONCE}.json`),
      join(root, `docs/moe/generated/plugin-catalog.next-${FIXED_NONCE}.md`),
    ])
  })

  it.each([
    {
      code: 'GENERATION_TRANSACTION_RECOVERY_FAILED',
      paths: ['.moe-mint-generation-wrappertestnonce.json'],
      action: 'preserve the journal and surviving paths',
    },
    {
      code: 'GENERATION_TRANSACTION_NEW_INSTALLED_DURABILITY_UNCERTAIN',
      paths: ['plugins', '.claude-plugin/marketplace.json', 'docs/moe/generated/plugin-catalog.md'],
      action: 'treat the new generation as installed and verify output parents',
    },
  ])('preserves $code fields at the primary wrapper boundary', async ({ code, paths, action }) => {
    const root = generationRoot()
    const output: string[] = []
    const status = await wrapper.executeMintPluginsCli({
      repositoryRoot: root,
      host: host(root),
      nonceFactory: () => FIXED_NONCE,
      validateRegistry: () => undefined,
      loadRuntime: async () => ({
        resolvePlatform: () => ({}),
        assembleArtifactSet: () => artifacts(),
        projections: {
          renderMarketplace: () => 'marketplace\n',
          renderPublicCatalog: () => 'catalog\n',
          resolvePublishMatrix: () => [],
        },
      }),
      replaceOutputs: () => {
        throw transactionError(code, paths, action)
      },
      log: () => undefined,
    }, { error: (message: string) => output.push(message) })

    expect(status).toBe(1)
    expect(output).toEqual([expect.stringContaining('Mint generation failed')])
    expect(output[0]).toContain(`code: ${code}`)
    expect(output[0]).toContain(`paths: ${paths.join(', ')}`)
    expect(output[0]).toContain(`action: ${action}`)
    expect(output[0]).toContain(`cause: ${code} cause`)
  })
})
