import type { PluginModel } from '../model.js'
import type { FileSet } from '../fileset.js'
import type { CapabilityId, TargetId } from '../vocabulary.js'

export type SupportLevel = 'full' | 'partial' | 'none'
/**
 * Achieved delivery for a generated plugin. `unsupported` also covers an
 * active adapter when the source plugin has no skill files to deliver.
 */
export type SkillDelivery = 'rendered' | 'shared-compatible' | 'native-discovery' | 'unsupported'

export interface ComponentSupport {
  skills: SupportLevel
  commands: SupportLevel
  agents: SupportLevel
  hooks: SupportLevel
  mcp: SupportLevel
  bootstrap: SupportLevel
}

export interface EmissionLimitation {
  code: 'COMPONENT_OMITTED' | 'COMPONENT_PARTIAL' | 'SETTING_DROPPED'
  component: keyof ComponentSupport
  message: string
}

/**
 * Package metadata owned by one adapter. The artifact compositor combines
 * these narrow additions with the source-authoritative root manifest.
 */
export interface AdapterPackageContribution {
  owner: TargetId
  pi?: Readonly<Record<string, unknown>>
  exports?: Readonly<Record<string, unknown>>
}

export interface AdapterEmission {
  files: FileSet
  limitations: readonly EmissionLimitation[]
  emittedCapabilities: readonly CapabilityId[]
  projectionOwner?: TargetId
  packageContribution?: AdapterPackageContribution
}

export interface SkillLayout {
  outputDir: string
  profile: string
  mode: 'rendered' | 'in-place' | 'source-or-rendered'
}

export interface HarnessAdapter {
  name: string
  support: ComponentSupport
  skillLayout: SkillLayout
  /** Candidate delivery mechanism; generation may downgrade it to unsupported. */
  skillDelivery: SkillDelivery
  /** A native-discovery adapter is reachable only when this file was emitted. */
  nativeDiscoveryFile?: string
  emit(model: PluginModel): AdapterEmission
  // Optional: markdown BODY (no marker, no heading — docs-emit.ts adds
  // both) describing how to install the plugin on this harness. Adapters
  // without an install story yet simply omit it; docs-emit.ts skips the
  // docs/install/<name>.md file for them.
  installDoc?(model: PluginModel): string
}
