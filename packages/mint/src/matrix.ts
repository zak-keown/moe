import { adapters } from './adapters/index.js'
import type { AdapterEmission, ComponentSupport, SkillDelivery } from './adapters/types.js'
import type { TargetId } from './vocabulary.js'

const COLUMNS: Array<keyof ComponentSupport> = [
  'skills',
  'commands',
  'agents',
  'hooks',
  'mcp',
  'bootstrap',
]

export function renderMatrix(
  emissions?: Partial<Record<TargetId, AdapterEmission>>,
  skillDelivery?: Readonly<Record<string, SkillDelivery>>,
): string {
  const header = '| Harness | Skill delivery | Emitted capabilities |'
  const separator = '|---|---|---|'
  const rows = adapters.map((adapter) => {
    const emission = emissions?.[adapter.name as TargetId]
    const delivery = emissions === undefined
      ? 'generate a plugin to inspect'
      : skillDelivery?.[adapter.name] ?? 'unsupported'
    const capabilities = emissions === undefined
      ? 'generate a plugin to inspect'
      : emission === undefined
        ? 'omitted'
      : emission.emittedCapabilities.join(', ') || 'none'
    return `| ${adapter.name} | ${delivery} | ${capabilities} |`
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
