import type { PluginModel } from '../model.js'
import { GENERATED_BOOTSTRAP_PATH } from './generated.js'

// Repo-relative path (no leading `./`) of the OpenCode plugin file for a
// plugin named `name`. Shared by the OpenCode contribution and its emitted
// file path, so the package export can never drift from the actual module.
export function opencodePluginPath(name: string): string {
  return `.opencode/plugins/${name}.js`
}

// Repo-relative path (no leading `./`) of the Pi extension file for a
// plugin named `name`. Shared by Pi discovery metadata and the adapter's
// own emitted file path.
export function piExtensionPath(name: string): string {
  return `.pi/extensions/${name}.ts`
}

export function opencodeServerExport(name: string): Readonly<Record<string, string>> {
  return { './server': `./${opencodePluginPath(name)}` }
}

export function piDiscoveryMetadata(model: PluginModel): Readonly<Record<string, unknown>> {
  const { config } = model
  return {
    extensions: [`./${piExtensionPath(config.name)}`],
    skills: [`./${config.components.skills}`],
  }
}

// Repo-relative path (from the plugin root) to the bootstrap content a
// plugin should inject, or undefined when bootstrap.kind is 'none'. Shared
// by the opencode and pi adapters, whose in-process templates both resolve
// the same skill-SKILL.md / generated-bootstrap.md path.
export function bootstrapContentPath(model: PluginModel): string | undefined {
  const { config } = model
  if (config.bootstrap.kind === 'skill') {
    const skillName = config.bootstrap.skill
    const skill = model.skills.find((s) => s.name === skillName)
    if (!skill) {
      // buildModel validates the bootstrap skill exists before adapters run.
      throw new Error(`bootstrap skill "${skillName}" not found (buildModel should have validated this)`)
    }
    return `${skill.dir}/SKILL.md`
  }
  if (config.bootstrap.kind === 'generate') {
    return GENERATED_BOOTSTRAP_PATH
  }
  return undefined
}
