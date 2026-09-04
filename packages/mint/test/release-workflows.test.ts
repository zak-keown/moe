import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse } from 'yaml'

const REPO_ROOT = resolve(process.cwd(), '../..')
const PUBLISH_WORKFLOW = readFileSync(resolve(REPO_ROOT, '.github/workflows/publish.yml'), 'utf8')
const PUBLISH_YAML = parse(PUBLISH_WORKFLOW) as Record<string, any>
const CERTIFY_WORKFLOW = readFileSync(resolve(REPO_ROOT, '.github/workflows/certify-claude-macos.yml'), 'utf8')
const CERTIFY_YAML = parse(CERTIFY_WORKFLOW) as Record<string, any>

describe('publish workflow contract', () => {
  it('requires contents: write permission', () => {
    const perms = PUBLISH_YAML.permissions
    expect(perms).toBeDefined()
    expect(perms.contents).toMatch(/write|read/)
  })

  it('requires id-token: write permission', () => {
    expect(PUBLISH_YAML.permissions['id-token']).toBe('write')
  })

  it('uses a non-cancelling concurrency group', () => {
    const concurrency = PUBLISH_YAML.concurrency
    expect(concurrency).toBeDefined()
    expect(concurrency['cancel-in-progress']).toBe(false)
  })

  it('triggers on v* tag pushes', () => {
    const tags = PUBLISH_YAML.on?.push?.tags
    expect(tags).toBeDefined()
    expect(tags).toContain('v*')
  })

  it('uses a protected environment', () => {
    const jobs = PUBLISH_YAML.jobs
    const jobNames = Object.keys(jobs)
    const hasProtectedEnv = jobNames.some((name) => jobs[name].environment !== undefined)
    expect(hasProtectedEnv).toBe(true)
  })

  it('invokes compiled Mint CLI', () => {
    const workflowText = PUBLISH_WORKFLOW
    expect(workflowText).toContain('packages/mint/dist/cli.js')
  })
})

describe('publish workflow negative assertions', () => {
  it('does not npm publish from packages/ directories', () => {
    expect(PUBLISH_WORKFLOW).not.toMatch(/npm publish packages\//)
  })

  it('does not use npm pack after candidate verification', () => {
    // The whole publish path is delegated to the compiled Mint CLI (see
    // "invokes compiled Mint CLI" above), so no post-verification anchor is
    // needed: the workflow must never shell out to npm pack anywhere, not
    // just after a "publish-matrix" step that no longer exists in this file
    // (a prior version of this test gated the assertion behind a lookup for
    // that literal, which meant the check silently never ran — CR-063).
    expect(PUBLISH_WORKFLOW).not.toMatch(/npm pack(?!\s*#)/)
  })

  it('does not reference the stale OIDC diagnostic script by path', () => {
    expect(PUBLISH_WORKFLOW).not.toContain('scripts/diagnose-oidc.sh')
  })
})

describe('certify-claude-macos workflow contract', () => {
  it('requires contents: write permission', () => {
    const perms = CERTIFY_YAML.permissions
    expect(perms.contents).toBe('write')
  })

  it('requires id-token: write permission', () => {
    expect(CERTIFY_YAML.permissions['id-token']).toBe('write')
  })

  it('uses a non-cancelling concurrency group', () => {
    const concurrency = CERTIFY_YAML.concurrency
    expect(concurrency).toBeDefined()
    expect(concurrency['cancel-in-progress']).toBe(false)
  })

  it('uses a global release concurrency group', () => {
    expect(CERTIFY_YAML.concurrency.group).toBe('moe-release')
  })

  it('uses the claude-maintenance protected environment', () => {
    const jobs = CERTIFY_YAML.jobs
    const jobNames = Object.keys(jobs)
    const hasClaude = jobNames.some((name) => jobs[name].environment === 'claude-maintenance')
    expect(hasClaude).toBe(true)
  })

  it('triggers on workflow_dispatch with candidate_tag input', () => {
    expect(CERTIFY_YAML.on.workflow_dispatch).toBeDefined()
    expect(CERTIFY_YAML.on.workflow_dispatch.inputs.candidate_tag).toBeDefined()
  })

  it('invokes compiled Mint CLI for certification', () => {
    expect(CERTIFY_WORKFLOW).toContain('release certify-claude')
  })

  it('does not accept ANTHROPIC_API_KEY as a workflow input', () => {
    const inputs = CERTIFY_YAML.on.workflow_dispatch.inputs
    expect(inputs.anthropic_api_key ?? inputs.api_key).toBeUndefined()
  })
})
