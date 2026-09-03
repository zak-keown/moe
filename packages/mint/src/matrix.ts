import { adapters } from './adapters/index.js'
import type { AdapterEmission } from './adapters/types.js'
import type { TargetId } from './vocabulary.js'

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
