import type { PluginModel } from '../model.js'
import type { FileSet } from '../fileset.js'

export type SupportLevel = 'full' | 'partial' | 'none'

export interface ComponentSupport {
  skills: SupportLevel
  commands: SupportLevel
  agents: SupportLevel
  hooks: SupportLevel
  mcp: SupportLevel
  bootstrap: SupportLevel
  rules: SupportLevel
  variables: SupportLevel
}

export interface EmitResult {
  files: FileSet
  warnings: string[]
}

export interface HarnessAdapter {
  name: string
  support: ComponentSupport
  skillsOutputDir?: string | undefined
  emit(model: PluginModel): EmitResult
  // Optional: markdown BODY (no marker, no heading — docs-emit.ts adds
  // both) describing how to install the plugin on this harness. Adapters
  // without an install story yet simply omit it; docs-emit.ts skips the
  // docs/install/<name>.md file for them.
  installDoc?(model: PluginModel): string
}
