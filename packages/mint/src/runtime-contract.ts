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

export function loadRuntimeContract(sourceRoot: string): RuntimeContractV1 {
  const contractPath = join(sourceRoot, 'runtime-contract.json')
  const raw = JSON.parse(readFileSync(contractPath, 'utf-8'))
  if (raw.schema !== 1) {
    throw new Error(`Unsupported runtime contract schema: ${raw.schema}`)
  }
  const sorted = [...raw.forwardEnv].sort()
  if (JSON.stringify(sorted) !== JSON.stringify(raw.forwardEnv)) {
    throw new Error('forwardEnv must be sorted alphabetically')
  }
  const seen = new Set<string>()
  for (const v of raw.forwardEnv) {
    if (seen.has(v)) {
      throw new Error(`Duplicate forwardEnv entry: ${v}`)
    }
    seen.add(v)
  }
  return raw as RuntimeContractV1
}
