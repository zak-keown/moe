import { z } from 'zod'
import { MintError } from '../diagnostics.js'
import type { PluginCatalogRecordV1 } from './catalog.js'

function memoryEvidenceError(code: string, message: string, action: string, cause?: unknown): never {
  throw new MintError({
    severity: 'error',
    code,
    source: 'memory evidence',
    message,
    action,
  }, { cause })
}

const REQUIRED_NODE_LANE_COUNT = 3
const REQUIRED_NATIVE_TARGETS = ['darwin-arm64', 'darwin-x64', 'linux-arm64', 'linux-x64'] as const
export type MemoryNativeTarget = (typeof REQUIRED_NATIVE_TARGETS)[number]

const recoveryCapsuleSchema = z.object({
  target: z.string().min(1),
  version: z.string().min(1),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  asset: z.string().min(1).optional(),
}).strict()

const runtimeMatrixSchema = z.object({
  node_lanes: z.array(z.string().min(1)).min(REQUIRED_NODE_LANE_COUNT),
  native_targets: z.array(z.string().min(1)).min(REQUIRED_NATIVE_TARGETS.length),
  database_only_targets: z.array(z.string().min(1)),
}).strict()

const memoryEvidenceSchema = z.object({
  schema: z.literal(1),
  memory_version: z.string().min(1),
  artifact_integrity: z.string().regex(/^sha512-[A-Za-z0-9+/]+=*$/),
  artifact_tree_sha256: z.string().regex(/^[0-9a-f]{64}$/),
  runtime_matrix: runtimeMatrixSchema,
  recovery_capsules: z.array(recoveryCapsuleSchema).min(REQUIRED_NATIVE_TARGETS.length),
}).strict()

export interface RecoveryCapsuleRecord {
  target: string
  version: string
  sha256: string
  asset?: string
}

export interface RuntimeMatrixRecord {
  node_lanes: readonly string[]
  native_targets: readonly string[]
  database_only_targets: readonly string[]
}

export interface MemoryReleaseEvidence {
  schema: 1
  memory_version: string
  artifact_integrity: string
  artifact_tree_sha256: string
  runtime_matrix: RuntimeMatrixRecord
  recovery_capsules: readonly RecoveryCapsuleRecord[]
}

export function validateMemoryReleaseEvidence(
  candidateRecord: PluginCatalogRecordV1,
  evidence: unknown,
): MemoryReleaseEvidence {
  const result = memoryEvidenceSchema.safeParse(evidence)
  if (!result.success) {
    const issue = result.error.issues[0]
    memoryEvidenceError(
      'MEMORY_EVIDENCE_SCHEMA_INVALID',
      `memory evidence schema is invalid: ${issue?.message ?? 'unknown'}`,
      'Correct the memory evidence report to match the version-1 schema.',
    )
  }
  const parsed = result.data as unknown as MemoryReleaseEvidence

  if (parsed.memory_version !== candidateRecord.version) {
    memoryEvidenceError(
      'MEMORY_EVIDENCE_VERSION_MISMATCH',
      `memory evidence version "${parsed.memory_version}" does not match candidate version "${candidateRecord.version}"`,
      'Produce evidence for the exact candidate memory version.',
    )
  }

  if (parsed.artifact_integrity !== candidateRecord.artifact.tarball.integrity) {
    memoryEvidenceError(
      'MEMORY_EVIDENCE_INTEGRITY_MISMATCH',
      'memory evidence artifact integrity does not match candidate tarball',
      'Produce evidence against the exact candidate tarball.',
    )
  }

  if (parsed.artifact_tree_sha256 !== candidateRecord.artifact.artifact_tree_sha256) {
    memoryEvidenceError(
      'MEMORY_EVIDENCE_DIGEST_MISMATCH',
      'memory evidence artifact tree SHA-256 does not match candidate artifact',
      'Produce evidence against the exact candidate artifact tree.',
    )
  }

  if (parsed.runtime_matrix.node_lanes.length < REQUIRED_NODE_LANE_COUNT) {
    memoryEvidenceError(
      'MEMORY_EVIDENCE_NODE_LANES_INSUFFICIENT',
      `memory evidence requires at least ${REQUIRED_NODE_LANE_COUNT} Node lanes`,
      'Run the runtime matrix across all required Node versions.',
    )
  }

  const nativeTargetSet = new Set(parsed.runtime_matrix.native_targets)
  for (const required of REQUIRED_NATIVE_TARGETS) {
    if (!nativeTargetSet.has(required)) {
      memoryEvidenceError(
        'MEMORY_EVIDENCE_NATIVE_TARGET_MISSING',
        `memory evidence is missing required native target "${required}"`,
        'Run the runtime matrix on all required native targets.',
      )
    }
  }

  const capsuleTargets = new Set<string>()
  for (const capsule of parsed.recovery_capsules) {
    if (capsuleTargets.has(capsule.target)) {
      memoryEvidenceError(
        'MEMORY_EVIDENCE_CAPSULE_DUPLICATE',
        `duplicate recovery capsule for target "${capsule.target}"`,
        'Provide exactly one capsule per target.',
      )
    }
    capsuleTargets.add(capsule.target)
  }

  for (const required of REQUIRED_NATIVE_TARGETS) {
    if (!capsuleTargets.has(required)) {
      memoryEvidenceError(
        'MEMORY_EVIDENCE_CAPSULE_MISSING',
        `memory evidence is missing recovery capsule for target "${required}"`,
        'Provide a verified recovery capsule for every supported native target.',
      )
    }
  }

  return parsed
}

export function memoryReleaseBlocking(
  plugins: readonly PluginCatalogRecordV1[],
  evidence: MemoryReleaseEvidence | undefined,
): readonly { code: string; message: string }[] {
  const diagnostics: { code: string; message: string }[] = []
  const memoryPlugin = plugins.find((p) => p.plugin === 'moe-memory')
  if (memoryPlugin === undefined) return diagnostics

  if (evidence === undefined) {
    diagnostics.push({
      code: 'MEMORY_EVIDENCE_MISSING',
      message: 'memory release evidence is required for a release that includes moe-memory',
    })
    return diagnostics
  }

  if (evidence.memory_version !== memoryPlugin.version) {
    diagnostics.push({
      code: 'MEMORY_EVIDENCE_VERSION_MISMATCH',
      message: `memory evidence version "${evidence.memory_version}" does not match catalog version "${memoryPlugin.version}"`,
    })
  }

  if (evidence.artifact_integrity !== memoryPlugin.artifact.tarball.integrity) {
    diagnostics.push({
      code: 'MEMORY_EVIDENCE_INTEGRITY_MISMATCH',
      message: 'memory evidence artifact integrity does not match catalog tarball',
    })
  }

  const capsuleTargets = new Set(evidence.recovery_capsules.map((c) => c.target))
  for (const required of REQUIRED_NATIVE_TARGETS) {
    if (!capsuleTargets.has(required)) {
      diagnostics.push({
        code: 'MEMORY_EVIDENCE_CAPSULE_MISSING',
        message: `missing recovery capsule for target "${required}"`,
      })
    }
  }

  return diagnostics
}
