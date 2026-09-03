import type { PluginModel } from '../model.js'
import type { HarnessAdapter, EmitResult } from './types.js'
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

export const copilot: HarnessAdapter = {
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
  },
  skillLayout: {
    outputDir: '.claude-plugin/skills',
    profile: 'claude-code',
    mode: 'rendered',
  },
  installDoc,
  emit(model: PluginModel): EmitResult {
    const warnings = model.config.harnesses.exclude.includes('claude-code')
      ? ['copilot requires the claude-code adapter; no installable layout will be emitted']
      : []
    return { files: [], warnings }
  },
}
