export const TARGET_IDS = [
  'claude-code',
  'cursor',
  'codex',
  'kimi',
  'opencode',
  'pi',
  'agent-plugins-1.0',
  'copilot',
] as const

export type TargetId = (typeof TARGET_IDS)[number]

export const CAPABILITY_IDS = [
  'skill-discovery',
  'skill-invocation',
  'command-discovery',
  'command-invocation',
  'agent-discovery',
  'hook-execution',
  'mcp-registration',
  'bootstrap-routing',
  'executable-invocation',
  'format-conformance',
] as const

export type CapabilityId = (typeof CAPABILITY_IDS)[number]
export type TargetIntent = 'certify' | 'preview' | 'omit'
export type OperatingSystemId = 'macos' | 'linux' | 'wsl2' | 'windows'

export const OPERATING_SYSTEM_IDS = ['macos', 'linux', 'wsl2', 'windows'] as const satisfies readonly OperatingSystemId[]
