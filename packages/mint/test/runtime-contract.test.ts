import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadRuntimeContract } from '../src/runtime-contract.js'

const MEMORY_SOURCE_ROOT = join(import.meta.dirname, '../../memory')
const SCHEMA_PATH = join(import.meta.dirname, '../schemas/runtime-contract.schema.json')

describe('runtime-contract schema', () => {
  it('validates the memory runtime contract against the JSON Schema', async () => {
    const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf-8'))
    const contract = JSON.parse(readFileSync(join(MEMORY_SOURCE_ROOT, 'runtime-contract.json'), 'utf-8'))
    const Ajv = (await import('ajv/dist/2020.js')).default
    const ajv = new Ajv({ strict: true })
    const validate = ajv.compile(schema)
    const valid = validate(contract)
    expect(validate.errors).toBeNull()
    expect(valid).toBe(true)
  })

  it('rejects unknown keys via additionalProperties: false', async () => {
    const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf-8'))
    const Ajv = (await import('ajv/dist/2020.js')).default
    const ajv = new Ajv({ strict: true })
    const validate = ajv.compile(schema)
    const bad = { schema: 1, server: { name: 'x', command: 'y', args: [], cwd: '.' }, forwardEnv: [], assets: { native: 'a', embedding: 'b', model: 'c', claudeCompatibility: 'd', codexCompatibility: 'e' }, extra: true }
    expect(validate(bad)).toBe(false)
  })
})

describe('runtime-contract loader', () => {
  it('loads the memory contract from the source root', () => {
    const contract = loadRuntimeContract(MEMORY_SOURCE_ROOT)
    expect(contract.schema).toBe(1)
    expect(contract.server).toEqual({
      name: 'moe-memory',
      command: 'node',
      args: ['./dist/cli.js', 'mcp-server'],
      cwd: '.',
    })
  })

  it('has a sorted and deduplicated forwardEnv', () => {
    const contract = loadRuntimeContract(MEMORY_SOURCE_ROOT)
    const sorted = [...contract.forwardEnv].sort()
    expect(contract.forwardEnv).toEqual(sorted)
    expect(new Set(contract.forwardEnv).size).toBe(contract.forwardEnv.length)
  })

  it('contains no absolute or escaping asset paths', () => {
    const contract = loadRuntimeContract(MEMORY_SOURCE_ROOT)
    for (const [, value] of Object.entries(contract.assets)) {
      expect(value).not.toMatch(/^\//)
      expect(value).not.toContain('..')
    }
  })

  it('contains no test-only or internal-only variables', () => {
    const contract = loadRuntimeContract(MEMORY_SOURCE_ROOT)
    const testOnly = ['TEST_ARCHIVE_DIR', 'TEST_DB_PATH', 'TEST_PROJECTS_DIR']
    const internal = ['MOE_MEMORY_SUMMARIZER_GUARD']
    for (const v of [...testOnly, ...internal]) {
      expect(contract.forwardEnv).not.toContain(v)
    }
  })

  it('references valid asset manifests', () => {
    const contract = loadRuntimeContract(MEMORY_SOURCE_ROOT)
    expect(contract.assets.native).toBe('vendor/sqlite-vec/manifest.json')
    expect(contract.assets.model).toBe('runtime/model-manifest.json')
    expect(contract.assets.embedding).toBe('runtime/embedding-assets.json')
  })
})
