import type { GeneratedFile } from '../fileset.js'
import type { PluginModel } from '../model.js'
import type { HarnessAdapter, EmissionLimitation } from './types.js'
import { deriveEmittedCapabilities } from '../platform/capabilities.js'
import { baseManifestFields, json } from './shared.js'

// Agent Plugins 1.0 (https://agent-plugins.org) only defines skills/ and
// root-level plugin.json / mcp.json. Commands, agents, hooks, and bootstrap
// therefore become typed emission limitations when present; emitted
// capabilities are calculated from the resulting format projection.
//
// The spec's standard skills location IS skills/ at the plugin root. When
// components.skills is customized we can't relocate the manifest to point
// at it (the spec has no such key), so the resulting omission is represented
// by a typed skills limitation rather than a static support claim.
//
// plugin.json's schema is CLOSED (additionalProperties: false), unlike the
// other adapters' manifests. A general deepMerge of the full manifest
// patch would let harnesses['agent-plugins-1.0'].manifest inject
// arbitrary top-level keys that fail schema validation, so — deliberately,
// unlike every other adapter — we do NOT deepMerge the override. Only its
// `extensions` sub-key is honored, and each entry is validated to be a
// plain object (the schema's only constraint on extension values) before
// being copied in.

const PLUGIN_SCHEMA = 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json'
const MCP_SCHEMA = 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json'
const NAME_PATTERN = /^(?!.*(?:--|\.\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/
const RESERVED_ENV_KEYS = new Set(['PLUGIN_ROOT', 'PLUGIN_DATA'])

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

// Check if mcpManifest(model) would return a manifest (used by both emit and installDoc).
function wouldEmitMcp(model: PluginModel): boolean {
  const mcp = model.mcp
  if (mcp === undefined) return false
  if (!isPlainObject(mcp) || !isPlainObject(mcp.mcpServers)) return false
  return model.config.components.mcp !== 'mcp.json'
}

// A stdio command must be a single executable token: either a bare name
// (no path separators, e.g. "node") or a "./"-prefixed relative path. The
// spec forbids shell strings (e.g. "node --experimental x.js").
function isValidStdioCommand(command: string): boolean {
  if (/\s/.test(command)) return false
  if (command.startsWith('./')) return true
  return !command.includes('/')
}

function pluginManifest(model: PluginModel): { manifest: Record<string, unknown>; warnings: string[] } {
  const { config } = model
  const warnings: string[] = []
  const manifest: Record<string, unknown> = { $schema: PLUGIN_SCHEMA, ...baseManifestFields(config) }

  const override = config.harnesses.settings['agent-plugins-1.0']?.manifest
  if (isPlainObject(override) && isPlainObject(override.extensions)) {
    const extensions: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(override.extensions)) {
      if (isPlainObject(value)) {
        extensions[key] = value
      } else {
        warnings.push(`extensions entry "${key}" is not an object; dropped`)
      }
    }
    if (Object.keys(extensions).length) manifest.extensions = extensions
  }

  return { manifest, warnings }
}

function translateMcpServer(name: string, source: unknown): { entry?: Record<string, unknown>; warnings: string[] } {
  const warnings: string[] = []
  if (!isPlainObject(source)) {
    warnings.push(`mcp server "${name}" could not be translated to Agent Plugins format; skipped`)
    return { warnings }
  }

  if (typeof source.command === 'string') {
    if (!isValidStdioCommand(source.command)) {
      warnings.push(`mcp server "${name}" command is not a single executable token; skipped`)
      return { warnings }
    }
    const entry: Record<string, unknown> = { type: 'stdio', command: source.command }
    if (Array.isArray(source.args)) entry.args = source.args
    if (isPlainObject(source.env)) {
      const env: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(source.env)) {
        if (RESERVED_ENV_KEYS.has(key)) {
          warnings.push(`mcp server "${name}" env key "${key}" is reserved by Agent Plugins; dropped`)
          continue
        }
        env[key] = value
      }
      if (Object.keys(env).length) entry.env = env
    }
    // Normalize a bare "." to "./".
    //
    // Both are the same path, and `cwd: "."` is a perfectly ordinary thing to
    // write in a Claude Code .mcp.json — but the Agent Plugins schema anchors
    // cwd on `^(?:\./|\$\{PLUGIN_ROOT\}(?:/|$)|\$\{PLUGIN_DATA\}(?:/|$))`, which
    // "." does not match. Passing it through verbatim meant valid input produced
    // output that mint's own `validate` then rejected — caught by wiring
    // packages/memory, whose .mcp.json says `"cwd": "."`.
    if (typeof source.cwd === 'string') entry.cwd = source.cwd === '.' ? './' : source.cwd
    return { entry, warnings }
  }

  if (typeof source.url === 'string') {
    const entry: Record<string, unknown> =
      source.type === 'sse' ? { type: 'sse', url: source.url } : { type: 'streamable-http', url: source.url }
    if (isPlainObject(source.headers)) entry.headers = source.headers
    return { entry, warnings }
  }

  warnings.push(`mcp server "${name}" could not be translated to Agent Plugins format; skipped`)
  return { warnings }
}

function mcpManifest(model: PluginModel): { manifest?: Record<string, unknown>; warnings: string[] } {
  const mcp = model.mcp
  if (mcp === undefined) return { warnings: [] }
  if (!isPlainObject(mcp) || !isPlainObject(mcp.mcpServers)) {
    return { warnings: ['mcp config has no mcpServers object; nothing translated for agent-plugins-1.0'] }
  }

  const warnings: string[] = []
  const mcpServers: Record<string, unknown> = {}
  for (const [name, source] of Object.entries(mcp.mcpServers)) {
    const { entry, warnings: serverWarnings } = translateMcpServer(name, source)
    warnings.push(...serverWarnings)
    if (entry) mcpServers[name] = entry
  }
  return { manifest: { $schema: MCP_SCHEMA, mcpServers }, warnings }
}

function limitationForWarning(message: string): EmissionLimitation {
  if (message.startsWith('commands are excluded')) {
    return { code: 'COMPONENT_OMITTED', component: 'commands', message }
  }
  if (message.startsWith('agents are excluded')) {
    return { code: 'COMPONENT_OMITTED', component: 'agents', message }
  }
  if (message.startsWith('hooks are excluded')) {
    return { code: 'COMPONENT_OMITTED', component: 'hooks', message }
  }
  if (message.startsWith('agent-plugins-1.0 requires skills/')) {
    return { code: 'COMPONENT_OMITTED', component: 'skills', message }
  }
  if (message.startsWith('mcp.json is occupied') || message.startsWith('mcp config has no mcpServers')) {
    return { code: 'COMPONENT_OMITTED', component: 'mcp', message }
  }
  if (message.startsWith('plugin name') || message.startsWith('extensions entry') || message.startsWith('mcp server')) {
    return { code: 'SETTING_DROPPED', component: 'mcp', message }
  }
  throw new Error(`unrecognized Agent Plugins emission warning: ${message}`)
}

// Ground truth per Design decision 4: Agent Plugins 1.0 has no install
// command of its own — any compliant client loads the plugin directory
// directly, so the doc points at that mechanism instead of a fabricated CLI
// invocation.
function installDoc(model: PluginModel): string {
  const { config } = model
  const emitted = ['`plugin.json`']
  if (wouldEmitMcp(model)) {
    emitted.push("`mcp.json`, translated from the plugin's MCP server config")
  }

  const caveats = ["- Commands, agents, and hooks are excluded from the Agent Plugins 1.0 spec entirely."]
  if (config.components.skills !== 'skills') {
    caveats.unshift(
      `- The spec requires skills at the fixed \`skills/\` location; \`${config.components.skills}/\` will not be discovered.`,
    )
  }

  const lines = [
    '## What gets emitted',
    '',
    ...emitted.map((e) => `- ${e}`),
    '',
    '## Installing',
    '',
    "Agent Plugins 1.0 has no install command of its own — any compliant client loads the plugin directory directly (root `plugin.json`, `skills/`, and `mcp.json` when present). Point your client at this plugin's directory; consult the client's own docs for its exact loading steps.",
    '',
    '## Caveats',
    '',
    ...caveats,
  ]
  return lines.join('\n')
}

export const agentPlugins: HarnessAdapter = Object.freeze({
  name: 'agent-plugins-1.0',
  support: {
    skills: 'full',
    commands: 'none',
    agents: 'none',
    hooks: 'none',
    mcp: 'full',
    bootstrap: 'none',
    rules: 'none',
    variables: 'none',
  },
  skillsOutputDir: undefined,
  installDoc,
  emit(model: PluginModel) {
    const { config } = model
    if (!NAME_PATTERN.test(config.name)) {
      return {
        files: [],
        limitations: [limitationForWarning(`plugin name "${config.name}" is not valid under the Agent Plugins 1.0 spec; skipping agent-plugins-1.0 output`)],
        emittedCapabilities: [],
      }
    }

    const warnings: string[] = []
    const files: GeneratedFile[] = []

    const { manifest, warnings: pluginWarnings } = pluginManifest(model)
    warnings.push(...pluginWarnings)
    files.push({ path: 'plugin.json', content: json(manifest) })

    // The Agent Plugins 1.0 on-disk name for the translated MCP config is
    // mcp.json at the plugin root. When the moe-mint source MCP config
    // has been pointed at that same path (components.mcp: mcp.json), writing
    // our translation there would clobber the user's actual source file —
    // so we skip the emission and say why, rather than overwrite it.
    if (config.components.mcp === 'mcp.json') {
      warnings.push(
        'mcp.json is occupied by the source MCP config (components.mcp); agent-plugins-1.0 mcp output skipped — rename the source to .mcp.json',
      )
    } else {
      const { manifest: mcp, warnings: mcpWarnings } = mcpManifest(model)
      warnings.push(...mcpWarnings)
      if (mcp) files.push({ path: 'mcp.json', content: json(mcp) })
    }

    if (config.components.skills !== 'skills') {
      warnings.push(
        `agent-plugins-1.0 requires skills/ at the plugin root; ${config.components.skills} will not be discovered`,
      )
    }
    if (model.commands.length) warnings.push('commands are excluded from the Agent Plugins 1.0 spec')
    if (model.agents.length) warnings.push('agents are excluded from the Agent Plugins 1.0 spec')
    if (model.hooks !== undefined) warnings.push('hooks are excluded from the Agent Plugins 1.0 spec')

    return {
      files,
      limitations: warnings.map(limitationForWarning),
      emittedCapabilities: deriveEmittedCapabilities('agent-plugins-1.0', model, files),
    }
  },
})
