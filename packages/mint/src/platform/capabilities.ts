import { ConfigError, hooksManifestPath, type PluginTargetIntent } from '../config.js'
import type { FileSet } from '../fileset.js'
import type { PluginModel } from '../model.js'
import type { ComponentSupport, EmissionLimitation } from '../adapters/types.js'
import { CAPABILITY_IDS, type CapabilityId, type TargetId, type TargetIntent } from '../vocabulary.js'
import { conformsToGeneratedSchema } from '../validate.js'

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

function sameOrder(left: readonly CapabilityId[], right: readonly CapabilityId[]): boolean {
  return left.length === right.length && left.every((capability, index) => capability === right[index])
}

export function capabilityError(
  code: string,
  plugin: string,
  target: TargetId,
  source: string,
  field: string,
  message: string,
  action: string,
): ConfigError {
  return new ConfigError(message, [], { diagnostic: { code, plugin, target, source, field, action } })
}

function jsonObject(files: FileSet, path: string): Record<string, unknown> | undefined {
  const file = files.find((entry) => entry.path === path)
  if (file === undefined) return undefined
  try {
    const parsed: unknown = JSON.parse(file.content)
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed as Record<string, unknown> : undefined
  } catch {
    return undefined
  }
}

function manifestPathSupports(
  manifest: Record<string, unknown>,
  field: string,
  sourcePath: string,
  defaultPath?: string,
): boolean {
  // An absent field invokes only the documented default-discovery location.
  // A present field must name the exact path actually emitted by this model.
  return manifest[field] === `./${sourcePath}` || (sourcePath === defaultPath && !(field in manifest))
}

function generatedFile(files: FileSet, path: string): string | undefined {
  return files.find((entry) => entry.path === path)?.content
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
  return ordered(direct.filter((capability) => allowed.has(capability) || capability === 'format-conformance'))
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
      {
        const manifest = jsonObject(files, '.claude-plugin/plugin.json')
        if (manifest === undefined) break
        if (hasSkills && manifestPathSupports(manifest, 'skills', model.config.components.skills, 'skills')) capabilities.add('skill-discovery')
        if (hasCommands && manifestPathSupports(manifest, 'commands', model.config.components.commands, 'commands')) capabilities.add('command-discovery')
        if (hasAgents && manifestPathSupports(manifest, 'agents', model.config.components.agents, 'agents')) capabilities.add('agent-discovery')
        const bootstrapHooks = manifest.hooks === './hooks/moe-mint/hooks.json' && includes(emitted, 'hooks/moe-mint/session-start')
        const sourceHooks = model.hooks !== undefined && manifestPathSupports(manifest, 'hooks', hooksManifestPath(model.config), 'hooks/hooks.json')
        if (bootstrapHooks || sourceHooks) capabilities.add('hook-execution')
        if (hasMcp && manifestPathSupports(manifest, 'mcpServers', model.config.components.mcp, '.mcp.json')) capabilities.add('mcp-registration')
        if (bootstrapActive && bootstrapHooks) capabilities.add('bootstrap-routing')
      }
      break
    case 'cursor':
      if (!includes(emitted, '.cursor-plugin/plugin.json')) break
      {
        const manifest = jsonObject(files, '.cursor-plugin/plugin.json')
        if (manifest === undefined) break
        if (hasSkills && manifest.skills === `./${model.config.components.skills}/`) capabilities.add('skill-discovery')
        const bootstrapHooks = manifest.hooks === './hooks/moe-mint/hooks-cursor.json' && includes(emitted, 'hooks/moe-mint/session-start')
        if (bootstrapHooks) capabilities.add('hook-execution')
        if (bootstrapActive && bootstrapHooks) capabilities.add('bootstrap-routing')
      }
      break
    case 'codex':
      if (
        includes(emitted, '.codex-plugin/plugin.json')
        && includes(emitted, '.agents/plugins/marketplace.json')
        && hasSkills
        && jsonObject(files, '.codex-plugin/plugin.json')?.skills === `./${model.config.components.skills}/`
      ) {
        capabilities.add('skill-discovery')
      }
      break
    case 'kimi':
      const manifest = jsonObject(files, '.kimi-plugin/plugin.json')
      if (manifest === undefined) break
      if (hasSkills && manifest.skills === `./${model.config.components.skills}/`) capabilities.add('skill-discovery')
      if (
        model.config.bootstrap.kind === 'skill'
        && typeof manifest.sessionStart === 'object'
        && manifest.sessionStart !== null
        && !Array.isArray(manifest.sessionStart)
        && (manifest.sessionStart as Record<string, unknown>).skill === model.config.bootstrap.skill
      ) capabilities.add('bootstrap-routing')
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
      const plugin = generatedFile(files, 'plugin.json')
      if (plugin === undefined || !conformsToGeneratedSchema('plugin.json', plugin)) break
      capabilities.add('format-conformance')
      if (hasSkills && model.config.components.skills === 'skills') capabilities.add('skill-discovery')
      const mcp = generatedFile(files, 'mcp.json')
      const mcpManifest = mcp === undefined ? undefined : jsonObject(files, 'mcp.json')
      if (
        hasMcp
        && mcp !== undefined
        && conformsToGeneratedSchema('mcp.json', mcp)
        && mcpManifest !== undefined
        && typeof mcpManifest.mcpServers === 'object'
        && mcpManifest.mcpServers !== null
        && !Array.isArray(mcpManifest.mcpServers)
        && Object.keys(mcpManifest.mcpServers).length > 0
      ) {
        capabilities.add('mcp-registration')
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
  plugin: string,
  target: TargetId,
  source: string,
  emitted: readonly CapabilityId[],
  limitations: readonly EmissionLimitation[],
): void {
  const actual = new Set(emitted)
  for (const limitation of limitations) {
    if (limitation.code === 'SETTING_DROPPED') continue
    const capability = componentCapability[limitation.component]
    if (limitation.code === 'COMPONENT_OMITTED' && actual.has(capability)) {
      throw capabilityError(
        'CAPABILITY_LIMITATION_CONTRADICTION', plugin, target, source, `targets.${target}.expected_capabilities`,
        `adapter "${target}" reports ${limitation.component} omitted while emitting ${capability}`,
        'Remove the contradictory limitation or emitted capability.',
      )
    }
  }
}

export function validateEmittedCapabilities(
  plugin: string,
  target: TargetId,
  expected: readonly CapabilityId[],
  emitted: readonly CapabilityId[],
  intent: TargetIntent = 'preview',
  source = 'moe-mint.yaml',
): CapabilityId[] {
  const normalizedExpected = normalized(expected)
  const normalizedEmitted = normalized(emitted)
  const field = `targets.${target}.expected_capabilities`
  if (normalizedExpected.length !== expected.length) {
    throw capabilityError(
      'CAPABILITY_EXPECTED_DUPLICATE', plugin, target, source, field,
      `plugin "${plugin}" target "${target}" declares duplicate expected capabilities`,
      'Declare every expected capability once in canonical capability order.',
    )
  }
  if (!sameOrder(expected, normalizedExpected)) {
    throw capabilityError(
      'CAPABILITY_EXPECTED_NONCANONICAL', plugin, target, source, field,
      `plugin "${plugin}" target "${target}" expected capabilities are not in canonical order`,
      'Sort expected capabilities in the canonical capability order.',
    )
  }
  if (intent === 'omit') {
    if (normalizedEmitted.length !== 0) throw capabilityError(
      'CAPABILITY_OMITTED_EMITTED', plugin, target, source, field,
      `plugin "${plugin}" omitted target "${target}" emitted capabilities`,
      'Remove emitted capabilities for the omitted target.',
    )
    return normalizedEmitted
  }
  if (normalizedEmitted.length !== emitted.length) {
    throw capabilityError('CAPABILITY_EMITTED_DUPLICATE', plugin, target, source, field, `plugin "${plugin}" target "${target}" emitted duplicate capabilities`, 'Emit each capability once.')
  }
  const missing = normalizedExpected.filter((capability) => !normalizedEmitted.includes(capability))
  if (missing.length) throw capabilityError('CAPABILITY_EMITTED_MISSING', plugin, target, source, field, `plugin "${plugin}" target "${target}" is missing capabilities: ${missing.join(', ')}`, 'Emit every declared capability or correct the target declaration.')
  const extra = normalizedEmitted.filter((capability) => !normalizedExpected.includes(capability))
  if (extra.length) throw capabilityError('CAPABILITY_EMITTED_UNDECLARED', plugin, target, source, field, `plugin "${plugin}" target "${target}" emitted undeclared capabilities: ${extra.join(', ')}`, 'Declare every emitted capability or stop emitting it.')
  return normalizedEmitted
}

export function validateTargetEmission(
  plugin: string,
  target: TargetId,
  policy: PluginTargetIntent,
  emitted: readonly CapabilityId[],
  limitations: readonly EmissionLimitation[],
  source = 'moe-mint.yaml',
): CapabilityId[] {
  const normalizedEmission = validateEmittedCapabilities(plugin, target, policy.expectedCapabilities, emitted, policy.intent, source)
  validateEmissionLimitations(plugin, target, source, normalizedEmission, limitations)
  return normalizedEmission
}
