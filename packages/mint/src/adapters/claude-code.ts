import { deepMerge } from '../fileset.js'
import type { GeneratedFile } from '../fileset.js'
import type { PluginModel } from '../model.js'
import type { MintConfig } from '../config.js'
import type { HarnessAdapter } from './types.js'
import { deriveEmittedCapabilities } from '../platform/capabilities.js'
import { sessionStartScript, runHookCmd, mergedClaudeHooks } from '../bootstrap/shell-hook.js'
import { generatedBootstrap, GENERATED_BOOTSTRAP_PATH } from '../bootstrap/generated.js'
import { baseManifestFields, json, claudeMarketplaceTarget, marketplaceName, bootstrapEmitsHooks } from './shared.js'

// Where the claude-code adapter emits the bootstrap SessionStart hook and its
// merged hooks.json, when config.bootstrap.kind === 'skill'.
//
// plugin.json's `hooks` key points at this merged file while the user's own
// hooks/hooks.json stays at Claude Code's auto-discovery default path.
// CONFIRMED (2026-08-11, empirical, Claude Code 2.1.217; see
// docs/history/2026-08-11-hook-double-fire-findings.md): Claude
// Code reads and registers hooks from *both* files (supplement, not
// replace), but dedupes exact-duplicate {matcher, command} entries at
// execution time, so a hook does not fire twice just because it appears
// (byte-identically) in both files. Since mergedClaudeHooks() always clones
// the user's hooks verbatim into the merged file, user hooks do not
// double-fire; the bootstrap SessionStart entry (only in the merged file)
// fires exactly once. This only holds while the merged file is in sync with
// the source, which `generate()` guarantees on every run.
const BOOTSTRAP_HOOKS_DIR = 'hooks/moe-mint'
const BOOTSTRAP_HOOKS_JSON_PATH = `${BOOTSTRAP_HOOKS_DIR}/hooks.json`

function pluginManifest(model: PluginModel): Record<string, unknown> {
  const { config } = model
  const base = baseManifestFields(config)
  // license/repository/homepage are in the opposite sub-order from
  // baseManifestFields' own return value -- a historical artifact, not a
  // requirement. JSON key order is explicitly not a goal anywhere in
  // moe-mint (see Finding 3's Resolution and the ruling note in
  // docs/history/2026-08-11-dogfood-findings.md).
  const manifest: Record<string, unknown> = { name: base.name, version: base.version, description: base.description }
  if ('author' in base) manifest.author = base.author
  if ('license' in base) manifest.license = base.license
  if ('repository' in base) manifest.repository = base.repository
  if ('homepage' in base) manifest.homepage = base.homepage
  if ('keywords' in base) manifest.keywords = base.keywords
  // Claude Code auto-discovers commands/, agents/, skills/, hooks/hooks.json,
  // and .mcp.json; only non-default locations need explicit manifest keys.
  if (model.skills.length && config.components.skills !== 'skills') {
    manifest.skills = `./${config.components.skills}`
  }
  if (model.commands.length && config.components.commands !== 'commands') {
    manifest.commands = `./${config.components.commands}`
  }
  if (model.agents.length && config.components.agents !== 'agents') {
    manifest.agents = `./${config.components.agents}`
  }
  if (bootstrapEmitsHooks(config, claudeCode.name)) {
    // Bootstrap hooks always live at a non-default path, and always exist
    // (even with no user hooks), so this takes priority over the general
    // non-default-path rule below.
    manifest.hooks = `./${BOOTSTRAP_HOOKS_JSON_PATH}`
  } else if (model.hooks !== undefined && config.components.hooks !== 'hooks/hooks.json') {
    manifest.hooks = `./${config.components.hooks}`
  }
  if (model.mcp !== undefined && config.components.mcp !== '.mcp.json') {
    manifest.mcpServers = `./${config.components.mcp}`
  }
  const override = config.harnesses.settings['claude-code']?.manifest
  return override ? (deepMerge(manifest, override) as Record<string, unknown>) : manifest
}

// Marketplace plugin entry `source`: 'local' (or absent) keeps the local-dev
// path './'; 'repository' resolves to the top-level `repository` URL (Task 1's
// loadConfig rejects `source: repository` unless `repository` is set, so it's
// always present here); an explicit http(s) URL string is used as-is. Both
// non-local forms use Claude Code's `{ source: 'url', url }` shape.
function marketplaceSource(config: MintConfig): unknown {
  const source = config.marketplace?.source
  if (source === undefined || source === 'local') return './'
  return { source: 'url', url: source === 'repository' ? config.repository : source }
}

function marketplaceManifest(model: PluginModel): Record<string, unknown> {
  const { config } = model
  const entry: Record<string, unknown> = {
    name: config.name,
    description: config.description,
    version: config.version,
    source: marketplaceSource(config),
  }
  if (config.author) entry.author = config.author
  if (config.marketplace?.category) entry.category = config.marketplace.category
  if (config.marketplace?.tags) entry.keywords = config.marketplace.tags
  if (config.marketplace?.strict !== undefined) entry.strict = config.marketplace.strict
  const marketplace: Record<string, unknown> = {
    name: marketplaceName(config),
    description: config.marketplace?.description ?? `Development marketplace for ${config.name}`,
    plugins: [entry],
  }
  // `owner` is required by Claude Code's marketplace descriptor schema, but
  // `author` is optional in moe-mint.yaml (and `moe-mint init` does not
  // scaffold one) — an authorless config previously omitted `owner`
  // entirely, so `claude plugin validate --strict` rejected the descriptor.
  // Fall back to a name-only object so it is always well-formed.
  marketplace.owner = config.author ?? { name: config.name }
  return marketplace
}

// Ground truth per Design decision 4: `claude /plugin marketplace add REPO`
// then `/plugin install <name>@<marketplace-name>`, with REPO substituted
// from config.repository — `owner/repo` shorthand for github.com URLs and
// the full URL for any other supported host (`gitlab.example.com`, etc.);
// falls back to `<your-repo>` only for ssh/file inputs or when no repository
// is set. Marketplace-name resolved by marketplaceName() —
// config.marketplace.name when set, otherwise the local-dev default
// `<name>-dev`.
function installDoc(model: PluginModel): string {
  const { config } = model
  const repo = claudeMarketplaceTarget(config.repository) ?? '<your-repo>'
  const bootstrapActive = bootstrapEmitsHooks(config, claudeCode.name)

  const emitted = ['`.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`']
  if (bootstrapActive) {
    emitted.push(
      `the \`${BOOTSTRAP_HOOKS_DIR}\` bootstrap hook and its merged \`${BOOTSTRAP_HOOKS_JSON_PATH}\``,
    )
  }

  const lines = [
    '## What gets emitted',
    '',
    ...emitted.map((e) => `- ${e}`),
    '',
    '## Installing',
    '',
    'Register the marketplace, then install the plugin:',
    '',
    '```',
    `claude /plugin marketplace add ${repo}`,
    '```',
    '',
    '```',
    `/plugin install ${config.name}@${marketplaceName(config)}`,
    '```',
    '',
    "If the marketplace is already registered, only the install command is needed. Consult Claude Code's plugin docs if these commands don't match your installed version.",
  ]
  if (bootstrapActive) {
    lines.push(
      '',
      '## Caveats',
      '',
      `- Hand-written entries in \`${config.components.hooks}\` are merged into the generated \`${BOOTSTRAP_HOOKS_JSON_PATH}\`; edit the source file, not the generated file.`,
    )
  }
  return lines.join('\n')
}

export const claudeCode: HarnessAdapter = {
  name: 'claude-code',
  installDoc,
  emit(model: PluginModel) {
    const { config } = model
    const files: GeneratedFile[] = [
      { path: '.claude-plugin/plugin.json', content: json(pluginManifest(model)) },
      { path: '.claude-plugin/marketplace.json', content: json(marketplaceManifest(model)) },
    ]
    const emitHooks = bootstrapEmitsHooks(config, claudeCode.name)
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
          { path: BOOTSTRAP_HOOKS_JSON_PATH, content: json(mergedClaudeHooks(model.hooks)) },
        )
      }
    } else if (config.bootstrap.kind === 'generate') {
      // The generated bootstrap content file is emitted regardless of
      // emitHooks: other adapters (opencode and pi) read it at
      // runtime, independent of whether claude-code wires its own shell hook
      // to it.
      files.push({ path: GENERATED_BOOTSTRAP_PATH, content: generatedBootstrap(model) })
      if (emitHooks) {
        files.push(
          {
            path: `${BOOTSTRAP_HOOKS_DIR}/session-start`,
            content: sessionStartScript({ pluginName: config.name, bootstrapContentPath: GENERATED_BOOTSTRAP_PATH }),
            executable: true,
          },
          { path: `${BOOTSTRAP_HOOKS_DIR}/run-hook.cmd`, content: runHookCmd(), executable: true },
          { path: BOOTSTRAP_HOOKS_JSON_PATH, content: json(mergedClaudeHooks(model.hooks)) },
        )
      }
    }
    return { files, limitations: [], emittedCapabilities: deriveEmittedCapabilities('claude-code', model, files) }
  },
}
