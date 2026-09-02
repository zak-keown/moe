import { ConfigError, type PluginTargetIntent } from '../config.js'
import type { FileSet } from '../fileset.js'
import type { PluginModel } from '../model.js'
import type { ComponentSupport, EmissionLimitation } from '../adapters/types.js'
import { CAPABILITY_IDS, type CapabilityId, type TargetId, type TargetIntent } from '../vocabulary.js'

const componentCapability = {
  skills: 'skill-discovery',
  commands: 'command-discovery',
  agents: 'agent-discovery',
  hooks: 'hook-execution',
  mcp: 'mcp-registration',
  bootstrap: 'bootstrap-routing',
} as const satisfies Record<keyof ComponentSupport, CapabilityId>

function paths(files: FileSet): ReadonlySet<string> {
  return new Set(files.map((file) => file.path))
}

function includes(files: ReadonlySet<string>, path: string): boolean {
  return files.has(path)
}

function hasPrefix(files: ReadonlySet<string>, prefix: string): boolean {
  return [...files].some((path) => path.startsWith(prefix))
}

function ordered(capabilities: Iterable<CapabilityId>): CapabilityId[] {
  const seen = new Set(capabilities)
  return CAPABILITY_IDS.filter((capability) => seen.has(capability))
}

/**
 * Temporary migration oracle for the retired component-support matrix. It is
 * intentionally not used by adapters: direct emissions below are the source
 * of truth. The golden tests preserve the reviewed mapping until the old
 * matrix can be deleted from downstream historical fixtures.
 */
export function mapLegacyComponentSupport(
  target: TargetId,
  support: ComponentSupport,
  model: PluginModel,
  files: FileSet,
): CapabilityId[] {
  const direct = deriveEmittedCapabilities(target, model, files)
  const allowed = new Set<CapabilityId>()
  for (const [component, capability] of Object.entries(componentCapability) as Array<[keyof ComponentSupport, CapabilityId]>) {
    if (support[component] !== 'none') allowed.add(capability)
  }
  return ordered(direct.filter((capability) => allowed.has(capability)))
}

/** Derives claims from this plugin's concrete source metadata and projection. */
export function deriveEmittedCapabilities(target: TargetId, model: PluginModel, files: FileSet): CapabilityId[] {
  const emitted = paths(files)
  const capabilities = new Set<CapabilityId>()
  const hasSkills = model.skills.length > 0
  const hasCommands = model.commands.length > 0
  const hasAgents = model.agents.length > 0
  const hasMcp = model.mcp !== undefined
  const bootstrapActive = model.config.bootstrap.kind !== 'none'

  switch (target) {
    case 'claude-code':
      if (!includes(emitted, '.claude-plugin/plugin.json') || !includes(emitted, '.claude-plugin/marketplace.json')) break
      if (hasSkills) capabilities.add('skill-discovery')
      if (hasCommands) capabilities.add('command-discovery')
      if (hasAgents) capabilities.add('agent-discovery')
      if (model.hooks !== undefined || hasPrefix(emitted, 'hooks/moe-mint/')) capabilities.add('hook-execution')
      if (hasMcp) capabilities.add('mcp-registration')
      if (bootstrapActive && includes(emitted, 'hooks/moe-mint/session-start')) capabilities.add('bootstrap-routing')
      break
    case 'cursor':
      if (!includes(emitted, '.cursor-plugin/plugin.json')) break
      if (hasSkills) capabilities.add('skill-discovery')
      if (hasPrefix(emitted, 'hooks/moe-mint/')) capabilities.add('hook-execution')
      if (bootstrapActive && includes(emitted, 'hooks/moe-mint/session-start')) capabilities.add('bootstrap-routing')
      break
    case 'codex':
      if (includes(emitted, '.codex-plugin/plugin.json') && includes(emitted, '.agents/plugins/marketplace.json') && hasSkills) {
        capabilities.add('skill-discovery')
      }
      break
    case 'kimi':
      if (!includes(emitted, '.kimi-plugin/plugin.json')) break
      if (hasSkills) capabilities.add('skill-discovery')
      if (model.config.bootstrap.kind === 'skill') capabilities.add('bootstrap-routing')
      break
    case 'opencode':
      if (!hasPrefix(emitted, '.opencode/plugins/')) break
      if (hasSkills) capabilities.add('skill-discovery')
      if (hasCommands && hasPrefix(emitted, '.opencode/command/')) capabilities.add('command-discovery')
      if (hasAgents && hasPrefix(emitted, '.opencode/agent/')) capabilities.add('agent-discovery')
      if (bootstrapActive) capabilities.add('bootstrap-routing')
      break
    case 'pi':
      if (!hasPrefix(emitted, '.pi/extensions/')) break
      if (hasSkills) capabilities.add('skill-discovery')
      if (bootstrapActive) capabilities.add('bootstrap-routing')
      break
    case 'agent-plugins-1.0':
      if (!includes(emitted, 'plugin.json')) break
      capabilities.add('format-conformance')
      if (hasSkills && model.config.components.skills === 'skills') capabilities.add('skill-discovery')
      if (hasMcp && includes(emitted, 'mcp.json')) {
        const mcp = files.find((file) => file.path === 'mcp.json')
        if (mcp !== undefined && /"mcpServers":\s*\{\s*"/.test(mcp.content)) capabilities.add('mcp-registration')
      }
      break
    case 'copilot':
      break
  }
  return ordered(capabilities)
}

function normalized(values: readonly CapabilityId[]): CapabilityId[] {
  return ordered(values)
}

export function validateEmissionLimitations(
  target: TargetId,
  emitted: readonly CapabilityId[],
  limitations: readonly EmissionLimitation[],
): void {
  const actual = new Set(emitted)
  for (const limitation of limitations) {
    if (limitation.code === 'SETTING_DROPPED') continue
    const capability = componentCapability[limitation.component]
    if (limitation.code === 'COMPONENT_OMITTED' && actual.has(capability)) {
      throw new ConfigError(`adapter "${target}" reports ${limitation.component} omitted while emitting ${capability}`)
    }
  }
}

export function validateEmittedCapabilities(
  plugin: string,
  target: TargetId,
  expected: readonly CapabilityId[],
  emitted: readonly CapabilityId[],
  intent: TargetIntent = 'preview',
): CapabilityId[] {
  const normalizedExpected = normalized(expected)
  const normalizedEmitted = normalized(emitted)
  if (intent === 'omit') {
    if (normalizedEmitted.length !== 0) throw new ConfigError(`plugin "${plugin}" omitted target "${target}" emitted capabilities`)
    return normalizedEmitted
  }
  if (normalizedEmitted.length !== emitted.length) {
    throw new ConfigError(`plugin "${plugin}" target "${target}" emitted duplicate capabilities`)
  }
  const missing = normalizedExpected.filter((capability) => !normalizedEmitted.includes(capability))
  if (missing.length) throw new ConfigError(`plugin "${plugin}" target "${target}" is missing capabilities: ${missing.join(', ')}`)
  const extra = normalizedEmitted.filter((capability) => !normalizedExpected.includes(capability))
  if (extra.length) throw new ConfigError(`plugin "${plugin}" target "${target}" emitted undeclared capabilities: ${extra.join(', ')}`)
  return normalizedEmitted
}

export function validateTargetEmission(
  plugin: string,
  target: TargetId,
  policy: PluginTargetIntent,
  emitted: readonly CapabilityId[],
  limitations: readonly EmissionLimitation[],
): CapabilityId[] {
  const normalizedEmission = validateEmittedCapabilities(plugin, target, policy.expectedCapabilities, emitted, policy.intent)
  validateEmissionLimitations(target, normalizedEmission, limitations)
  return normalizedEmission
}
