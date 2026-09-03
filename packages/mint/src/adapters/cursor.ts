import { deepMerge } from '../fileset.js'
import type { GeneratedFile } from '../fileset.js'
import type { PluginModel } from '../model.js'
import type { HarnessAdapter, EmitResult } from './types.js'
import { sessionStartScript, runHookCmd } from '../bootstrap/shell-hook.js'
import { generatedBootstrap, GENERATED_BOOTSTRAP_PATH } from '../bootstrap/generated.js'
import { baseManifestFields, json, bootstrapEmitsHooks, marketplaceName } from './shared.js'

// Where the cursor adapter emits the bootstrap SessionStart hook and its
// hooks-cursor.json, when config.bootstrap.kind === 'skill'. Shares the
// hooks/moe-mint directory (and the session-start/run-hook.cmd files)
// with claude-code so the two adapters can coexist without duplication.
const BOOTSTRAP_HOOKS_DIR = 'hooks/moe-mint'
const BOOTSTRAP_HOOKS_JSON_PATH = `${BOOTSTRAP_HOOKS_DIR}/hooks-cursor.json`

// Cursor's MCP config is emitted inside .cursor-plugin/ to avoid colliding
// with agent-plugins.ts's root-level mcp.json. The manifest's mcpServers
// field points at this relative path.
const CURSOR_MCP_PATH = '.cursor-plugin/mcp.json'

function pluginManifest(model: PluginModel): Record<string, unknown> {
  const { config } = model
  // Splice displayName after name and swap description/version ahead of the
  // author/homepage/.../keywords tail (which already matches
  // baseManifestFields' order) to keep cursor's on-disk field order
  // byte-identical to its pre-refactor output.
  const { version, description, ...rest } = baseManifestFields(config)
  const manifest: Record<string, unknown> = {
    name: config.name,
    displayName: config.name,
    description,
    version,
    ...rest,
  }
  manifest.skills = `./${config.components.skills}/`

  // Emit category and tags from marketplace config when present.
  if (config.marketplace?.category) manifest.category = config.marketplace.category
  if (config.marketplace?.tags?.length) manifest.tags = config.marketplace.tags

  // Point at commands/ and agents/ source directories when the model has entries.
  if (model.commands.length) manifest.commands = `./${config.components.commands}/`
  if (model.agents.length) manifest.agents = `./${config.components.agents}/`

  // Point at the translated MCP config when present.
  if (model.mcp !== undefined) manifest.mcpServers = `./${CURSOR_MCP_PATH}`

  if (bootstrapEmitsHooks(config, cursor.name)) {
    manifest.hooks = `./${BOOTSTRAP_HOOKS_JSON_PATH}`
  }
  const override = config.harnesses.settings.cursor?.manifest
  return override ? (deepMerge(manifest, override) as Record<string, unknown>) : manifest
}

function hooksManifest(): Record<string, unknown> {
  return {
    version: 1,
    hooks: {
      sessionStart: [{ command: `./${BOOTSTRAP_HOOKS_DIR}/run-hook.cmd session-start` }],
    },
  }
}

// Cursor's marketplace.json format: { name, owner, metadata, plugins }.
// Emitted into .cursor-plugin/marketplace.json, parallel to claude-code's
// .claude-plugin/marketplace.json but using Cursor's multi-plugin format.
function cursorMarketplaceManifest(model: PluginModel): Record<string, unknown> {
  const { config } = model
  const name = marketplaceName(config)
  const manifest: Record<string, unknown> = {
    name,
    owner: {
      name: config.author?.name ?? config.name,
      ...(config.author?.email ? { email: config.author.email } : {}),
    },
  }
  if (config.description) {
    manifest.metadata = { description: config.description }
  }
  manifest.plugins = [
    {
      name: config.name,
      source: './',
      description: config.description,
    },
  ]
  return manifest
}

// Ground truth per Design decision 4: `/add-plugin` in Cursor Agent chat, or
// marketplace search once listed there — no fabricated marketplace listing.
function installDoc(model: PluginModel): string {
  const { config } = model
  const bootstrapActive = bootstrapEmitsHooks(config, cursor.name)

  const emitted = ['`.cursor-plugin/plugin.json`', '`.cursor-plugin/marketplace.json`']
  if (bootstrapActive) {
    emitted.push(`the \`${BOOTSTRAP_HOOKS_DIR}\` bootstrap hook and its \`${BOOTSTRAP_HOOKS_JSON_PATH}\``)
  }
  if (model.mcp !== undefined) {
    emitted.push('`.cursor-plugin/mcp.json`, translated from the plugin\'s MCP server config')
  }

  const lines = [
    '## What gets emitted',
    '',
    ...emitted.map((e) => `- ${e}`),
    '',
    '## Installing',
    '',
    'From the Cursor Agent chat:',
    '',
    '```',
    '/add-plugin',
    '```',
    '',
    "Point it at this plugin's directory (or search the plugin marketplace once it's listed there). Cursor reads `.cursor-plugin/plugin.json`. Consult Cursor's plugin docs if this doesn't match your installed version.",
  ]
  const caveats: string[] = []
  if (model.hooks !== undefined) {
    // Cursor never translates hand-written hook entries, in either bootstrap
    // mode; only which (if any) bootstrap hook is emitted varies.
    const bootstrapHookNote = bootstrapActive
      ? 'only the bootstrap sessionStart hook is emitted'
      : 'no hooks are emitted for Cursor'
    caveats.push(
      `- Hand-written entries in \`${config.components.hooks}\` are not translated for Cursor; ${bootstrapHookNote}.`,
    )
  }
  if (caveats.length) {
    lines.push('', '## Caveats', '', ...caveats)
  }
  return lines.join('\n')
}

export const cursor: HarnessAdapter = {
  name: 'cursor',
  support: {
    skills: 'full',
    commands: 'full',
    agents: 'full',
    hooks: 'partial',
    mcp: 'full',
    bootstrap: 'full',
    rules: 'none',
    variables: 'none',
  },
  skillsOutputDir: '.cursor-plugin/skills',
  installDoc,
  emit(model: PluginModel): EmitResult {
    const { config } = model
    const warnings: string[] = []
    const files: GeneratedFile[] = [{ path: '.cursor-plugin/plugin.json', content: json(pluginManifest(model)) }]

    // Emit Cursor marketplace.json.
    files.push({ path: '.cursor-plugin/marketplace.json', content: json(cursorMarketplaceManifest(model)) })

    // Emit MCP config when present. Placed inside .cursor-plugin/ to avoid
    // colliding with agent-plugins.ts's root-level mcp.json.
    if (model.mcp !== undefined) {
      files.push({ path: CURSOR_MCP_PATH, content: json(model.mcp) })
    }

    const emitHooks = bootstrapEmitsHooks(config, cursor.name)
    if (config.bootstrap.kind === 'skill') {
      const skillName = config.bootstrap.skill
      const skill = model.skills.find((s) => s.name === skillName)
      if (!skill) {
        // buildModel validates the bootstrap skill exists before adapters run.
        throw new Error(`bootstrap skill "${skillName}" not found (buildModel should have validated this)`)
      }
      if (emitHooks) {
        files.push(
          {
            path: `${BOOTSTRAP_HOOKS_DIR}/session-start`,
            content: sessionStartScript({ pluginName: config.name, bootstrapContentPath: `${skill.dir}/SKILL.md` }),
            executable: true,
          },
          { path: `${BOOTSTRAP_HOOKS_DIR}/run-hook.cmd`, content: runHookCmd(), executable: true },
          { path: BOOTSTRAP_HOOKS_JSON_PATH, content: json(hooksManifest()) },
        )
      }
    } else if (config.bootstrap.kind === 'generate') {
      // The generated bootstrap content file is emitted regardless of
      // emitHooks: other adapters (opencode and pi) read it at
      // runtime, independent of whether cursor wires its own shell hook to
      // it.
      files.push({ path: GENERATED_BOOTSTRAP_PATH, content: generatedBootstrap(model) })
      if (emitHooks) {
        files.push(
          {
            path: `${BOOTSTRAP_HOOKS_DIR}/session-start`,
            content: sessionStartScript({ pluginName: config.name, bootstrapContentPath: GENERATED_BOOTSTRAP_PATH }),
            executable: true,
          },
          { path: `${BOOTSTRAP_HOOKS_DIR}/run-hook.cmd`, content: runHookCmd(), executable: true },
          { path: BOOTSTRAP_HOOKS_JSON_PATH, content: json(hooksManifest()) },
        )
      }
    }

    if (model.hooks !== undefined) warnings.push('user hooks are not translated for cursor in v1')

    return { files, warnings }
  },
}
