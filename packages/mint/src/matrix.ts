import { adapters } from './adapters/index.js'
import type { ComponentSupport, SkillDelivery } from './adapters/types.js'

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

export function renderMatrix(achievedDelivery?: Record<string, SkillDelivery>): string {
  const header = `| Harness | skill delivery | ${COLUMNS.join(' | ')} |`
  const separator = `|${'---|'.repeat(COLUMNS.length + 2)}`
  const rows = adapters.map((adapter) => {
    const delivery = achievedDelivery
      ? (achievedDelivery[adapter.name] ?? 'unsupported')
      : adapter.skillDelivery
    const support = {
      ...adapter.support,
      skills: delivery === 'unsupported' ? 'none' : adapter.support.skills,
    }
    return `| ${adapter.name} | ${delivery} | ${COLUMNS.map((column) => support[column]).join(' | ')} |`
  })
  return [header, separator, ...rows].join('\n') + '\n'
}
