import { z } from 'zod'
import { TARGET_IDS, OPERATING_SYSTEM_IDS, type CapabilityId, type TargetId, type OperatingSystemId } from '../vocabulary.js'
import { MintError } from '../diagnostics.js'
import type { PluginCatalogRecordV1, ReleasePreflightV1 } from './catalog.js'

function evidenceError(code: string, message: string, action: string, cause?: unknown): never {
  throw new MintError({
    severity: 'error',
    code,
    source: 'evidence',
    message,
    action,
  }, { cause })
}

const evidenceCheckSchema = z.object({
  id: z.string().min(1),
  outcome: z.enum(['pass', 'fail', 'skipped']),
  started_at: z.string().min(1),
  completed_at: z.string().min(1),
  log_sha256: z.string().regex(/^[0-9a-f]{64}$/).optional(),
  reason: z.string().min(1).optional(),
}).strict()

const evidenceEnvironmentSchema = z.object({
  target: z.enum(TARGET_IDS),
  target_version: z.string().min(1).optional(),
  contract_revision: z.string().min(1).optional(),
  os: z.enum(OPERATING_SYSTEM_IDS).optional(),
  arch: z.string().min(1).optional(),
  runtimes: z.record(z.string().min(1), z.string().min(1)),
}).strict()

const evidenceProducerSchema = z.object({
  kind: z.literal('protected-ci'),
  repository: z.string().min(1),
  workflow: z.string().min(1),
  workflow_sha: z.string().regex(/^[0-9a-f]{40}$/),
  run_id: z.string().min(1),
  job_id: z.string().min(1),
  trigger_actor: z.string().min(1),
  runner_image: z.string().min(1),
  checkpoint: z.object({
    environment: z.literal('claude-maintenance'),
    deployment_id: z.string().min(1),
    approval_actor: z.string().min(1),
    approved_at: z.string().min(1),
  }).strict(),
}).strict()

const evidenceSchema = z.object({
  schema: z.literal(1),
  result_id: z.string().min(1),
  subject: z.object({
    plugin: z.string().min(1),
    package: z.string().min(1),
    version: z.string().min(1),
    artifact_tree_sha256: z.string().regex(/^[0-9a-f]{64}$/),
    artifact_manifest_sha256: z.string().regex(/^[0-9a-f]{64}$/),
    tarball_integrity: z.string().regex(/^sha512-[A-Za-z0-9+/]+=*$/),
  }).strict(),
  environment: evidenceEnvironmentSchema,
  lifecycle: z.object({
    install: evidenceCheckSchema,
    discovery: evidenceCheckSchema,
    update: evidenceCheckSchema,
    uninstall: evidenceCheckSchema,
  }).strict(),
  capabilities: z.array(evidenceCheckSchema),
  log: z.object({
    asset: z.string().min(1),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    redacted: z.literal(true),
  }).strict(),
  producer: evidenceProducerSchema,
  overall: z.enum(['pass', 'fail']),
}).strict()

export interface CertificationEvidenceV1 {
  schema: 1
  result_id: string
  subject: {
    plugin: string
    package: string
    version: string
    artifact_tree_sha256: string
    artifact_manifest_sha256: string
    tarball_integrity: string
  }
  environment: EvidenceEnvironment
  lifecycle: Record<'install' | 'discovery' | 'update' | 'uninstall', EvidenceCheck>
  capabilities: readonly EvidenceCheck[]
  log: { asset: string; sha256: string; redacted: true }
  producer: EvidenceProducer
  overall: 'pass' | 'fail'
}

export interface EvidenceCheck {
  id: string
  outcome: 'pass' | 'fail' | 'skipped'
  started_at: string
  completed_at: string
  log_sha256?: string
  reason?: string
}

export interface EvidenceEnvironment {
  target: TargetId
  target_version?: string
  contract_revision?: string
  os?: OperatingSystemId
  arch?: string
  runtimes: Readonly<Record<string, string>>
}

export interface EvidenceProducer {
  kind: 'protected-ci'
  repository: string
  workflow: string
  workflow_sha: string
  run_id: string
  job_id: string
  trigger_actor: string
  runner_image: string
  checkpoint: {
    environment: 'claude-maintenance'
    deployment_id: string
    approval_actor: string
    approved_at: string
  }
}

export type EvidenceDisposition =
  | { status: 'certified'; evidence: CertificationEvidenceV1 }
  | {
      status: 'preview'
      reason: 'NO_PREDECESSOR'
      evidence: CertificationEvidenceV1
    }

export interface EvidenceExpectation {
  plugin: PluginCatalogRecordV1
  preflight: ReleasePreflightV1['plugins'][number]
  target: TargetId
  os?: OperatingSystemId
  arch?: string
  expectedCapabilities: readonly CapabilityId[]
  producer: {
    repository: string
    workflow: string
    workflowSha: string
    environment: 'claude-maintenance'
  }
}

export function validateEvidenceSchema(raw: unknown): CertificationEvidenceV1 {
  const result = evidenceSchema.safeParse(raw)
  if (!result.success) {
    const issue = result.error.issues[0]
    evidenceError(
      'EVIDENCE_SCHEMA_INVALID',
      `evidence schema is invalid: ${issue?.message ?? 'unknown'}`,
      'Correct the evidence report to match the version-1 schema.',
    )
  }
  return result.data as unknown as CertificationEvidenceV1
}

export function evaluateEvidence(
  evidence: CertificationEvidenceV1,
  expected: EvidenceExpectation,
): EvidenceDisposition {
  if (evidence.subject.plugin !== expected.plugin.plugin) {
    evidenceError('EVIDENCE_SUBJECT_MISMATCH', 'evidence plugin does not match expected', 'Use evidence produced for the correct plugin.')
  }
  if (evidence.subject.package !== expected.plugin.package) {
    evidenceError('EVIDENCE_SUBJECT_MISMATCH', 'evidence package does not match expected', 'Use evidence produced for the correct package.')
  }
  if (evidence.subject.version !== expected.plugin.version) {
    evidenceError('EVIDENCE_SUBJECT_MISMATCH', 'evidence version does not match expected', 'Use evidence produced for the correct version.')
  }
  if (evidence.subject.artifact_tree_sha256 !== expected.plugin.artifact.artifact_tree_sha256) {
    evidenceError('EVIDENCE_DIGEST_MISMATCH', 'evidence tree SHA-256 does not match candidate artifact', 'Use evidence produced against the exact candidate artifact.')
  }
  if (evidence.subject.artifact_manifest_sha256 !== expected.plugin.artifact.artifact_manifest_sha256) {
    evidenceError('EVIDENCE_DIGEST_MISMATCH', 'evidence manifest SHA-256 does not match candidate artifact', 'Use evidence produced against the exact candidate artifact.')
  }
  if (evidence.subject.tarball_integrity !== expected.plugin.artifact.tarball.integrity) {
    evidenceError('EVIDENCE_INTEGRITY_MISMATCH', 'evidence tarball integrity does not match candidate artifact', 'Use evidence produced against the exact candidate tarball.')
  }

  if (evidence.environment.target !== expected.target) {
    evidenceError('EVIDENCE_ENVIRONMENT_MISMATCH', 'evidence target does not match expected', 'Use evidence produced for the correct target.')
  }
  if (expected.os !== undefined && evidence.environment.os !== expected.os) {
    evidenceError('EVIDENCE_ENVIRONMENT_MISMATCH', 'evidence OS does not match expected', 'Use evidence produced for the correct operating system.')
  }
  if (expected.arch !== undefined && evidence.environment.arch !== expected.arch) {
    evidenceError('EVIDENCE_ENVIRONMENT_MISMATCH', 'evidence arch does not match expected', 'Use evidence produced for the correct architecture.')
  }

  if (evidence.producer.repository !== expected.producer.repository) {
    evidenceError('EVIDENCE_PRODUCER_MISMATCH', 'evidence repository does not match expected', 'Use evidence from the authorized workflow.')
  }
  if (evidence.producer.workflow !== expected.producer.workflow) {
    evidenceError('EVIDENCE_PRODUCER_MISMATCH', 'evidence workflow does not match expected', 'Use evidence from the authorized workflow.')
  }
  if (evidence.producer.workflow_sha !== expected.producer.workflowSha) {
    evidenceError('EVIDENCE_PRODUCER_MISMATCH', 'evidence workflow SHA does not match expected', 'Use evidence from the exact authorized workflow revision.')
  }
  if (evidence.producer.checkpoint.environment !== expected.producer.environment) {
    evidenceError('EVIDENCE_PRODUCER_MISMATCH', 'evidence checkpoint environment does not match expected', 'Use evidence from the protected claude-maintenance environment.')
  }
  if (!evidence.producer.checkpoint.deployment_id) {
    evidenceError('EVIDENCE_PRODUCER_INVALID', 'evidence checkpoint is missing deployment identity', 'Include deployment approval identity in evidence.')
  }
  if (!evidence.producer.checkpoint.approval_actor) {
    evidenceError('EVIDENCE_PRODUCER_INVALID', 'evidence checkpoint is missing approval actor', 'Include the reviewer identity in evidence.')
  }

  const capabilityIds = evidence.capabilities.map((c) => c.id)
  const expectedIds = expected.expectedCapabilities as readonly string[]
  if (capabilityIds.length !== expectedIds.length) {
    evidenceError('EVIDENCE_CAPABILITY_MISMATCH', `evidence has ${capabilityIds.length} capability results but expected ${expectedIds.length}`, 'Report one result per declared capability.')
  }
  const capSet = new Set(capabilityIds)
  if (capSet.size !== capabilityIds.length) {
    evidenceError('EVIDENCE_CAPABILITY_DUPLICATE', 'evidence contains duplicate capability results', 'Report each capability exactly once.')
  }
  for (const expectedCap of expectedIds) {
    if (!capSet.has(expectedCap)) {
      evidenceError('EVIDENCE_CAPABILITY_MISSING', `evidence is missing result for capability "${expectedCap}"`, 'Report a result for every declared capability.')
    }
  }

  if (evidence.overall === 'fail') {
    evidenceError('EVIDENCE_OVERALL_FAIL', 'evidence overall outcome is fail', 'Fix the failures and produce passing evidence.')
  }

  for (const [name, check] of Object.entries(evidence.lifecycle) as [string, EvidenceCheck][]) {
    if (name === 'update') continue
    if (check.outcome === 'fail') {
      evidenceError('EVIDENCE_LIFECYCLE_FAIL', `lifecycle check "${name}" failed`, 'Fix the failure and produce passing evidence.')
    }
    if (check.outcome === 'skipped') {
      evidenceError('EVIDENCE_LIFECYCLE_SKIPPED', `required lifecycle check "${name}" was skipped`, 'Complete all required lifecycle checks.')
    }
  }

  for (const cap of evidence.capabilities) {
    if (cap.outcome === 'fail') {
      evidenceError('EVIDENCE_CAPABILITY_FAIL', `capability "${cap.id}" failed`, 'Fix the failure and produce passing evidence.')
    }
    if (cap.outcome === 'skipped') {
      evidenceError('EVIDENCE_CAPABILITY_SKIPPED', `capability "${cap.id}" was skipped`, 'Complete all capability checks.')
    }
  }

  const updateCheck = evidence.lifecycle.update
  if (updateCheck.outcome === 'skipped') {
    if (updateCheck.reason !== 'NO_PREDECESSOR') {
      evidenceError('EVIDENCE_UPDATE_SKIP_INVALID', 'update was skipped without NO_PREDECESSOR reason', 'Skip update only for first-publish plugins with NO_PREDECESSOR reason.')
    }
    if (expected.preflight.predecessor.state !== 'absent') {
      evidenceError('EVIDENCE_UPDATE_SKIP_FORGED', 'update claims NO_PREDECESSOR but preflight records a predecessor', 'Only skip update when the locked preflight records no predecessor.')
    }
    return { status: 'preview', reason: 'NO_PREDECESSOR', evidence }
  }

  if (updateCheck.outcome === 'fail') {
    evidenceError('EVIDENCE_LIFECYCLE_FAIL', 'lifecycle check "update" failed', 'Fix the update failure and produce passing evidence.')
  }

  return { status: 'certified', evidence }
}
