import type { PluginModel } from '../model.js'
import type { HarnessAdapter } from './types.js'
import { marketplaceName } from './shared.js'

// GitHub Copilot CLI reads Claude Code's marketplace descriptor and installs
// the Claude-format plugin layout. It has no Copilot-specific manifest for
// moe-mint to emit, so this adapter owns only the install documentation and the
// effective support-matrix row. Keeping it separate makes Copilot an explicit
// supported harness without introducing a Copilot-specific manifest format.
function installDoc(model: PluginModel): string {
  const { config } = model
  const repository = config.repository ?? '<your-repo>'

  return [
    '## What gets emitted',
    '',
    "- no Copilot-specific files; Copilot installs the Claude Code layout through `.claude-plugin/marketplace.json`",
    '',
    '## Installing',
    '',
    '```',
    `copilot plugin marketplace add ${repository}`,
    `copilot plugin install ${config.name}@${marketplaceName(config)}`,
    '```',
    '',
    "Copilot installs the plugin's Claude Code layout (skills/, commands/, agents/, hooks/, .mcp.json), so the `claude-code` adapter must remain enabled. Consult Copilot's plugin docs if these commands don't match your installed version.",
  ].join('\n')
}

export const copilot = Object.freeze({
  name: 'copilot',
  support: {
    skills: 'full',
    commands: 'full',
    agents: 'full',
    hooks: 'full',
    mcp: 'full',
    bootstrap: 'full',
    rules: 'none',
    variables: 'none',
  } as const,
  skillsOutputDir: undefined,
  installDoc,
  emit(_model: PluginModel) {
    // Copilot consumes Claude's validated marketplace layout. Generation
    // replaces the empty local set with its projection owner's capabilities.
    return { files: [], limitations: [], emittedCapabilities: [], projectionOwner: 'claude-code' as const }
  },
}) satisfies HarnessAdapter
