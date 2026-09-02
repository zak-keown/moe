import { z } from 'zod'
import { OPERATING_SYSTEM_IDS, type OperatingSystemId, type TargetId } from '../vocabulary.js'

const operatingSystemIdSchema = z.enum(OPERATING_SYSTEM_IDS)

const contractSchema = z.object({
  source: z.url(),
  revision: z.string().regex(/^[0-9a-f]{40}$/, 'must be a 40-character lowercase Git revision'),
  path: z.string().min(1),
}).strict()

const hostTargetSchema = z.object({
  display_name: z.string().min(1),
  kind: z.literal('host'),
  contract: contractSchema.optional(),
}).strict()

const formatTargetSchema = z.object({
  display_name: z.string().min(1),
  kind: z.literal('format'),
}).strict()

const copilotTargetSchema = z.object({
  display_name: z.string().min(1),
  kind: z.literal('host'),
  requires: z.tuple([z.literal('claude-code')]),
}).strict()

const profileSchema = z.object({
  default: z.boolean(),
  plugins: z.array(z.string().min(1)),
}).strict()

const pluginSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'must use lowercase alphanumerics and hyphens'),
  source: z.string().min(1),
  config: z.string().min(1),
}).strict()

const platformSchema = z.object({
  known_operating_systems: z.array(operatingSystemIdSchema).min(1),
  contributor_operating_systems: z.array(operatingSystemIdSchema).min(1),
  core_cli_required_operating_systems: z.array(operatingSystemIdSchema).min(1),
  formal_release_requires_target_os_matrix: z.boolean(),
}).strict()

const releaseSchema = z.object({
  origin: z.object({
    kind: z.literal('npm'),
    registry: z.url(),
  }).strict(),
  mirror: z.object({
    kind: z.literal('github-release'),
  }).strict(),
  channels: z.object({
    stable: z.string().min(1),
    prerelease: z.string().min(1),
  }).strict(),
}).strict()

const targetShape = {
  'claude-code': hostTargetSchema,
  cursor: hostTargetSchema,
  codex: hostTargetSchema,
  kimi: hostTargetSchema,
  opencode: hostTargetSchema,
  pi: hostTargetSchema,
  'agent-plugins-1.0': formatTargetSchema,
  copilot: copilotTargetSchema,
} satisfies Record<TargetId, z.ZodType>

const targetsSchema = z.object(targetShape).strict()

export const platformRegistrySchema = z.object({
  schema: z.literal(1),
  targets: targetsSchema,
  profiles: z.record(z.string().min(1), profileSchema),
  plugins: z.array(pluginSchema).min(1),
  platform: platformSchema,
  release: releaseSchema,
}).strict()

export interface PlatformTargetV1 {
  display_name: string
  kind: 'host' | 'format'
  requires?: readonly TargetId[] | undefined
  contract?: z.infer<typeof contractSchema> | undefined
}
export type PlatformProfileV1 = z.infer<typeof profileSchema>
export type PlatformPluginDeclarationV1 = z.infer<typeof pluginSchema>
export type PlatformPolicyV1 = z.infer<typeof platformSchema>
export type ReleasePolicyV1 = z.infer<typeof releaseSchema>

export interface PlatformPluginV1 extends PlatformPluginDeclarationV1 {
  sourcePath: string
  configPath: string
}

export interface PlatformRegistryV1 {
  schema: 1
  targets: Readonly<Record<TargetId, PlatformTargetV1>>
  profiles: Readonly<Record<string, PlatformProfileV1>>
  plugins: readonly PlatformPluginV1[]
  platform: PlatformPolicyV1 & {
    known_operating_systems: OperatingSystemId[]
    contributor_operating_systems: OperatingSystemId[]
    core_cli_required_operating_systems: OperatingSystemId[]
  }
  release: ReleasePolicyV1
}
