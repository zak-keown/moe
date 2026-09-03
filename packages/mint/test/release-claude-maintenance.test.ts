import { describe, it, expect, } from 'vitest'
import { join } from 'node:path'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import {
  runClaudeMaintenance,
  type CheckResult,
  type ClaudeMaintenanceInput,
  type PluginSmokeContext,
  type TargetLifecycleDriver,
} from '../src/release/claude-maintenance.js'
import type { PluginCatalogRecordV1, } from '../src/release/catalog.js'
import type { EvidenceProducer } from '../src/release/evidence.js'
import type { CapabilityId } from '../src/vocabulary.js'

function pass(): CheckResult {
  return {
    outcome: 'pass',
    startedAt: '2026-01-01T00:00:00Z',
    completedAt: '2026-01-01T00:01:00Z',
    redactedLog: 'ok',
  }
}

function fail(): CheckResult {
  return {
    outcome: 'fail',
    startedAt: '2026-01-01T00:00:00Z',
    completedAt: '2026-01-01T00:01:00Z',
    redactedLog: 'FAIL',
  }
}

function fakePlugin(name: string): PluginCatalogRecordV1 {
  return {
    plugin: name,
    package: `@bubstack/moe-${name}`,
    version: '0.1.5',
    artifact: {
      artifact_tree_sha256: 'a'.repeat(64),
      artifact_manifest_sha256: 'b'.repeat(64),
      tarball: { integrity: 'sha512-AAAA' as `sha512-${string}`, bytes: 1024 },
      mirror: { asset: `${name}.tgz`, sha256: 'c'.repeat(64) },
      legal: { files: {}, bundle_inventory_sha256: 'd'.repeat(64) },
      emitted_capabilities: {},
    },
    certification: [],
  }
}

function fakePreflightEntry(name: string, hasPredecessor: boolean) {
  return {
    plugin: name,
    package: `@bubstack/moe-${name}`,
    proposed_version: '0.1.5',
    proposed: { state: 'absent' as const },
    predecessor: hasPredecessor
      ? { state: 'present' as const, version: '0.1.4', integrity: 'sha512-prev' }
      : { state: 'absent' as const },
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

function createFakeDriver(overrides: Partial<TargetLifecycleDriver> = {}): TargetLifecycleDriver & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    async install(ctx) {
      calls.push(`install:${ctx.plugin.plugin}`)
      return pass()
    },
    async discover(ctx) {
      calls.push(`discover:${ctx.plugin.plugin}`)
      return pass()
    },
    async update(ctx) {
      calls.push(`update:${ctx.plugin.plugin}`)
      return pass()
    },
    async invokeCapability(cap, ctx) {
      calls.push(`capability:${cap}:${ctx.plugin.plugin}`)
      return pass()
    },
    async uninstall(ctx) {
      calls.push(`uninstall:${ctx.plugin.plugin}`)
      return pass()
    },
    ...overrides,
  }
}

async function withOutputDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'claude-maint-test-'))
  try {
    return await fn(dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

function buildInput(outputDir: string, overrides: Partial<ClaudeMaintenanceInput> = {}): ClaudeMaintenanceInput {
  const plugins = [fakePlugin('core'), fakePlugin('statusline')]
  return {
    candidateTag: 'v0.1.5-rc.1',
    catalog: { plugins },
    preflight: {
      schema: 1,
      platform_version: '0.1.5-rc.1',
      source_sha: '0'.repeat(40),
      plugins: [
        fakePreflightEntry('core', true),
        fakePreflightEntry('statusline', false),
      ],
    },
    tarballs: new Map([
      ['core', '/fake/core.tgz'],
      ['statusline', '/fake/statusline.tgz'],
    ]),
    producer: fakeProducer(),
    outputDir,
    expectedCapabilities: new Map<string, readonly CapabilityId[]>([
      ['core', ['skill-discovery']],
      ['statusline', []],
    ]),
    ...overrides,
  }
}

describe('runClaudeMaintenance', () => {
  it('calls driver in exact lifecycle order', async () => {
    await withOutputDir(async (dir) => {
      const driver = createFakeDriver()
      const input = buildInput(dir, {
        catalog: { plugins: [fakePlugin('core')] },
        preflight: {
          schema: 1,
          platform_version: '0.1.5-rc.1',
          source_sha: '0'.repeat(40),
          plugins: [fakePreflightEntry('core', true)],
        },
        tarballs: new Map([['core', '/fake/core.tgz']]),
        expectedCapabilities: new Map([['core', ['skill-discovery'] as readonly CapabilityId[]]]),
      })
      await runClaudeMaintenance(input, driver)
      expect(driver.calls).toEqual([
        'install:core',
        'discover:core',
        'update:core',
        'capability:skill-discovery:core',
        'uninstall:core',
      ])
    })
  })

  it('does not call driver.update when predecessor is absent', async () => {
    await withOutputDir(async (dir) => {
      const driver = createFakeDriver()
      const input = buildInput(dir, {
        catalog: { plugins: [fakePlugin('statusline')] },
        preflight: {
          schema: 1,
          platform_version: '0.1.5-rc.1',
          source_sha: '0'.repeat(40),
          plugins: [fakePreflightEntry('statusline', false)],
        },
        tarballs: new Map([['statusline', '/fake/statusline.tgz']]),
        expectedCapabilities: new Map([['statusline', [] as readonly CapabilityId[]]]),
      })
      await runClaudeMaintenance(input, driver)
      expect(driver.calls).not.toContain('update:statusline')
      expect(driver.calls).toEqual([
        'install:statusline',
        'discover:statusline',
        'uninstall:statusline',
      ])
    })
  })

  it('writes skipped update with NO_PREDECESSOR reason for first-publish', async () => {
    await withOutputDir(async (dir) => {
      const driver = createFakeDriver()
      const input = buildInput(dir, {
        catalog: { plugins: [fakePlugin('statusline')] },
        preflight: {
          schema: 1,
          platform_version: '0.1.5-rc.1',
          source_sha: '0'.repeat(40),
          plugins: [fakePreflightEntry('statusline', false)],
        },
        tarballs: new Map([['statusline', '/fake/statusline.tgz']]),
        expectedCapabilities: new Map([['statusline', [] as readonly CapabilityId[]]]),
      })
      const result = await runClaudeMaintenance(input, driver)
      const evidence = result.reports[0]!.evidence
      expect(evidence.lifecycle.update.outcome).toBe('skipped')
      expect(evidence.lifecycle.update.reason).toBe('NO_PREDECESSOR')
    })
  })

  it('passes predecessor version to context', async () => {
    await withOutputDir(async (dir) => {
      let capturedCtx: PluginSmokeContext | undefined
      const driver = createFakeDriver({
        async install(ctx) {
          capturedCtx = ctx
          return pass()
        },
      })
      const input = buildInput(dir, {
        catalog: { plugins: [fakePlugin('core')] },
        preflight: {
          schema: 1,
          platform_version: '0.1.5-rc.1',
          source_sha: '0'.repeat(40),
          plugins: [fakePreflightEntry('core', true)],
        },
        tarballs: new Map([['core', '/fake/core.tgz']]),
        expectedCapabilities: new Map([['core', [] as readonly CapabilityId[]]]),
      })
      await runClaudeMaintenance(input, driver)
      expect(capturedCtx!.predecessorVersion).toBe('0.1.4')
    })
  })

  it('passes null predecessor for first-publish', async () => {
    await withOutputDir(async (dir) => {
      let capturedCtx: PluginSmokeContext | undefined
      const driver = createFakeDriver({
        async install(ctx) {
          capturedCtx = ctx
          return pass()
        },
      })
      const input = buildInput(dir, {
        catalog: { plugins: [fakePlugin('statusline')] },
        preflight: {
          schema: 1,
          platform_version: '0.1.5-rc.1',
          source_sha: '0'.repeat(40),
          plugins: [fakePreflightEntry('statusline', false)],
        },
        tarballs: new Map([['statusline', '/fake/statusline.tgz']]),
        expectedCapabilities: new Map([['statusline', [] as readonly CapabilityId[]]]),
      })
      await runClaudeMaintenance(input, driver)
      expect(capturedCtx!.predecessorVersion).toBeNull()
    })
  })

  it('produces one report per plugin with correct evidence shape', async () => {
    await withOutputDir(async (dir) => {
      const driver = createFakeDriver()
      const input = buildInput(dir)
      const result = await runClaudeMaintenance(input, driver)
      expect(result.reports).toHaveLength(2)
      expect(result.reports[0]!.plugin).toBe('core')
      expect(result.reports[1]!.plugin).toBe('statusline')

      const coreEvidence = result.reports[0]!.evidence
      expect(coreEvidence.schema).toBe(1)
      expect(coreEvidence.subject.plugin).toBe('core')
      expect(coreEvidence.environment.target).toBe('claude-code')
      expect(coreEvidence.environment.os).toBe('macos')
      expect(coreEvidence.overall).toBe('pass')
    })
  })

  it('writes evidence JSON and log files', async () => {
    await withOutputDir(async (dir) => {
      const driver = createFakeDriver()
      const input = buildInput(dir, {
        catalog: { plugins: [fakePlugin('core')] },
        preflight: {
          schema: 1,
          platform_version: '0.1.5-rc.1',
          source_sha: '0'.repeat(40),
          plugins: [fakePreflightEntry('core', true)],
        },
        tarballs: new Map([['core', '/fake/core.tgz']]),
        expectedCapabilities: new Map([['core', ['skill-discovery'] as readonly CapabilityId[]]]),
      })
      const result = await runClaudeMaintenance(input, driver)
      const report = result.reports[0]!

      const evidenceJson = JSON.parse(await readFile(report.evidencePath, 'utf8'))
      expect(evidenceJson.schema).toBe(1)
      expect(evidenceJson.subject.plugin).toBe('core')

      const logContent = await readFile(report.logPath, 'utf8')
      expect(logContent).toContain('install: pass')
      expect(logContent).toContain('discovery: pass')
      expect(logContent).toContain('capability skill-discovery: pass')
      expect(logContent).toContain('uninstall: pass')
    })
  })

  it('invokes capabilities in expected set order', async () => {
    await withOutputDir(async (dir) => {
      const driver = createFakeDriver()
      const caps: CapabilityId[] = ['skill-discovery', 'mcp-registration']
      const input = buildInput(dir, {
        catalog: { plugins: [fakePlugin('core')] },
        preflight: {
          schema: 1,
          platform_version: '0.1.5-rc.1',
          source_sha: '0'.repeat(40),
          plugins: [fakePreflightEntry('core', true)],
        },
        tarballs: new Map([['core', '/fake/core.tgz']]),
        expectedCapabilities: new Map([['core', caps]]),
      })
      await runClaudeMaintenance(input, driver)
      expect(driver.calls).toContain('capability:skill-discovery:core')
      expect(driver.calls).toContain('capability:mcp-registration:core')
      const sdIdx = driver.calls.indexOf('capability:skill-discovery:core')
      const mcpIdx = driver.calls.indexOf('capability:mcp-registration:core')
      expect(sdIdx).toBeLessThan(mcpIdx)
    })
  })

  it('sets overall to fail when a lifecycle check fails', async () => {
    await withOutputDir(async (dir) => {
      const driver = createFakeDriver({
        async discover() { return fail() },
      })
      const input = buildInput(dir, {
        catalog: { plugins: [fakePlugin('core')] },
        preflight: {
          schema: 1,
          platform_version: '0.1.5-rc.1',
          source_sha: '0'.repeat(40),
          plugins: [fakePreflightEntry('core', true)],
        },
        tarballs: new Map([['core', '/fake/core.tgz']]),
        expectedCapabilities: new Map([['core', [] as readonly CapabilityId[]]]),
      })
      const result = await runClaudeMaintenance(input, driver)
      expect(result.reports[0]!.evidence.overall).toBe('fail')
    })
  })

  it('sets overall to fail when a capability check fails', async () => {
    await withOutputDir(async (dir) => {
      const driver = createFakeDriver({
        async invokeCapability() { return fail() },
      })
      const input = buildInput(dir, {
        catalog: { plugins: [fakePlugin('core')] },
        preflight: {
          schema: 1,
          platform_version: '0.1.5-rc.1',
          source_sha: '0'.repeat(40),
          plugins: [fakePreflightEntry('core', true)],
        },
        tarballs: new Map([['core', '/fake/core.tgz']]),
        expectedCapabilities: new Map([['core', ['skill-discovery'] as readonly CapabilityId[]]]),
      })
      const result = await runClaudeMaintenance(input, driver)
      expect(result.reports[0]!.evidence.overall).toBe('fail')
    })
  })

  it('attempts cleanup uninstall on driver error then rethrows', async () => {
    await withOutputDir(async (dir) => {
      const calls: string[] = []
      const driver = createFakeDriver({
        async install() {
          calls.push('install')
          throw new Error('boom')
        },
        async uninstall(_ctx) {
          calls.push('cleanup-uninstall')
          return pass()
        },
      })
      driver.calls = calls
      const input = buildInput(dir, {
        catalog: { plugins: [fakePlugin('core')] },
        preflight: {
          schema: 1,
          platform_version: '0.1.5-rc.1',
          source_sha: '0'.repeat(40),
          plugins: [fakePreflightEntry('core', true)],
        },
        tarballs: new Map([['core', '/fake/core.tgz']]),
        expectedCapabilities: new Map([['core', [] as readonly CapabilityId[]]]),
      })
      await expect(runClaudeMaintenance(input, driver)).rejects.toThrow('boom')
      expect(calls).toContain('cleanup-uninstall')
    })
  })

  it('throws when plugin is missing from preflight', async () => {
    await withOutputDir(async (dir) => {
      const driver = createFakeDriver()
      const input = buildInput(dir, {
        catalog: { plugins: [fakePlugin('unknown')] },
        tarballs: new Map([['unknown', '/fake/unknown.tgz']]),
      })
      await expect(runClaudeMaintenance(input, driver)).rejects.toThrow(/preflight/)
    })
  })

  it('throws when tarball is missing', async () => {
    await withOutputDir(async (dir) => {
      const driver = createFakeDriver()
      const input = buildInput(dir, {
        catalog: { plugins: [fakePlugin('core')] },
        tarballs: new Map(),
      })
      await expect(runClaudeMaintenance(input, driver)).rejects.toThrow(/tarball/)
    })
  })

  it('provides isolated config and project dirs', async () => {
    await withOutputDir(async (dir) => {
      let capturedCtx: PluginSmokeContext | undefined
      const driver = createFakeDriver({
        async install(ctx) {
          capturedCtx = ctx
          return pass()
        },
      })
      const input = buildInput(dir, {
        catalog: { plugins: [fakePlugin('core')] },
        preflight: {
          schema: 1,
          platform_version: '0.1.5-rc.1',
          source_sha: '0'.repeat(40),
          plugins: [fakePreflightEntry('core', true)],
        },
        tarballs: new Map([['core', '/fake/core.tgz']]),
        expectedCapabilities: new Map([['core', [] as readonly CapabilityId[]]]),
      })
      await runClaudeMaintenance(input, driver)
      expect(capturedCtx!.configDir).toContain('config/core')
      expect(capturedCtx!.projectDir).toContain('project/core')
    })
  })

  it('binds evidence subjects to exact catalog artifact digests', async () => {
    await withOutputDir(async (dir) => {
      const driver = createFakeDriver()
      const plugin = fakePlugin('core')
      const input = buildInput(dir, {
        catalog: { plugins: [plugin] },
        preflight: {
          schema: 1,
          platform_version: '0.1.5-rc.1',
          source_sha: '0'.repeat(40),
          plugins: [fakePreflightEntry('core', true)],
        },
        tarballs: new Map([['core', '/fake/core.tgz']]),
        expectedCapabilities: new Map([['core', [] as readonly CapabilityId[]]]),
      })
      const result = await runClaudeMaintenance(input, driver)
      const subject = result.reports[0]!.evidence.subject
      expect(subject.artifact_tree_sha256).toBe(plugin.artifact.artifact_tree_sha256)
      expect(subject.artifact_manifest_sha256).toBe(plugin.artifact.artifact_manifest_sha256)
      expect(subject.tarball_integrity).toBe(plugin.artifact.tarball.integrity)
    })
  })

  it('produces both certified and preview dispositions in a mixed set', async () => {
    await withOutputDir(async (dir) => {
      const driver = createFakeDriver()
      const input = buildInput(dir)
      const result = await runClaudeMaintenance(input, driver)

      const coreEvidence = result.reports[0]!.evidence
      expect(coreEvidence.lifecycle.update.outcome).toBe('pass')

      const statuslineEvidence = result.reports[1]!.evidence
      expect(statuslineEvidence.lifecycle.update.outcome).toBe('skipped')
      expect(statuslineEvidence.lifecycle.update.reason).toBe('NO_PREDECESSOR')
    })
  })
})
