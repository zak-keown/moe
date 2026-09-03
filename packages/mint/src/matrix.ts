import { adapters } from './adapters/index.js'
import type { AdapterEmission, ComponentSupport } from './adapters/types.js'
import type { TargetId } from './vocabulary.js'

const COLUMNS: Array<keyof ComponentSupport> = [
  'skills',
  'commands',
  'agents',
  'hooks',
  'mcp',
  'bootstrap',
  'rules',
  'variables',
]

export function renderMatrix(emissions?: Partial<Record<TargetId, AdapterEmission>>): string {
  const header = '| Harness | Emitted capabilities |'
  const separator = '|---|---|'
  const rows = adapters.map((adapter) => {
    const emission = emissions?.[adapter.name as TargetId]
    const capabilities = emissions === undefined
      ? 'generate a plugin to inspect'
      : emission === undefined
        ? 'omitted'
      : emission.emittedCapabilities.join(', ') || 'none'
    return `| ${adapter.name} | ${capabilities} |`
  })
  return [header, separator, ...rows].join('\n') + '\n'
}

export function renderSupportMatrix(): string {
  const header = `| Harness | ${COLUMNS.join(' | ')} |`
  const separator = `|${'---|'.repeat(COLUMNS.length + 1)}`
  const rows = adapters.map(
    (a) => `| ${a.name} | ${COLUMNS.map((c) => a.support[c]).join(' | ')} |`,
  )
  return [header, separator, ...rows].join('\n') + '\n'
}
