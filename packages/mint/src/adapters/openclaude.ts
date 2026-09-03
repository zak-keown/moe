// ──────────────────────────────────────────────────────────────────────
// OpenClaude — SKELETON adapter (not registered in the live pipeline)
// ──────────────────────────────────────────────────────────────────────
//
// Status: EXPERIMENTAL / SPECULATIVE — do NOT wire into adapters/index.ts
// or ADAPTER_NAMES in config.ts until the OpenClaude plugin spec is
// confirmed.
//
// OpenClaude is a multi-provider CLI coding agent with substantial
// community traction (~32k GitHub stars as of 2026-09). The adapter
// pattern is closest to codex (CLI-only, no desktop surface). Being
// multi-provider, its plugin surface may abstract across model
// providers rather than assuming a single LLM backend.
//
// What is KNOWN (from public GitHub repo / README):
//   - CLI-only multi-provider coding agent
//   - Active open-source community (~32k stars)
//   - MIT licensed
//   - Supports multiple LLM providers (the "open" in OpenClaude)
//
// What is UNKNOWN (needs verification before emit() does real work):
//   - Manifest filename and schema (.openclaude/? openclaude.json? .oc/?)
//   - Plugin discovery mechanism (directory convention? config file? CLI?)
//   - Install CLI command (openclaude install? oc plugin add?)
//   - Whether it uses its own marketplace or piggybacks on another
//   - Skill loading mechanism (markdown with frontmatter? directory-based?)
//   - Command / slash-command translation surface
//   - Agent definition format (if multi-agent is supported)
//   - Hook system shape (pre/post hooks? lifecycle events?)
//   - MCP integration (multi-provider CLI likely supports MCP, but shape?)
//   - Bootstrap injection mechanism (system prompt? config? first-message?)
//   - Whether skills are loaded as markdown or via a different mechanism
//
// Until the unknowns above are resolved, emit() returns no files and a
// warning. The support matrix is conservatively set to 'none' for every
// component except skills (set to 'partial' — directory-based loading is
// a reasonable assumption, but unverified).
// ──────────────────────────────────────────────────────────────────────

import type { PluginModel } from '../model.js'
import type { HarnessAdapter, AdapterEmission } from './types.js'

function installDoc(_model: PluginModel): string {
  return [
    '## Status',
    '',
    'The OpenClaude adapter is a **placeholder**. OpenClaude has community',
    'traction but its plugin API has not been studied well enough for',
    'moe-mint to emit files against it.',
    '',
    '## What gets emitted',
    '',
    '- nothing yet',
    '',
    '## Installing',
    '',
    'The install mechanism is not yet known. Consult the OpenClaude docs',
    'or repository when a plugin/extension guide is available.',
    '',
    '## What we expect (speculative)',
    '',
    '- A plugin manifest under `.openclaude/` or a top-level',
    '  `openclaude.json`, similar to how codex uses `.codex-plugin/`.',
    '- CLI slash-commands translated from the plugin\'s commands/ directory.',
    '- MCP integration through whatever surface the multi-provider CLI',
    '  exposes.',
    '- Bootstrap injection via system prompt or a config-level mechanism.',
  ].join('\n')
}

export const openclaude: HarnessAdapter = {
  name: 'openclaude',
  support: {
    skills: 'partial',
    commands: 'none',
    agents: 'none',
    hooks: 'none',
    mcp: 'none',
    bootstrap: 'none',
    rules: 'none',
    variables: 'none',
  },
  installDoc,
  emit(_model: PluginModel): AdapterEmission {
    return {
      files: [],
      limitations: [{ code: 'COMPONENT_OMITTED', component: 'skills', message: 'openclaude adapter is a placeholder; no files emitted (OpenClaude plugin spec is not yet confirmed)' }],
      emittedCapabilities: [],
    }
  },
}
