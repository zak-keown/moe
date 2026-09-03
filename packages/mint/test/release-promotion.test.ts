import { describe, it, expect } from 'vitest'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  computeDistTagActions,
  hasBlockingDistTagActions,
  movableActions,
  validateEvidenceForPromotion,
  promoteToStable,
  type PromotionInput,
} from '../src/release/promotion.js'
import type { PlatformCatalogV1, PluginCatalogRecordV1, CandidateLockV1 } from '../src/release/catalog.js'
import type { CertificationEvidenceV1, EvidenceExpectation, EvidenceProducer } from '../src/release/evidence.js'
import type { PlatformTag } from '../src/release/tag-policy.js'
import { createFakeReleaseStore } from './release-github-store.test.js'
import { createFakeNpmRegistry } from './release-npm-registry.test.js'

function fakePlugin(name: string, version = '0.1.5'): PluginCatalogRecordV1 {
  return {
    plugin: name,
    package: `@bubstack/moe-${name}`,
    version,
    artifact: {
      artifact_tree_sha256: 'a'.repeat(64),
      artifact_manifest_sha256: 'b'.repeat(64),
      tarball: { integrity: `sha512-${name}` as `sha512-${string}`, bytes: 1024 },
      mirror: { asset: `${name}.tgz`, sha256: `s${name}`.padEnd(64, '0') },
      legal: { files: {}, bundle_inventory_sha256: 'd'.repeat(64) },
      emitted_capabilities: {},
    },
    certification: [],
  }
}

const SIX_NAMES = ['core', 'backstory', 'memory', 'glass', 'crew', 'statusline'] as const

function sixPlugins(version = '0.1.5'): PluginCatalogRecordV1[] {
  return SIX_NAMES.map((n) => fakePlugin(n, version))
}

function fakeCatalog(overrides: Partial<PlatformCatalogV1> = {}): PlatformCatalogV1 {
  return {
    schema: 1,
    platform_version: '0.1.5-rc.1',
    channel: 'prerelease',
    source: {
      git_sha: '0'.repeat(40),
      lockfile_sha256: 'l'.repeat(64),
      platform_registry_schema: 1,
      platform_registry_sha256: 'r'.repeat(64),
      mint_version: '0.1.0',
    },
    plugins: sixPlugins(),
    ...overrides,
  }
}

function fakeProducer(): EvidenceProducer {
  return {
    kind: 'protected-ci',
    repository: 'bubstack/moe',
    workflow: 'certify-claude-macos.yml',
    workflow_sha: '0'.repeat(40),
    run_id: 'run-1',
    job_id: 'job-1',
    trigger_actor: 'release-bot',
    runner_image: 'macos-14',
    checkpoint: {
      environment: 'claude-maintenance',
      deployment_id: 'dep-1',
      approval_actor: 'reviewer',
      approved_at: '2026-01-01T00:00:00Z',
    },
  }
}

function fakeEvidence(plugin: PluginCatalogRecordV1, hasPredecessor: boolean): CertificationEvidenceV1 {
  return {
    schema: 1,
    result_id: `r-${plugin.plugin}`,
    subject: {
      plugin: plugin.plugin,
      package: plugin.package,
      version: plugin.version,
      artifact_tree_sha256: plugin.artifact.artifact_tree_sha256,
      artifact_manifest_sha256: plugin.artifact.artifact_manifest_sha256,
      tarball_integrity: plugin.artifact.tarball.integrity,
    },
    environment: { target: 'claude-code', os: 'macos', arch: 'arm64', runtimes: {} },
    lifecycle: {
      install: { id: 'install', outcome: 'pass', started_at: 't', completed_at: 't' },
      discovery: { id: 'discovery', outcome: 'pass', started_at: 't', completed_at: 't' },
      update: hasPredecessor
        ? { id: 'update', outcome: 'pass', started_at: 't', completed_at: 't' }
        : { id: 'update', outcome: 'skipped', started_at: 't', completed_at: 't', reason: 'NO_PREDECESSOR' },
      uninstall: { id: 'uninstall', outcome: 'pass', started_at: 't', completed_at: 't' },
    },
    capabilities: [],
    log: { asset: 'log.txt', sha256: 'c'.repeat(64), redacted: true },
    producer: fakeProducer(),
    overall: 'pass',
  }
}

function fakeExpectation(plugin: PluginCatalogRecordV1, hasPredecessor: boolean): EvidenceExpectation {
  return {
    plugin,
    preflight: {
      plugin: plugin.plugin,
      package: plugin.package,
      proposed_version: plugin.version,
      proposed: { state: 'absent' },
      predecessor: hasPredecessor
        ? { state: 'present', version: '0.1.4', integrity: 'sha512-prev' }
        : { state: 'absent' },
    },
    target: 'claude-code',
    os: 'macos',
    arch: 'arm64',
    expectedCapabilities: [],
    producer: {
      repository: 'bubstack/moe',
      workflow: 'certify-claude-macos.yml',
      workflowSha: '0'.repeat(40),
      environment: 'claude-maintenance',
    },
  }
}

function stableTag(): PlatformTag {
  return { raw: 'v0.1.5', platformVersion: '0.1.5', semverCore: '0.1.5', channel: 'stable', npmTag: 'latest' }
}

function candidateTag(): PlatformTag {
  return { raw: 'v0.1.5-rc.1', platformVersion: '0.1.5-rc.1', semverCore: '0.1.5', channel: 'prerelease', npmTag: 'next' }
}

function buildEvidenceAndExpectations(catalog: PlatformCatalogV1) {
  const reports = new Map<string, CertificationEvidenceV1>()
  const expectations = new Map<string, EvidenceExpectation>()
  for (const plugin of catalog.plugins) {
    const hasPredecessor = plugin.plugin !== 'statusline'
    reports.set(plugin.plugin, fakeEvidence(plugin, hasPredecessor))
    expectations.set(plugin.plugin, fakeExpectation(plugin, hasPredecessor))
  }
  return { reports, expectations }
}

describe('computeDistTagActions', () => {
  it('returns move for all plugins when none have latest', () => {
    const catalog = fakeCatalog()
    const state = new Map(
      catalog.plugins.map((p) => [p.plugin, { state: 'present' as const, integrity: p.artifact.tarball.integrity }]),
    )
    const actions = computeDistTagActions(catalog, state)
    expect(actions.every((a) => a.kind === 'move')).toBe(true)
    expect(actions).toHaveLength(6)
  })

  it('returns already-latest for plugins whose version is current latest', () => {
    const catalog = fakeCatalog()
    const state = new Map(
      catalog.plugins.map((p) => [p.plugin, {
        state: 'present' as const,
        integrity: p.artifact.tarball.integrity,
        currentLatest: p.version,
      }]),
    )
    const actions = computeDistTagActions(catalog, state)
    expect(actions.every((a) => a.kind === 'already-latest')).toBe(true)
  })

  it('blocks on unpublished plugin', () => {
    const catalog = fakeCatalog()
    const state = new Map(
      catalog.plugins.map((p) => [p.plugin, { state: 'absent' as const }]),
    )
    const actions = computeDistTagActions(catalog, state)
    expect(actions.every((a) => a.kind === 'block')).toBe(true)
  })

  it('blocks on integrity mismatch', () => {
    const catalog = fakeCatalog()
    const state = new Map(
      catalog.plugins.map((p) => [p.plugin, { state: 'present' as const, integrity: 'sha512-WRONG' }]),
    )
    const actions = computeDistTagActions(catalog, state)
    expect(actions.every((a) => a.kind === 'block')).toBe(true)
    expect((actions[0] as any).code).toBe('PROMOTION_INTEGRITY_MISMATCH')
  })

  it('blocks when existing latest is newer', () => {
    const catalog = fakeCatalog()
    const state = new Map(
      catalog.plugins.map((p) => [p.plugin, {
        state: 'present' as const,
        integrity: p.artifact.tarball.integrity,
        currentLatest: '9.9.9',
      }]),
    )
    const actions = computeDistTagActions(catalog, state)
    expect(actions.every((a) => a.kind === 'block')).toBe(true)
    expect((actions[0] as any).code).toBe('PROMOTION_WOULD_DOWNGRADE')
  })

  it('handles partial promotion (mix of already-latest and move)', () => {
    const catalog = fakeCatalog()
    const state = new Map(catalog.plugins.map((p, i) => [p.plugin, {
      state: 'present' as const,
      integrity: p.artifact.tarball.integrity,
      currentLatest: i < 3 ? p.version : '0.1.4',
    }]))
    const actions = computeDistTagActions(catalog, state)
    expect(actions.filter((a) => a.kind === 'already-latest')).toHaveLength(3)
    expect(actions.filter((a) => a.kind === 'move')).toHaveLength(3)
  })

  it('blocks when registry state is missing', () => {
    const catalog = fakeCatalog()
    const state = new Map<string, any>()
    const actions = computeDistTagActions(catalog, state)
    expect(actions.every((a) => a.kind === 'block')).toBe(true)
    expect((actions[0] as any).code).toBe('PROMOTION_NO_REGISTRY_STATE')
  })
})

describe('hasBlockingDistTagActions', () => {
  it('returns false for all-move actions', () => {
    expect(hasBlockingDistTagActions([{ kind: 'move', plugin: 'a', package: '@x/a', version: '1.0.0' }])).toBe(false)
  })

  it('returns true for blocked actions', () => {
    expect(hasBlockingDistTagActions([{ kind: 'block', plugin: 'a', code: 'X', message: 'x' }])).toBe(true)
  })
})

describe('movableActions', () => {
  it('filters to move actions', () => {
    const actions = [
      { kind: 'move' as const, plugin: 'a', package: '@x/a', version: '1.0.0' },
      { kind: 'already-latest' as const, plugin: 'b' },
    ]
    const movable = movableActions(actions)
    expect(movable).toHaveLength(1)
    expect(movable[0]!.plugin).toBe('a')
  })
})

describe('validateEvidenceForPromotion', () => {
  it('returns certifications for valid evidence', () => {
    const catalog = fakeCatalog()
    const { reports, expectations } = buildEvidenceAndExpectations(catalog)
    const certs = validateEvidenceForPromotion(catalog, reports, expectations)
    expect(certs.size).toBe(6)
    for (const [name, tuples] of certs) {
      expect(tuples).toHaveLength(1)
      const status = name === 'statusline' ? 'preview' : 'certified'
      expect(tuples[0]!.status).toBe(status)
    }
  })

  it('rejects when evidence is missing for a plugin', () => {
    const catalog = fakeCatalog()
    const { reports, expectations } = buildEvidenceAndExpectations(catalog)
    reports.delete('core')
    expect(() => validateEvidenceForPromotion(catalog, reports, expectations)).toThrow(/evidence/)
  })

  it('rejects when expectations are missing for a plugin', () => {
    const catalog = fakeCatalog()
    const { reports, expectations } = buildEvidenceAndExpectations(catalog)
    expectations.delete('core')
    expect(() => validateEvidenceForPromotion(catalog, reports, expectations)).toThrow(/expectation/)
  })

  it('rejects when evidence digest does not match', () => {
    const catalog = fakeCatalog()
    const { reports, expectations } = buildEvidenceAndExpectations(catalog)
    const coreEvidence = reports.get('core')!
    reports.set('core', { ...coreEvidence, subject: { ...coreEvidence.subject, artifact_tree_sha256: 'x'.repeat(64) } })
    expect(() => validateEvidenceForPromotion(catalog, reports, expectations)).toThrow(/tree SHA-256/)
  })
})

async function withTempTarballs<T>(catalog: PlatformCatalogV1, fn: (tarballs: Map<string, string>) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'promo-test-'))
  try {
    const tarballs = new Map<string, string>()
    for (const p of catalog.plugins) {
      const path = join(dir, `${p.plugin}.tgz`)
      await writeFile(path, `fake-tarball-${p.plugin}`)
      tarballs.set(p.plugin, path)
    }
    return await fn(tarballs)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

describe('promoteToStable', () => {
  it('promotes all six plugins with zero publish calls', async () => {
    const catalog = fakeCatalog()
    const { reports, expectations } = buildEvidenceAndExpectations(catalog)
    const store = createFakeReleaseStore()
    const registry = createFakeNpmRegistry()

    for (const p of catalog.plugins) {
      const pkg = registry.packages.get(p.package) ?? new Map()
      pkg.set(p.version, { integrity: p.artifact.tarball.integrity, distTags: ['next'] })
      registry.packages.set(p.package, pkg)
    }

    await withTempTarballs(catalog, async (tarballs) => {
      const input: PromotionInput = {
        stableTag: stableTag(),
        candidateTag: candidateTag(),
        candidateCatalog: catalog,
        candidateLock: {} as CandidateLockV1,
        evidenceReports: reports,
        evidenceExpectations: expectations,
        downloadedTarballs: tarballs,
      }

      const result = await promoteToStable(input, { releaseStore: store, npmRegistry: registry })

      expect(registry.publishLog).toEqual([])
      expect(registry.distTagLog).toHaveLength(6)
      expect(result.stableCatalog.channel).toBe('stable')
      expect(result.stableCatalog.plugins).toHaveLength(6)
      expect(result.stableRelease.draft).toBe(false)
    })
  })

  it('handles already-promoted plugins without error', async () => {
    const catalog = fakeCatalog()
    const { reports, expectations } = buildEvidenceAndExpectations(catalog)
    const store = createFakeReleaseStore()
    const registry = createFakeNpmRegistry()

    for (const p of catalog.plugins) {
      const pkg = registry.packages.get(p.package) ?? new Map()
      pkg.set(p.version, { integrity: p.artifact.tarball.integrity, distTags: ['next', 'latest'] })
      registry.packages.set(p.package, pkg)
    }

    await withTempTarballs(catalog, async (tarballs) => {
      const input: PromotionInput = {
        stableTag: stableTag(),
        candidateTag: candidateTag(),
        candidateCatalog: catalog,
        candidateLock: {} as CandidateLockV1,
        evidenceReports: reports,
        evidenceExpectations: expectations,
        downloadedTarballs: tarballs,
      }

      const result = await promoteToStable(input, { releaseStore: store, npmRegistry: registry })

      expect(registry.distTagLog).toEqual([])
      expect(result.actions.every((a) => a.kind === 'already-latest')).toBe(true)
    })
  })

  it('rejects promotion with missing next version', async () => {
    const catalog = fakeCatalog()
    const { reports, expectations } = buildEvidenceAndExpectations(catalog)
    const store = createFakeReleaseStore()
    const registry = createFakeNpmRegistry()

    await withTempTarballs(catalog, async (tarballs) => {
      const input: PromotionInput = {
        stableTag: stableTag(),
        candidateTag: candidateTag(),
        candidateCatalog: catalog,
        candidateLock: {} as CandidateLockV1,
        evidenceReports: reports,
        evidenceExpectations: expectations,
        downloadedTarballs: tarballs,
      }

      await expect(promoteToStable(input, { releaseStore: store, npmRegistry: registry })).rejects.toThrow(/blocked/)
    })
  })

  it('preserves artifact records byte-for-byte in stable catalog', async () => {
    const catalog = fakeCatalog()
    const { reports, expectations } = buildEvidenceAndExpectations(catalog)
    const store = createFakeReleaseStore()
    const registry = createFakeNpmRegistry()

    for (const p of catalog.plugins) {
      const pkg = registry.packages.get(p.package) ?? new Map()
      pkg.set(p.version, { integrity: p.artifact.tarball.integrity, distTags: ['next'] })
      registry.packages.set(p.package, pkg)
    }

    await withTempTarballs(catalog, async (tarballs) => {
      const input: PromotionInput = {
        stableTag: stableTag(),
        candidateTag: candidateTag(),
        candidateCatalog: catalog,
        candidateLock: {} as CandidateLockV1,
        evidenceReports: reports,
        evidenceExpectations: expectations,
        downloadedTarballs: tarballs,
      }

      const result = await promoteToStable(input, { releaseStore: store, npmRegistry: registry })

      for (const plugin of result.stableCatalog.plugins) {
        const candidate = catalog.plugins.find((p) => p.plugin === plugin.plugin)!
        expect(JSON.stringify(plugin.artifact)).toBe(JSON.stringify(candidate.artifact))
      }
    })
  })

  it('rejects source SHA mismatch via wrong stable tag', async () => {
    const catalog = fakeCatalog()
    const { reports, expectations } = buildEvidenceAndExpectations(catalog)
    const store = createFakeReleaseStore()
    const registry = createFakeNpmRegistry()

    await withTempTarballs(catalog, async (tarballs) => {
      const wrongStable: PlatformTag = { raw: 'v0.1.5-rc.2', platformVersion: '0.1.5-rc.2', semverCore: '0.1.5', channel: 'prerelease', npmTag: 'next' }
      const input: PromotionInput = {
        stableTag: wrongStable,
        candidateTag: candidateTag(),
        candidateCatalog: catalog,
        candidateLock: {} as CandidateLockV1,
        evidenceReports: reports,
        evidenceExpectations: expectations,
        downloadedTarballs: tarballs,
      }

      await expect(promoteToStable(input, { releaseStore: store, npmRegistry: registry })).rejects.toThrow(/stable/)
    })
  })

  it('binds evidence checksums to certification tuples', async () => {
    const catalog = fakeCatalog()
    const { reports, expectations } = buildEvidenceAndExpectations(catalog)
    const store = createFakeReleaseStore()
    const registry = createFakeNpmRegistry()

    for (const p of catalog.plugins) {
      const pkg = registry.packages.get(p.package) ?? new Map()
      pkg.set(p.version, { integrity: p.artifact.tarball.integrity, distTags: ['next'] })
      registry.packages.set(p.package, pkg)
    }

    await withTempTarballs(catalog, async (tarballs) => {
      const input: PromotionInput = {
        stableTag: stableTag(),
        candidateTag: candidateTag(),
        candidateCatalog: catalog,
        candidateLock: {} as CandidateLockV1,
        evidenceReports: reports,
        evidenceExpectations: expectations,
        downloadedTarballs: tarballs,
      }

      const result = await promoteToStable(input, { releaseStore: store, npmRegistry: registry })

      for (const plugin of result.stableCatalog.plugins) {
        expect(plugin.certification).toHaveLength(1)
        const tuple = plugin.certification[0]!
        expect(tuple.target).toBe('claude-code')
        expect(tuple.evidence).toBeDefined()
        expect(tuple.evidence!.result_id).toBe(`r-${plugin.plugin}`)
        if (plugin.plugin === 'statusline') {
          expect(tuple.status).toBe('preview')
        } else {
          expect(tuple.status).toBe('certified')
        }
      }
    })
  })
})
