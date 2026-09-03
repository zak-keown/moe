// ──────────────────────────────────────────────────────────────────────
// Apache Maka — SKELETON adapter (not registered in the live pipeline)
// ──────────────────────────────────────────────────────────────────────
//
// Status: EXPERIMENTAL / SPECULATIVE — do NOT wire into adapters/index.ts
// or ADAPTER_NAMES in config.ts until the Maka plugin spec is confirmed.
//
// Apache Maka entered the Apache Incubator on 2026-08-13. It is a
// local-first coding-agent harness with three surfaces (Desktop, TUI,
// CLI) sharing one Runtime Host. The adapter pattern is closest to
// opencode/pi: a JS/TS module loaded by the Runtime Host that registers
// a skills directory and optionally injects bootstrap content.
//
// What is KNOWN (from public incubator proposal + README):
//   - Local-first: Desktop (Electron), TUI, CLI share one Runtime Host
//   - Plugin surface exists ("Runtime Host extensions")
//   - MCP listed as a supported protocol
//   - Apache-2.0 licensed
//
// What is UNKNOWN (needs verification before emit() does real work):
//   - Manifest filename and JSON/YAML schema
//   - Plugin discovery path (.maka/, maka-plugin/, package.json field?)
//   - Install CLI command (maka install? maka plugin add?)
//   - Whether Desktop/TUI/CLI each need separate wiring or share one loader
//   - Skill loading mechanism (directory registration? frontmatter format?)
//   - Command / agent translation surface
//   - Hook system (if any)
//   - MCP integration shape (mcp.json? inline config? .maka/mcp.json?)
//   - Bootstrap injection point (system prompt? first-message? lifecycle hook?)
//   - Whether Maka uses a package.json entry point or its own config file
//
// Until the unknowns above are resolved, emit() returns no files and a
// warning. The support matrix is conservatively set to 'none' for every
// component except skills (set to 'partial' because directory-based
// loading is a reasonable assumption for any modern harness, but is
// unverified).
// ──────────────────────────────────────────────────────────────────────

import type { PluginModel } from '../model.js'
import type { HarnessAdapter, AdapterEmission } from './types.js'

function installDoc(_model: PluginModel): string {
  return [
    '## Status',
    '',
    'The Apache Maka adapter is a **placeholder**. Apache Maka entered the',
    'Apache Incubator on 2026-08-13; its plugin API is not yet documented',
    'well enough for moe-mint to emit files against it.',
    '',
    '## What gets emitted',
    '',
    '- nothing yet',
    '',
    '## Installing',
    '',
    'The install mechanism is not yet known. Consult the Apache Maka docs',
    'when they publish a plugin/extension guide.',
    '',
    '## What we expect (speculative)',
    '',
    '- A Runtime Host extension module (JS/TS) that registers the skills',
    '  directory, similar to the opencode and pi adapters.',
    '- Possibly a manifest file under `.maka/` or a `maka` field in',
    '  `package.json`.',
    '- MCP integration through whatever surface the Runtime Host exposes.',
  ].join('\n')
}

export const maka: HarnessAdapter = {
  name: 'maka',
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
      limitations: [{
        code: 'COMPONENT_OMITTED',
        component: 'skills',
        message: 'maka adapter is a placeholder; no files emitted (Apache Maka plugin spec is not yet confirmed)',
      }],
      emittedCapabilities: [],
    }
  },
}
