import type { HarnessAdapter } from './types.js'
import { claudeCode } from './claude-code.js'
import { cursor } from './cursor.js'
import { codex } from './codex.js'
import { kimi } from './kimi.js'
import { opencode } from './opencode.js'
import { pi } from './pi.js'
import { agentPlugins } from './agent-plugins.js'
import { copilot } from './copilot.js'
import { TARGET_IDS } from '../vocabulary.js'

export type { SupportLevel, ComponentSupport, AdapterEmission, EmissionLimitation, HarnessAdapter } from './types.js'

export const adapters: HarnessAdapter[] = [claudeCode, cursor, codex, kimi, opencode, pi, agentPlugins, copilot]

// The adapters retain a string `name` for compatibility, while TARGET_IDS is
// the single source of truth for the public target vocabulary.
const knownTargets: readonly string[] = TARGET_IDS

export function getAdapter(name: string): HarnessAdapter | undefined {
  if (!knownTargets.includes(name)) return undefined
  return adapters.find((a) => a.name === name)
}
