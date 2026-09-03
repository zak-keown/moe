import { describe, it, expect } from 'vitest'
import {
  validateEvidenceSchema,
  evaluateEvidence,
  type CertificationEvidenceV1,
  type EvidenceExpectation,
} from '../src/release/evidence.js'

function fakeEvidence(overrides: Partial<CertificationEvidenceV1> = {}): CertificationEvidenceV1 {
  return {
    schema: 1,
    result_id: 'r-001',
    subject: {
      plugin: 'moe',
      package: '@bubstack/moe-core',
      version: '0.1.5',
      artifact_tree_sha256: 'a'.repeat(64),
      artifact_manifest_sha256: 'b'.repeat(64),
      tarball_integrity: 'sha512-AAAA',
    },
    environment: {
      target: 'claude-code',
      os: 'macos',
      arch: 'arm64',
      runtimes: { node: '24.0.0' },
    },
    lifecycle: {
      install: { id: 'install', outcome: 'pass', started_at: '2026-01-01T00:00:00Z', completed_at: '2026-01-01T00:01:00Z' },
      discovery: { id: 'discovery', outcome: 'pass', started_at: '2026-01-01T00:01:00Z', completed_at: '2026-01-01T00:02:00Z' },
      update: { id: 'update', outcome: 'pass', started_at: '2026-01-01T00:02:00Z', completed_at: '2026-01-01T00:03:00Z' },
      uninstall: { id: 'uninstall', outcome: 'pass', started_at: '2026-01-01T00:03:00Z', completed_at: '2026-01-01T00:04:00Z' },
    },
    capabilities: [
      { id: 'skill-discovery', outcome: 'pass', started_at: '2026-01-01T00:04:00Z', completed_at: '2026-01-01T00:05:00Z' },
    ],
    log: { asset: 'log.txt', sha256: 'c'.repeat(64), redacted: true },
    producer: {
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
    },
    overall: 'pass',
    ...overrides,
  }
}

function fakeExpectation(overrides: Partial<EvidenceExpectation> = {}): EvidenceExpectation {
  return {
    plugin: {
      plugin: 'moe',
      package: '@bubstack/moe-core',
      version: '0.1.5',
      artifact: {
        artifact_tree_sha256: 'a'.repeat(64),
        artifact_manifest_sha256: 'b'.repeat(64),
        tarball: { integrity: 'sha512-AAAA' as `sha512-${string}`, bytes: 1024 },
        mirror: { asset: 'moe.tgz', sha256: 'c'.repeat(64) },
        legal: { files: {}, bundle_inventory_sha256: 'd'.repeat(64) },
        emitted_capabilities: {},
      },
      certification: [],
    },
    preflight: {
      plugin: 'moe',
      package: '@bubstack/moe-core',
      proposed_version: '0.1.5',
      proposed: { state: 'absent' },
      predecessor: { state: 'present', version: '0.1.4', integrity: 'sha512-prev' },
    },
    target: 'claude-code',
    os: 'macos',
    arch: 'arm64',
    expectedCapabilities: ['skill-discovery'],
    producer: {
      repository: 'bubstack/moe',
      workflow: 'certify-claude-macos.yml',
      workflowSha: '0'.repeat(40),
      environment: 'claude-maintenance',
    },
    ...overrides,
  }
}

describe('validateEvidenceSchema', () => {
  it('accepts valid evidence', () => {
    const evidence = fakeEvidence()
    const result = validateEvidenceSchema(evidence)
    expect(result.schema).toBe(1)
    expect(result.result_id).toBe('r-001')
  })

  it('rejects missing fields', () => {
    expect(() => validateEvidenceSchema({})).toThrow()
  })

  it('rejects wrong schema version', () => {
    expect(() => validateEvidenceSchema({ ...fakeEvidence(), schema: 2 })).toThrow()
  })

  it('rejects unknown fields', () => {
    expect(() => validateEvidenceSchema({ ...fakeEvidence(), extra_field: true })).toThrow()
  })

  it('rejects invalid tree SHA-256', () => {
    const evidence = fakeEvidence()
    evidence.subject.artifact_tree_sha256 = 'short'
    expect(() => validateEvidenceSchema(evidence)).toThrow()
  })
})

describe('evaluateEvidence', () => {
  it('returns certified for passing evidence with predecessor', () => {
    const result = evaluateEvidence(fakeEvidence(), fakeExpectation())
    expect(result.status).toBe('certified')
  })

  it('returns preview/NO_PREDECESSOR for first-publish plugins', () => {
    const evidence = fakeEvidence({
      lifecycle: {
        ...fakeEvidence().lifecycle,
        update: { id: 'update', outcome: 'skipped', started_at: 't', completed_at: 't', reason: 'NO_PREDECESSOR' },
      },
    })
    const expectation = fakeExpectation({
      preflight: {
        ...fakeExpectation().preflight,
        predecessor: { state: 'absent' },
      },
    })
    const result = evaluateEvidence(evidence, expectation)
    expect(result.status).toBe('preview')
    if (result.status === 'preview') {
      expect(result.reason).toBe('NO_PREDECESSOR')
    }
  })

  it('rejects subject plugin mismatch', () => {
    const evidence = fakeEvidence()
    evidence.subject.plugin = 'wrong-plugin'
    expect(() => evaluateEvidence(evidence, fakeExpectation())).toThrow(/plugin/)
  })

  it('rejects subject digest mismatch', () => {
    const evidence = fakeEvidence()
    evidence.subject.artifact_tree_sha256 = 'x'.repeat(64)
    expect(() => evaluateEvidence(evidence, fakeExpectation())).toThrow(/tree SHA-256/)
  })

  it('rejects tarball integrity mismatch', () => {
    const evidence = fakeEvidence()
    evidence.subject.tarball_integrity = 'sha512-WRONG'
    expect(() => evaluateEvidence(evidence, fakeExpectation())).toThrow(/integrity/)
  })

  it('rejects target mismatch', () => {
    const evidence = fakeEvidence()
    evidence.environment.target = 'cursor'
    expect(() => evaluateEvidence(evidence, fakeExpectation())).toThrow(/target/)
  })

  it('rejects OS mismatch', () => {
    const evidence = fakeEvidence()
    evidence.environment.os = 'linux'
    expect(() => evaluateEvidence(evidence, fakeExpectation())).toThrow(/OS/)
  })

  it('rejects wrong workflow', () => {
    const evidence = fakeEvidence()
    evidence.producer.workflow = 'wrong.yml'
    expect(() => evaluateEvidence(evidence, fakeExpectation())).toThrow(/workflow/)
  })

  it('rejects wrong workflow SHA', () => {
    const evidence = fakeEvidence()
    evidence.producer.workflow_sha = '1'.repeat(40)
    expect(() => evaluateEvidence(evidence, fakeExpectation())).toThrow(/workflow SHA/)
  })

  it('rejects wrong repository', () => {
    const evidence = fakeEvidence()
    evidence.producer.repository = 'wrong/repo'
    expect(() => evaluateEvidence(evidence, fakeExpectation())).toThrow(/repository/)
  })

  it('rejects wrong checkpoint environment', () => {
    const evidence = fakeEvidence()
    ;(evidence.producer.checkpoint as any).environment = 'wrong-env'
    expect(() => evaluateEvidence(evidence, fakeExpectation())).toThrow(/environment/)
  })

  it('rejects missing capability result', () => {
    const evidence = fakeEvidence({ capabilities: [] })
    expect(() => evaluateEvidence(evidence, fakeExpectation())).toThrow(/capability/)
  })

  it('rejects duplicate capability results', () => {
    const cap = { id: 'skill-discovery', outcome: 'pass' as const, started_at: 't', completed_at: 't' }
    const evidence = fakeEvidence({ capabilities: [cap, cap] })
    const expectation = fakeExpectation({ expectedCapabilities: ['skill-discovery', 'skill-discovery'] })
    expect(() => evaluateEvidence(evidence, expectation)).toThrow(/duplicate/)
  })

  it('rejects failed lifecycle check', () => {
    const evidence = fakeEvidence({
      lifecycle: {
        ...fakeEvidence().lifecycle,
        install: { id: 'install', outcome: 'fail', started_at: 't', completed_at: 't' },
      },
    })
    expect(() => evaluateEvidence(evidence, fakeExpectation())).toThrow(/install.*fail/)
  })

  it('rejects skipped required lifecycle check', () => {
    const evidence = fakeEvidence({
      lifecycle: {
        ...fakeEvidence().lifecycle,
        discovery: { id: 'discovery', outcome: 'skipped', started_at: 't', completed_at: 't' },
      },
    })
    expect(() => evaluateEvidence(evidence, fakeExpectation())).toThrow(/discovery.*skipped/)
  })

  it('rejects failed capability', () => {
    const evidence = fakeEvidence({
      capabilities: [{ id: 'skill-discovery', outcome: 'fail', started_at: 't', completed_at: 't' }],
    })
    expect(() => evaluateEvidence(evidence, fakeExpectation())).toThrow(/skill-discovery.*fail/)
  })

  it('rejects skipped capability', () => {
    const evidence = fakeEvidence({
      capabilities: [{ id: 'skill-discovery', outcome: 'skipped', started_at: 't', completed_at: 't' }],
    })
    expect(() => evaluateEvidence(evidence, fakeExpectation())).toThrow(/skill-discovery.*skipped/)
  })

  it('rejects overall fail', () => {
    const evidence = fakeEvidence({ overall: 'fail' })
    expect(() => evaluateEvidence(evidence, fakeExpectation())).toThrow(/overall/)
  })

  it('rejects forged NO_PREDECESSOR when predecessor exists', () => {
    const evidence = fakeEvidence({
      lifecycle: {
        ...fakeEvidence().lifecycle,
        update: { id: 'update', outcome: 'skipped', started_at: 't', completed_at: 't', reason: 'NO_PREDECESSOR' },
      },
    })
    expect(() => evaluateEvidence(evidence, fakeExpectation())).toThrow(/predecessor/)
  })

  it('rejects update skipped without NO_PREDECESSOR reason', () => {
    const evidence = fakeEvidence({
      lifecycle: {
        ...fakeEvidence().lifecycle,
        update: { id: 'update', outcome: 'skipped', started_at: 't', completed_at: 't', reason: 'OTHER' },
      },
    })
    const expectation = fakeExpectation({
      preflight: { ...fakeExpectation().preflight, predecessor: { state: 'absent' } },
    })
    expect(() => evaluateEvidence(evidence, expectation)).toThrow(/NO_PREDECESSOR/)
  })

  it('rejects update fail', () => {
    const evidence = fakeEvidence({
      lifecycle: {
        ...fakeEvidence().lifecycle,
        update: { id: 'update', outcome: 'fail', started_at: 't', completed_at: 't' },
      },
    })
    expect(() => evaluateEvidence(evidence, fakeExpectation())).toThrow(/update.*fail/)
  })
})
