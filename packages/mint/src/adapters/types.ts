import type { PluginModel } from '../model.js'
import type { FileSet } from '../fileset.js'
import type { CapabilityId, TargetId } from '../vocabulary.js'

export type SupportLevel = 'full' | 'partial' | 'none'

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

export interface HarnessAdapter {
  name: string
  skillsOutputDir?: string | undefined
  emit(model: PluginModel): AdapterEmission
  // Optional: markdown BODY (no marker, no heading — docs-emit.ts adds
  // both) describing how to install the plugin on this harness. Adapters
  // without an install story yet simply omit it; docs-emit.ts skips the
  // docs/install/<name>.md file for them.
  installDoc?(model: PluginModel): string
}
