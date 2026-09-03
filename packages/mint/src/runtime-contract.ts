import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export interface RuntimeContractServerV1 {
  readonly name: string
  readonly command: string
  readonly args: readonly string[]
  readonly cwd: '.'
}

export interface RuntimeContractAssetsV1 {
  readonly native: string
  readonly embedding: string
  readonly model: string
  readonly claudeCompatibility: string
  readonly codexCompatibility: string
}

export interface RuntimeContractV1 {
  readonly schema: 1
  readonly server: RuntimeContractServerV1
  readonly forwardEnv: readonly string[]
  readonly assets: RuntimeContractAssetsV1
}

export type MemoryRuntimeContractV1 = RuntimeContractV1

const ENV_PATTERN = /^[A-Z][A-Z0-9_]*$/

export function loadRuntimeContract(sourceRoot: string): RuntimeContractV1 {
  const contractPath = join(sourceRoot, 'runtime-contract.json')
  const raw = JSON.parse(readFileSync(contractPath, 'utf-8'))
  if (raw.schema !== 1) {
    throw new Error(`runtime-contract.json: unsupported schema ${raw.schema}`)
  }
  if (!raw.server || raw.server.cwd !== '.') {
    throw new Error('runtime-contract.json: server.cwd must be "."')
  }
  if (!Array.isArray(raw.forwardEnv)) {
    throw new Error('runtime-contract.json: forwardEnv must be an array')
  }
  const seen = new Set<string>()
  for (const v of raw.forwardEnv) {
    if (typeof v !== 'string' || !ENV_PATTERN.test(v)) {
      throw new Error(`runtime-contract.json: invalid env variable "${v}"`)
    }
    if (seen.has(v)) {
      throw new Error(`runtime-contract.json: duplicate env variable "${v}"`)
    }
    seen.add(v)
  }
  const sorted = [...raw.forwardEnv].sort()
  if (raw.forwardEnv.some((v: string, i: number) => v !== sorted[i])) {
    throw new Error('runtime-contract.json: forwardEnv must be sorted alphabetically')
  }
  for (const key of ['native', 'model', 'embedding']) {
    const path = raw.assets?.[key]
    if (typeof path !== 'string' || path.length === 0) {
      throw new Error(`runtime-contract.json: assets.${key} must be a non-empty string`)
    }
    if (path.startsWith('/') || path.includes('..')) {
      throw new Error(`runtime-contract.json: assets.${key} must not be absolute or escape`)
    }
  }
  return raw as RuntimeContractV1
}
