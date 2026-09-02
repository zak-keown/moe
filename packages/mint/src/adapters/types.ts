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

export interface AdapterEmission {
  files: FileSet
  limitations: readonly EmissionLimitation[]
  emittedCapabilities: readonly CapabilityId[]
  projectionOwner?: TargetId
}

export interface HarnessAdapter {
  name: string
  emit(model: PluginModel): AdapterEmission
  // Optional: markdown BODY (no marker, no heading — docs-emit.ts adds
  // both) describing how to install the plugin on this harness. Adapters
  // without an install story yet simply omit it; docs-emit.ts skips the
  // docs/install/<name>.md file for them.
  installDoc?(model: PluginModel): string
}
