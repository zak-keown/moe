import type { PluginModel } from '../model.js'
import { baseManifestFields } from '../adapters/shared.js'
import { GENERATED_BOOTSTRAP_PATH } from './generated.js'

export interface NodePackageSkillDirectories {
  opencode: string
  pi: string
}

export const NODE_PACKAGE_SKILL_DIRS: NodePackageSkillDirectories = {
  opencode: '.opencode/skills',
  pi: '.pi/skills',
}

// Repo-relative path (no leading `./`) of the OpenCode plugin file for a
// plugin named `name`. Shared by nodePackageManifest's `main` field and the
// opencode adapter's own emitted file path, so the two can never drift.
export function opencodePluginPath(name: string): string {
  return `.opencode/plugins/${name}.js`
}

// Repo-relative path (no leading `./`) of the Pi extension file for a
// plugin named `name`. Shared by nodePackageManifest's `pi.extensions`
// field and the pi adapter's own emitted file path.
export function piExtensionPath(name: string): string {
  return `.pi/extensions/${name}.ts`
}

// Root package.json shared by the OpenCode and Pi adapters. Both callers pass
// the same explicit canonical skill directories, and this builder emits both
// harness entry points unconditionally. The OpenCode directory is consumed by
// its generated `main` module while Pi's directory is declared directly under
// `pi.skills`; accepting both here makes the shared-file compatibility contract
// explicit and keeps the two emitted package.json files byte-identical.
//
// Also carries the present-only npm metadata fields (`author`, `license`,
// `repository`, `homepage`) via the shared baseManifestFields helper, in
// that order, spliced between `description` and `type` -- a real generated
// package.json is more useful to npm/registry tooling with this metadata
// than without it, and both adapters already emit an otherwise-empty
// package.json into the plugin root. baseManifestFields itself orders these
// fields differently (author, homepage, repository, license, keywords) for
// its other callers (claude-code/cursor/codex/kimi manifests), so the
// fields are picked off individually here rather than spread in bulk.
export function nodePackageManifest(
  model: PluginModel,
  skillDirectories: NodePackageSkillDirectories,
): Record<string, unknown> {
  const { config } = model
  const base = baseManifestFields(config)
  const manifest: Record<string, unknown> = { name: base.name, version: base.version, description: base.description }
  if ('author' in base) manifest.author = base.author
  if ('license' in base) manifest.license = base.license
  if ('repository' in base) manifest.repository = base.repository
  if ('homepage' in base) manifest.homepage = base.homepage
  manifest.type = 'module'
  manifest.main = `./${opencodePluginPath(config.name)}`
  manifest.pi = {
    extensions: [`./${piExtensionPath(config.name)}`],
    skills: [`./${skillDirectories.pi}`],
  }
  manifest.keywords = [...(config.keywords ?? []), 'pi-package']
  return manifest
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
