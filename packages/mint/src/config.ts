import { readFileSync, existsSync } from 'node:fs'
import { join, posix } from 'node:path'
import { parse } from 'yaml'
import { z } from 'zod'
import { artifactCollisionKey, artifactPath, compareArtifactPaths, isReservedArtifactDestination, type ArtifactPath } from './artifact/paths.js'
import { MintError } from './diagnostics.js'
import {
  CAPABILITY_IDS,
  OPERATING_SYSTEM_IDS,
  TARGET_IDS,
  type CapabilityId,
  type OperatingSystemId,
  type TargetId,
  type TargetIntent,
} from './vocabulary.js'

export type ConfigErrorDiagnostic = Omit<MintError['diagnostic'], 'severity' | 'message'>

export interface ConfigErrorOptions {
  cause?: unknown
  diagnostic?: ConfigErrorDiagnostic
  source?: string
}

const OPERATION_DIAGNOSTIC: ConfigErrorDiagnostic = {
  code: 'MINT_OPERATION_INVALID',
  source: 'moe-mint',
  action: 'Resolve the reported operational issue and retry.',
}

const CONFIG_DIAGNOSTIC: ConfigErrorDiagnostic = {
  code: 'CONFIG_INVALID',
  source: 'moe-mint.yaml',
  action: 'Correct the configuration and run the command again.',
}

export class ConfigError extends MintError {
  details: string[]
  constructor(message: string, details: string[] = [], opts: ConfigErrorOptions = {}) {
    const diagnostic = opts.diagnostic ?? OPERATION_DIAGNOSTIC
    super({
      severity: 'error',
      ...diagnostic,
      message: details.length ? `${message}\n  - ${details.join('\n  - ')}` : message,
    }, { cause: opts.cause })
    this.name = 'ConfigError'
    this.details = details
  }
}

function configError(message: string, details: string[] = [], opts: ConfigErrorOptions = {}): ConfigError {
  return new ConfigError(message, details, {
    ...opts,
    diagnostic: opts.diagnostic ?? { ...CONFIG_DIAGNOSTIC, source: opts.source ?? CONFIG_DIAGNOSTIC.source },
  })
}

function migrationError(
  source: string,
  code: string,
  field: string,
  message: string,
  action: string,
  target?: string,
): ConfigError {
  return configError(message, [], {
    diagnostic: { code, source, field, action, ...(target === undefined ? {} : { target }) },
  })
}

// The harnesses whose adapters have a shell-hook tier and therefore honor
// `harnesses.<name>.hooks: own`. Shared by resolveBootstrap (validates that a
// `hooks: own` opt-out only names a hook-emitting harness) and
// bootstrapEmitsHooks's callers (each adapter passes its own name).
export const HOOK_EMITTING_HARNESSES = ['claude-code', 'cursor'] as const

// Keep this legacy export for existing config callers. TARGET_IDS is the one
// canonical vocabulary shared by config validation and the adapter registry.
export const ADAPTER_NAMES = TARGET_IDS

export type BootstrapMode =
  | { kind: 'skill'; skill: string }
  | { kind: 'generate' }
  | { kind: 'none' }

// A resolved harnesses.<name> block: the per-harness hook tier ('generated'
// default | 'own') and an optional manifest patch (deep-merged into the
// adapter's generated manifest; a null value is the delete-sentinel).
export interface HarnessSettings {
  hooks: 'generated' | 'own'
  manifest?: Record<string, unknown>
}

// Shared with import.ts, which validates a Claude plugin.json's name against
// this same rule before writing it into moe-mint.yaml.
export const PLUGIN_NAME_RE = /^[a-z0-9][a-z0-9-]*$/

// The anchored semver rule for the plugin `version` field. Exported so the
// bump command validates a requested new version against the exact same rule
// (and reuses the same human-facing wording) the schema enforces on load.
export const VERSION_RE = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/
export const VERSION_MESSAGE = 'semver, e.g. 1.2.3'

const authorSchema = z.object({
  name: z.string(),
  email: z.string().optional(),
  url: z.string().optional(),
}).strict()

// Component paths: [A-Za-z0-9._-]+ segments joined by /, normalized to strip
// trailing slashes before validation. Regex rejects quotes, backslashes, spaces,
// shell metacharacters — ensuring safe substitution into emitted Python/JS/TS.
// The charset alone permits a `.` or `..` segment (both are valid runs of
// dots), which would let a path escape the plugin root -- rejected separately
// below rather than folded into the charset regex.
const requiredComponentPath = z.preprocess(
  (val) => (typeof val === 'string' ? val.replace(/\/+$/, '') : val),
  z
    .string()
    .regex(
      /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/,
      'path segments may contain only letters, digits, dot, underscore, hyphen',
    )
    .refine((s) => !s.split('/').includes('.') && !s.split('/').includes('..'), {
      message: 'path segments may not be . or ..',
    }),
)
const componentPath = requiredComponentPath.optional()

// bootstrap is a tagged value: the string literals 'none'/'generate', or the
// object form { skill: <name> } when the skill-bootstrap needs a parameter.
// Legacy object forms ({ none: true } / { generate: true } / emitHooks) are
// rejected with pointed migration errors in rejectLegacySyntax before the
// schema ever runs.
const bootstrapSchema = z
  .union([z.literal('none'), z.literal('generate'), z.object({ skill: z.string() }).strict()])
  .optional()

const releaseSchema = z
  .object({
    files: z
      .array(
        z.object({
          path: requiredComponentPath,
          field: z.string(),
        }).strict(),
      )
      .optional(),
    audit: z
      .object({
        exclude: z.array(z.string()).optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .optional()

const marketplaceSchema = z
  .object({
    name: z.string().optional(),
    description: z.string().optional(),
    source: z
      .union([
        z.literal('local'),
        z.literal('repository'),
        z.string().regex(/^https?:\/\//, 'must be "local", "repository", or an http(s) URL'),
      ])
      .optional(),
    category: z.string().optional(),
    tags: z.array(z.string()).optional(),
    strict: z.boolean().optional(),
  })
  .strict()
  .optional()

const npmPackageSchema = z.string().regex(
  /^@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/,
  'must be a valid scoped npm package name',
)

const GLOB_METACHARACTER_RE = /[*?\[\]{}!]/

function normalizePayloadPath(value: string, ctx: z.RefinementCtx): string {
  if (value.length === 0 || posix.isAbsolute(value) || value.includes('\\') || GLOB_METACHARACTER_RE.test(value)) {
    ctx.addIssue({ code: 'custom', message: 'must be a non-absolute, non-glob slash-separated path' })
    return z.NEVER
  }
  const segments = value.split('/')
  if (segments.includes('.') || segments.includes('..')) {
    ctx.addIssue({ code: 'custom', message: 'path segments may not be . or ..' })
    return z.NEVER
  }
  const normalized = posix.normalize(value).replace(/\/+$/, '')
  if (normalized.length === 0 || normalized === '.') {
    ctx.addIssue({ code: 'custom', message: 'must name a payload root' })
    return z.NEVER
  }
  return normalized
}

const payloadPathSchema = z.string().transform(normalizePayloadPath)

const artifactPayloadSchema = z.object({
  from: payloadPathSchema,
  to: payloadPathSchema,
  required: z.boolean(),
}).strict().superRefine((payload, ctx) => {
  if (isReservedArtifactDestination(artifactPath(payload.to))) {
    ctx.addIssue({ code: 'custom', path: ['to'], message: 'destination is reserved for compositor output' })
  }
})

const activeTargetSchema = z.object({
  intent: z.enum(['certify', 'preview']),
  expected_capabilities: z.array(z.enum(CAPABILITY_IDS)),
  operating_systems: z.array(z.enum(OPERATING_SYSTEM_IDS)).min(1),
}).strict()

const activeFormatTargetSchema = z.object({
  intent: z.enum(['certify', 'preview']),
  expected_capabilities: z.array(z.enum(CAPABILITY_IDS)),
}).strict()

const omittedTargetSchema = z.object({ intent: z.literal('omit') }).strict()
const targetEntrySchema = z.union([activeTargetSchema, omittedTargetSchema])
const formatTargetEntrySchema = z.union([activeFormatTargetSchema, omittedTargetSchema])
const targetShape = Object.fromEntries(TARGET_IDS.map((id) => [
  id,
  id === 'agent-plugins-1.0' ? formatTargetEntrySchema : targetEntrySchema,
])) as unknown as Record<TargetId, z.ZodType>
const targetsSchema = z.object(targetShape).strict()

const importedWorkSchema = z.object({ name: z.string().min(1), artifact_roots: z.array(z.string().min(1)).optional() }).strict()

const rawSchema = z.object({
  name: z.string().regex(PLUGIN_NAME_RE, 'lowercase alphanumerics and hyphens'),
  version: z.string().regex(VERSION_RE, VERSION_MESSAGE),
  description: z.string(),
  author: authorSchema.optional(),
  license: z.string().optional(),
  repository: z.string().optional(),
  homepage: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  bootstrap: bootstrapSchema,
  components: z
    .object({
      skills: componentPath,
      commands: componentPath,
      agents: componentPath,
      hooks: componentPath,
      mcp: componentPath,
    })
    .strict()
    .optional(),
  // exclude is validated here; the per-harness settings blocks (any adapter
  // name) pass through and are validated by resolveHarnessSettings so their
  // keys can be checked against the adapter registry and given pointed errors.
  harnesses: z
    .object({
      exclude: z.array(z.string()).optional(),
    })
    .passthrough()
    .optional(),
  marketplace: marketplaceSchema,
  release: releaseSchema,
  distribution: z.object({ npm: npmPackageSchema }).strict(),
  artifact: z.object({
    node_package: z.object({
      dependencies: z.enum(['preserve', 'bundled']),
    }).strict().optional(),
    payloads: z.array(artifactPayloadSchema),
  }).strict(),
  targets: targetsSchema,
  imported_works: z.array(importedWorkSchema),
}).strict()

export interface DistributionConfig {
  npm: string
}

export type RuntimeDependencyPolicy = 'preserve' | 'bundled'

export interface NodePackagePolicy {
  dependencies: RuntimeDependencyPolicy
}

export interface ArtifactPayload {
  from: string
  to: string
  required: boolean
}

export interface PluginTargetIntent {
  intent: TargetIntent
  expectedCapabilities: readonly CapabilityId[]
  operatingSystems?: readonly OperatingSystemId[]
}

export interface ImportedWorkRef {
  name: string
  artifactRoots: readonly string[]
}

export interface MintConfig {
  source: string
  name: string
  version: string
  description: string
  // Every optional here is populated straight from the parsed document, which
  // means loadConfig always sets the key and supplies `undefined` when the
  // field is absent. exactOptionalPropertyTypes needs that spelled out.
  author?: z.infer<typeof authorSchema> | undefined
  license?: string | undefined
  repository?: string | undefined
  homepage?: string | undefined
  keywords?: string[] | undefined
  bootstrap: BootstrapMode
  components: { skills: string; commands: string; agents: string; hooks: string; mcp: string }
  harnesses: { exclude: string[]; settings: Record<string, HarnessSettings> }
  distribution: DistributionConfig
  artifact: { nodePackage?: NodePackagePolicy | undefined; payloads: readonly ArtifactPayload[] }
  targets: Readonly<Record<TargetId, PluginTargetIntent>>
  importedWorks: readonly ImportedWorkRef[]
  // Inferred from the schemas rather than restated: a hand-written copy drifts,
  // and under exactOptionalPropertyTypes every nested optional would need an
  // explicit `| undefined` anyway. Same idiom as `author` above.
  marketplace?: z.infer<typeof marketplaceSchema>
  release?: z.infer<typeof releaseSchema>
}

/**
 * `components.hooks` may name the conventional component directory so the
 * artifact compositor can stage hook siblings, or a standalone JSON manifest
 * for plugins whose hooks live elsewhere.
 */
export function hooksManifestPath(config: MintConfig): string {
  return config.components.hooks.endsWith('.json')
    ? config.components.hooks
    : posix.join(config.components.hooks, 'hooks.json')
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// The four config-v1 syntaxes are a clean break in v2 (the upstream author's call: only his
// own plugins use moe-mint, so no back-compat). Each is caught on the raw
// document BEFORE the schema parse so the author gets a pointed migration
// message naming the replacement, not a generic zod validation error.
function rejectLegacySyntax(doc: unknown, source: string): void {
  if (!isPlainObject(doc)) return
  const bootstrap = doc.bootstrap
  if (isPlainObject(bootstrap)) {
    if ('none' in bootstrap || 'generate' in bootstrap) {
      throw migrationError(
        source,
        'CONFIG_BOOTSTRAP_MIGRATION_REQUIRED',
        'bootstrap',
        'bootstrap is now a tagged value: use "bootstrap: none", "bootstrap: generate", or "bootstrap: { skill: <name> }"',
        'Replace the legacy bootstrap object with its tagged v1 form.',
      )
    }
    if ('emitHooks' in bootstrap) {
      throw migrationError(
        source,
        'CONFIG_BOOTSTRAP_HOOKS_MIGRATION_REQUIRED',
        'bootstrap.emitHooks',
        'bootstrap.emitHooks moved: set harnesses.<name>.hooks: own',
        'Move the hook ownership setting to the affected harness.',
      )
    }
  }
  const harnesses = doc.harnesses
  if (isPlainObject(harnesses) && 'overrides' in harnesses) {
    throw migrationError(
      source,
      'CONFIG_HARNESS_OVERRIDES_MIGRATION_REQUIRED',
      'harnesses.overrides',
      'harnesses.overrides moved: put manifest patches under harnesses.<name>.manifest',
      'Move each manifest patch to its named harness.',
    )
  }
  if ('bump' in doc) {
    throw migrationError(
      source,
      'CONFIG_RELEASE_MIGRATION_REQUIRED',
      'bump',
      'bump: was renamed: use release: (same fields)',
      'Rename bump to release.',
    )
  }
  if (Array.isArray(doc.imported_works) && doc.imported_works.some((entry) => !isPlainObject(entry))) {
    throw migrationError(
      source,
      'CONFIG_IMPORTED_WORK_MIGRATION_REQUIRED',
      'imported_works',
      'imported_works entries must use object form',
      'Replace each scalar entry with {name: ...}.',
    )
  }
}

// Validates every harnesses.<name> block from the v2 dialect: unknown harness
// names (typo-catching against ADAPTER_NAMES), the hooks enum, that manifest is
// a mapping, and that no stray keys sneak in. Returns the resolved per-harness
// settings that consumers read directly (hooks defaults to 'generated').
function resolveHarnessSettings(raw: Record<string, unknown> | undefined, source: string): {
  exclude: string[]
  settings: Record<string, HarnessSettings>
} {
  const exclude = (raw?.exclude as string[] | undefined) ?? []
  const settings: Record<string, HarnessSettings> = {}
  if (!raw) return { exclude, settings }

  // The same typo-catching rationale as the per-harness blocks: an excluded
  // name that matches no adapter would silently exclude nothing.
  for (const name of exclude) {
    if (!(ADAPTER_NAMES as readonly string[]).includes(name)) {
      throw configError(`harnesses.exclude: unknown harness name "${name}"`, [
        `valid names: ${ADAPTER_NAMES.join(', ')}`,
      ], { source })
    }
  }

  for (const [key, value] of Object.entries(raw)) {
    if (key === 'exclude') continue
    if (!(ADAPTER_NAMES as readonly string[]).includes(key)) {
      throw configError(`harnesses.${key}: unknown harness name`, [`valid names: ${ADAPTER_NAMES.join(', ')}`], { source })
    }
    if (!isPlainObject(value)) {
      throw configError(`harnesses.${key}: must be a mapping of hooks and/or manifest`, [], { source })
    }
    for (const settingKey of Object.keys(value)) {
      if (settingKey !== 'hooks' && settingKey !== 'manifest') {
        throw configError(`harnesses.${key}.${settingKey}: unknown key (expected hooks or manifest)`, [], { source })
      }
    }
    const entry: HarnessSettings = { hooks: 'generated' }
    if ('hooks' in value) {
      const hooks = value.hooks
      if (hooks !== 'generated' && hooks !== 'own') {
        throw configError(`harnesses.${key}.hooks: must be "generated" or "own"`, [], { source })
      }
      entry.hooks = hooks
    }
    if ('manifest' in value) {
      const manifest = value.manifest
      if (!isPlainObject(manifest)) {
        throw configError(`harnesses.${key}.manifest: must be a mapping`, [], { source })
      }
      entry.manifest = manifest
    }
    settings[key] = entry
  }
  return { exclude, settings }
}

// Resolves the tagged bootstrap value into its internal model: the string
// literals map to 'none'/'generate', the { skill } object to the skill mode,
// and an absent value to 'none'.
function resolveBootstrap(raw: z.infer<typeof rawSchema>['bootstrap']): BootstrapMode {
  if (raw === undefined || raw === 'none') return { kind: 'none' }
  if (raw === 'generate') return { kind: 'generate' }
  return { kind: 'skill', skill: raw.skill }
}

// A `hooks: own` opt-out is only meaningful on a hook-emitting harness with an
// active bootstrap; anywhere else there are no generated hooks to suppress, so
// it's a pointed ConfigError rather than a silent no-op.
function validateHarnessHooks(settings: Record<string, HarnessSettings>, bootstrap: BootstrapMode, source: string): void {
  for (const [name, entry] of Object.entries(settings)) {
    if (entry.hooks !== 'own') continue
    if (!(HOOK_EMITTING_HARNESSES as readonly string[]).includes(name)) {
      throw configError(
        `harnesses.${name}.hooks: own is only valid on hook-emitting harnesses (${HOOK_EMITTING_HARNESSES.join(', ')})`,
        [],
        { source },
      )
    }
    if (bootstrap.kind === 'none') {
      throw configError(
        `harnesses.${name}.hooks: own requires an active bootstrap (bootstrap: generate or bootstrap: { skill: <name> }); there are no generated hooks to suppress`,
        [],
        { source },
      )
    }
  }
}

function checkMarketplace(
  marketplace: z.infer<typeof rawSchema>['marketplace'],
  repository: string | undefined,
  source: string,
): void {
  if (marketplace?.source === 'repository' && !repository) {
    throw configError(
      'marketplace.source: repository requires a top-level repository field',
      [],
      { source },
    )
  }
}

function resolveTargets(raw: z.infer<typeof rawSchema>['targets']): Readonly<Record<TargetId, PluginTargetIntent>> {
  const targets = {} as Record<TargetId, PluginTargetIntent>
  for (const target of TARGET_IDS) {
    const entry = raw[target] as { intent: TargetIntent; expected_capabilities?: CapabilityId[]; operating_systems?: OperatingSystemId[] }
    targets[target] = {
      intent: entry.intent,
      expectedCapabilities: entry.expected_capabilities ?? [],
      ...(entry.operating_systems === undefined ? {} : { operatingSystems: entry.operating_systems }),
    }
  }
  return targets
}

function validateTargetMigration(
  targets: Readonly<Record<TargetId, PluginTargetIntent>>,
  harnesses: { exclude: string[]; settings: Record<string, HarnessSettings> },
  source: string,
): void {
  for (const target of TARGET_IDS) {
    const omitted = targets[target].intent === 'omit'
    const excluded = harnesses.exclude.includes(target)
    if (omitted !== excluded) {
      throw migrationError(
        source,
        'TARGET_EXCLUSION_MISMATCH',
        `targets.${target}.intent`,
        `targets.${target}.intent and harnesses.exclude disagree`,
        `Make harnesses.exclude and targets.${target}.intent agree.`,
        target,
      )
    }
    if (omitted && harnesses.settings[target] !== undefined) {
      throw migrationError(
        source,
        'TARGET_OMITTED_SETTINGS',
        `harnesses.${target}`,
        `harnesses.${target}: settings are not allowed for an omitted target`,
        `Remove harnesses.${target} settings or activate ${target}.`,
        target,
      )
    }
  }
}

function normalizeImportedWorks(importedWorks: readonly z.infer<typeof importedWorkSchema>[], source: string): readonly ImportedWorkRef[] {
  const names = new Set<string>()
  const allRoots = new Map<string, { work: string; root: ArtifactPath }>()
  const normalized: ImportedWorkRef[] = []
  for (const [index, importedWork] of importedWorks.entries()) {
    if (names.has(importedWork.name)) {
      throw migrationError(
        source,
        'CONFIG_DUPLICATE_IMPORTED_WORK',
        `imported_works[${index}].name`,
        `imported_works: duplicate work name "${importedWork.name}"`,
        'Keep each imported work name unique.',
      )
    }
    names.add(importedWork.name)
    const roots: ArtifactPath[] = []
    for (const [rootIndex, value] of (importedWork.artifact_roots ?? []).entries()) {
      let root: ArtifactPath
      try { root = artifactPath(value) } catch {
        throw migrationError(source, 'CONFIG_IMPORTED_ROOT_INVALID', `imported_works[${index}].artifact_roots[${rootIndex}]`, `invalid imported-work artifact root "${value}"`, 'Use a canonical literal artifact-relative path without globs, traversal, or trailing slashes.')
      }
      const key = artifactCollisionKey(root)
      const conflict = [...allRoots.values()].find((claim) => key === artifactCollisionKey(claim.root) || key.startsWith(`${artifactCollisionKey(claim.root)}/`) || artifactCollisionKey(claim.root).startsWith(`${key}/`))
      if (conflict !== undefined) throw migrationError(source, 'CONFIG_IMPORTED_ROOT_OVERLAP', `imported_works[${index}].artifact_roots[${rootIndex}]`, `imported-work roots "${conflict.root}" and "${root}" overlap or collide`, 'Assign each non-overlapping artifact root to exactly one imported work.')
      allRoots.set(key, { work: importedWork.name, root })
      roots.push(root)
    }
    roots.sort(compareArtifactPaths)
    normalized.push(Object.freeze({ name: importedWork.name, artifactRoots: Object.freeze(roots) }))
  }
  return Object.freeze(normalized)
}

export function loadConfig(root: string, configFile = 'moe-mint.yaml', source = configFile): MintConfig {
  const path = join(root, configFile)
  if (!existsSync(path)) {
    throw configError(`${configFile} not found in ${root}`, [], { source })
  }
  let doc: unknown
  try {
    doc = parse(readFileSync(path, 'utf8'))
  } catch (e) {
    throw configError(`${configFile} is not valid YAML: ${(e as Error).message}`, [], { cause: e, source })
  }
  rejectLegacySyntax(doc, source)
  const parsed = rawSchema.safeParse(doc)
  if (!parsed.success) {
    throw configError(
      `${configFile} is invalid`,
      parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
      { source },
    )
  }
  const raw = parsed.data
  checkMarketplace(raw.marketplace, raw.repository, source)

  const { exclude, settings } = resolveHarnessSettings(raw.harnesses, source)
  const bootstrap = resolveBootstrap(raw.bootstrap)
  validateHarnessHooks(settings, bootstrap, source)
  const targets = resolveTargets(raw.targets)
  validateTargetMigration(targets, { exclude, settings }, source)
  const importedWorks = normalizeImportedWorks(raw.imported_works, source)

  return {
    source,
    name: raw.name,
    version: raw.version,
    description: raw.description,
    author: raw.author,
    license: raw.license,
    repository: raw.repository,
    homepage: raw.homepage,
    keywords: raw.keywords,
    bootstrap,
    components: {
      skills: raw.components?.skills ?? 'skills',
      commands: raw.components?.commands ?? 'commands',
      agents: raw.components?.agents ?? 'agents',
      hooks: raw.components?.hooks ?? 'hooks/hooks.json',
      mcp: raw.components?.mcp ?? '.mcp.json',
    },
    harnesses: { exclude, settings },
    distribution: raw.distribution,
    artifact: {
      nodePackage: raw.artifact.node_package
        ? { dependencies: raw.artifact.node_package.dependencies }
        : undefined,
      payloads: raw.artifact.payloads,
    },
    targets,
    importedWorks,
    marketplace: raw.marketplace,
    release: raw.release,
  }
}
