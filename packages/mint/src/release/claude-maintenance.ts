import { createHash, randomUUID } from 'node:crypto'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { MintError } from '../diagnostics.js'
import type { CapabilityId } from '../vocabulary.js'
import type {
  CertificationEvidenceV1,
  EvidenceCheck,
  EvidenceProducer,
} from './evidence.js'
import type { PluginCatalogRecordV1, ReleasePreflightV1 } from './catalog.js'

function maintenanceError(code: string, message: string, action: string, cause?: unknown): never {
  throw new MintError({
    severity: 'error',
    code,
    source: 'claude-maintenance',
    message,
    action,
  }, { cause })
}

export interface PluginSmokeContext {
  plugin: PluginCatalogRecordV1
  predecessorVersion: string | null
  candidateTarball: string
  configDir: string
  projectDir: string
}

export interface CheckResult {
  outcome: 'pass' | 'fail' | 'skipped'
  startedAt: string
  completedAt: string
  redactedLog: string
  reason?: string
}

export interface TargetLifecycleDriver {
  install(ctx: PluginSmokeContext): Promise<CheckResult>
  discover(ctx: PluginSmokeContext): Promise<CheckResult>
  update(ctx: PluginSmokeContext): Promise<CheckResult>
  invokeCapability(capability: CapabilityId, ctx: PluginSmokeContext): Promise<CheckResult>
  uninstall(ctx: PluginSmokeContext): Promise<CheckResult>
}

export interface ClaudeMaintenanceInput {
  candidateTag: string
  catalog: {
    plugins: readonly PluginCatalogRecordV1[]
  }
  preflight: ReleasePreflightV1
  tarballs: ReadonlyMap<string, string>
  producer: EvidenceProducer
  outputDir: string
  expectedCapabilities: ReadonlyMap<string, readonly CapabilityId[]>
}

export interface ClaudeMaintenanceResult {
  reports: readonly {
    plugin: string
    evidencePath: string
    logPath: string
    evidence: CertificationEvidenceV1
  }[]
}

function toEvidenceCheck(result: CheckResult, id: string): EvidenceCheck {
  const check: EvidenceCheck = {
    id,
    outcome: result.outcome,
    started_at: result.startedAt,
    completed_at: result.completedAt,
  }
  if (result.reason !== undefined) check.reason = result.reason
  return check
}

interface PluginRunResult {
  install: CheckResult
  discover: CheckResult
  update: CheckResult
  capabilities: CheckResult[]
  uninstall: CheckResult
  capabilityIds: readonly CapabilityId[]
}

async function runPluginLifecycle(
  driver: TargetLifecycleDriver,
  ctx: PluginSmokeContext,
  capabilityIds: readonly CapabilityId[],
): Promise<PluginRunResult> {
  const install = await driver.install(ctx)
  const discover = await driver.discover(ctx)

  let update: CheckResult
  if (ctx.predecessorVersion === null) {
    const now = new Date().toISOString()
    update = {
      outcome: 'skipped',
      startedAt: now,
      completedAt: now,
      redactedLog: 'skipped: NO_PREDECESSOR',
      reason: 'NO_PREDECESSOR',
    }
  } else {
    update = await driver.update(ctx)
  }

  const capabilities: CheckResult[] = []
  for (const cap of capabilityIds) {
    capabilities.push(await driver.invokeCapability(cap, ctx))
  }

  const uninstall = await driver.uninstall(ctx)

  return { install, discover, update, capabilities, uninstall, capabilityIds }
}

function buildRedactedLog(run: PluginRunResult): string {
  const parts: string[] = [
    `install: ${run.install.outcome}`,
    `discovery: ${run.discover.outcome}`,
    `update: ${run.update.outcome}`,
  ]
  for (let i = 0; i < run.capabilityIds.length; i++) {
    parts.push(`capability ${run.capabilityIds[i]}: ${run.capabilities[i]!.outcome}`)
  }
  parts.push(`uninstall: ${run.uninstall.outcome}`)
  return parts.join('\n')
}

export async function runClaudeMaintenance(
  input: ClaudeMaintenanceInput,
  driver: TargetLifecycleDriver,
): Promise<ClaudeMaintenanceResult> {
  const reports: ClaudeMaintenanceResult['reports'][number][] = []

  for (const plugin of input.catalog.plugins) {
    const preflightEntry = input.preflight.plugins.find((p) => p.plugin === plugin.plugin)
    if (preflightEntry === undefined) {
      maintenanceError('MAINTENANCE_PREFLIGHT_MISSING', `plugin "${plugin.plugin}" not found in preflight`, 'Include all plugins in the preflight.')
    }

    const tarballPath = input.tarballs.get(plugin.plugin)
    if (tarballPath === undefined) {
      maintenanceError('MAINTENANCE_TARBALL_MISSING', `tarball for "${plugin.plugin}" not found`, 'Provide all candidate tarballs.')
    }

    const configDir = join(input.outputDir, 'config', plugin.plugin)
    const projectDir = join(input.outputDir, 'project', plugin.plugin)
    await mkdir(configDir, { recursive: true })
    await mkdir(projectDir, { recursive: true })

    const predecessorVersion = preflightEntry.predecessor.state === 'present'
      ? preflightEntry.predecessor.version
      : null

    const ctx: PluginSmokeContext = {
      plugin,
      predecessorVersion,
      candidateTarball: tarballPath,
      configDir,
      projectDir,
    }

    const capabilityIds = input.expectedCapabilities.get(plugin.plugin) ?? []
    let run: PluginRunResult

    try {
      run = await runPluginLifecycle(driver, ctx, capabilityIds)
    } catch (error) {
      try { await driver.uninstall(ctx) } catch { /* preserve primary */ }
      throw error
    } finally {
      await rm(configDir, { recursive: true, force: true }).catch(() => {})
      await rm(projectDir, { recursive: true, force: true }).catch(() => {})
    }

    const redactedLog = buildRedactedLog(run)
    const logSha256 = createHash('sha256').update(redactedLog).digest('hex')

    const allPassed =
      run.install.outcome === 'pass'
      && run.discover.outcome === 'pass'
      && (run.update.outcome === 'pass' || run.update.outcome === 'skipped')
      && run.uninstall.outcome === 'pass'
      && run.capabilities.every((r) => r.outcome === 'pass')

    const evidence: CertificationEvidenceV1 = {
      schema: 1,
      result_id: randomUUID(),
      subject: {
        plugin: plugin.plugin,
        package: plugin.package,
        version: plugin.version,
        artifact_tree_sha256: plugin.artifact.artifact_tree_sha256,
        artifact_manifest_sha256: plugin.artifact.artifact_manifest_sha256,
        tarball_integrity: plugin.artifact.tarball.integrity,
      },
      environment: {
        target: 'claude-code',
        os: 'macos',
        runtimes: {},
      },
      lifecycle: {
        install: toEvidenceCheck(run.install, 'install'),
        discovery: toEvidenceCheck(run.discover, 'discovery'),
        update: toEvidenceCheck(run.update, 'update'),
        uninstall: toEvidenceCheck(run.uninstall, 'uninstall'),
      },
      capabilities: capabilityIds.map((cap, i) => toEvidenceCheck(run.capabilities[i]!, cap)),
      log: {
        asset: `${plugin.plugin}-claude-code-macos-log.txt`,
        sha256: logSha256,
        redacted: true,
      },
      producer: input.producer,
      overall: allPassed ? 'pass' : 'fail',
    }

    const evidencePath = join(input.outputDir, `moe-evidence-${plugin.plugin}-claude-code-macos.json`)
    const logPath = join(input.outputDir, `${plugin.plugin}-claude-code-macos-log.txt`)
    await writeFile(evidencePath, JSON.stringify(evidence, null, 2))
    await writeFile(logPath, redactedLog)

    reports.push({ plugin: plugin.plugin, evidencePath, logPath, evidence })
  }

  return { reports }
}
