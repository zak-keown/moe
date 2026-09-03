import { deepMerge } from '../fileset.js'
import type { GeneratedFile } from '../fileset.js'
import type { PluginModel } from '../model.js'
import type { ComponentSupport, HarnessAdapter, EmissionLimitation } from './types.js'
import { deriveEmittedCapabilities } from '../platform/capabilities.js'
import { baseManifestFields, json } from './shared.js'

function pluginManifest(model: PluginModel): Record<string, unknown> {
  const { config } = model
  const manifest: Record<string, unknown> = { ...baseManifestFields(config) }
  manifest.skills = `./${config.components.skills}/`
  // Codex's loader auto-registers hooks/hooks.json unless the manifest holds
  // a literal empty object here — this avoids duplicate trust prompts.
  manifest.hooks = {}
  const override = config.harnesses.settings.codex?.manifest
  return override ? (deepMerge(manifest, override) as Record<string, unknown>) : manifest
}

// Codex's marketplace commands read the Agent Plugins marketplace descriptor
// at `.agents/plugins/marketplace.json`. The descriptor remains because it is
// part of Codex's install path and is emitted and owned by this adapter.
function marketplaceDescriptor(model: PluginModel): Record<string, unknown> {
  const { config } = model
  const entry: Record<string, unknown> = {
    name: config.name,
    source: { source: 'url', url: './' },
    policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
  }
  if (config.marketplace?.category) entry.category = config.marketplace.category

  return {
    name: `${config.name}-dev`,
    interface: { displayName: config.name },
    plugins: [entry],
  }
}

// Ground truth per Design decision 4: `/plugins` in Codex CLI or the Codex
// App plugin sidebar — no session hook exists, so there is nothing to name
// as an install-time mechanism beyond native skill discovery.
function installDoc(_model: PluginModel): string {
  const lines = [
    '## What gets emitted',
    '',
    "- `.codex-plugin/plugin.json` (with an empty `hooks` object, which suppresses Codex's automatic `hooks/hooks.json` registration)",
    '- `.agents/plugins/marketplace.json`, used by Codex marketplace installation',
    '',
    '## Installing',
    '',
    'From Codex CLI or the Codex App plugin sidebar:',
    '',
    '```',
    '/plugins',
    '```',
    '',
    "Codex discovers this plugin's skills natively; there is no session-start hook to configure. Consult Codex's plugin docs if this doesn't match your installed version.",
    '',
    '## Caveats',
    '',
    '- Hooks and commands are not supported on Codex; bootstrap relies entirely on native skill discovery, with no active injection mechanism.',
  ]
  return lines.join('\n')
}

export const codex: HarnessAdapter = Object.freeze({
  name: 'codex',
  support: {
    skills: 'full',
    commands: 'none',
    agents: 'none',
    hooks: 'none',
    mcp: 'none',
    bootstrap: 'partial',
    rules: 'none',
    variables: 'none',
  } satisfies ComponentSupport,
  skillLayout: { outputDir: '.codex-plugin/skills', profile: 'codex', mode: 'rendered' as const },
  skillDelivery: 'rendered',
  installDoc,
  emit(model: PluginModel) {
    const limitations: EmissionLimitation[] = []
    const files: GeneratedFile[] = [
      { path: '.codex-plugin/plugin.json', content: json(pluginManifest(model)) },
      { path: '.agents/plugins/marketplace.json', content: json(marketplaceDescriptor(model)) },
    ]

    if (model.hooks !== undefined) {
      limitations.push({ code: 'COMPONENT_OMITTED', component: 'hooks', message: 'hooks are not supported on codex; bootstrap relies on native skill discovery' })
    }
    if (model.commands.length) limitations.push({ code: 'COMPONENT_OMITTED', component: 'commands', message: 'commands are not supported on codex (no plugin-shipped prompt mechanism)' })
    if (model.agents.length) limitations.push({ code: 'COMPONENT_OMITTED', component: 'agents', message: 'agents are not emitted for codex in v1' })
    if (model.mcp !== undefined) limitations.push({ code: 'COMPONENT_OMITTED', component: 'mcp', message: 'mcp servers are not emitted for codex in v1' })

    return { files, limitations, emittedCapabilities: deriveEmittedCapabilities('codex', model, files) }
  },
})
