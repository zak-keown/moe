import { readFile, realpath } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { parse } from 'yaml'
import { MintError, type MintDiagnostic } from '../diagnostics.js'
import { OPERATING_SYSTEM_IDS, TARGET_IDS } from '../vocabulary.js'
import { platformRegistrySchema, type PlatformPluginDeclarationV1, type PlatformRegistryV1 } from './schema.js'

const REGISTRY_FILE = 'moe-platform.yaml'
const FORBIDDEN_PLUGIN_METADATA = new Set([
  'version', 'description', 'author', 'license', 'repository', 'homepage', 'keywords', 'entry_points', 'entryPoints', 'main', 'exports', 'bin', 'dependencies', 'devDependencies',
])

const PINNED_CONTRACTS = {
  opencode: {
    source: 'https://github.com/anomalyco/opencode',
    revision: 'ef2792511deb406f3b064e05a7cc1a01979260ee',
    path: 'packages/opencode/src/plugin/shared.ts',
  },
  pi: {
    source: 'https://github.com/badlogic/pi-mono',
    revision: 'e266507b606b9552fa277252644054afd4384b11',
    path: 'packages/coding-agent/docs/packages.md',
  },
} as const

function fail(code: string, message: string, action: string, field?: string, path?: string): never {
  const diagnostic: MintDiagnostic = {
    severity: 'error',
    code,
    source: REGISTRY_FILE,
    ...(field === undefined ? {} : { field }),
    ...(path === undefined ? {} : { path }),
    message,
    action,
  }
  throw new MintError(diagnostic)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isOutside(root: string, candidate: string): boolean {
  const rel = relative(root, candidate)
  return rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)
}

function fieldForPath(path: readonly (string | number)[]): string {
  return path.reduce<string>((field, segment) => {
    if (typeof segment === 'number') return `${field}[${segment}]`
    return field ? `${field}.${segment}` : segment
  }, '')
}

function validateKnownTargetIds(doc: unknown): void {
  if (!isRecord(doc) || !isRecord(doc.targets)) return
  for (const target of Object.keys(doc.targets)) {
    if (!(TARGET_IDS as readonly string[]).includes(target)) {
      fail(
        'PLATFORM_UNKNOWN_TARGET',
        `moe-platform.yaml names unsupported target "${target}"`,
        `Use one of: ${TARGET_IDS.join(', ')}`,
        `targets.${target}`,
      )
    }
  }
}

function validateOperatingSystemIds(doc: unknown): void {
  if (!isRecord(doc) || !isRecord(doc.platform)) return
  for (const key of ['known_operating_systems', 'contributor_operating_systems', 'core_cli_required_operating_systems']) {
    const values = doc.platform[key]
    if (!Array.isArray(values)) continue
    for (const [index, value] of values.entries()) {
      if (typeof value !== 'string' || !(OPERATING_SYSTEM_IDS as readonly string[]).includes(value)) {
        fail(
          'PLATFORM_UNSUPPORTED_OPERATING_SYSTEM',
          `moe-platform.yaml names unsupported operating system "${String(value)}"`,
          `Use one of: ${OPERATING_SYSTEM_IDS.join(', ')}`,
          `platform.${key}[${index}]`,
        )
      }
    }
  }
}

function validateForbiddenPluginMetadata(doc: unknown): void {
  if (!isRecord(doc) || !Array.isArray(doc.plugins)) return
  for (const [index, plugin] of doc.plugins.entries()) {
    if (!isRecord(plugin)) continue
    for (const key of Object.keys(plugin)) {
      if (FORBIDDEN_PLUGIN_METADATA.has(key)) {
        fail(
          'PLATFORM_FORBIDDEN_PLUGIN_METADATA',
          `moe-platform.yaml must not repeat plugin ${key} metadata`,
          'Keep plugin metadata in the package-local Mint configuration.',
          `plugins[${index}].${key}`,
        )
      }
    }
  }
}

function validateContracts(registry: PlatformRegistryV1): void {
  for (const [target, expected] of Object.entries(PINNED_CONTRACTS)) {
    const actual = registry.targets[target as keyof typeof registry.targets].contract
    if (
      actual?.source !== expected.source
      || actual.revision !== expected.revision
      || actual.path !== expected.path
    ) {
      fail(
        'PLATFORM_CONTRACT_MISMATCH',
        `${target} must retain its reviewed provider contract pin`,
        'Restore the approved source, revision, and path together in moe-platform.yaml.',
        `targets.${target}.contract`,
      )
    }
  }
}

function validateProfiles(registry: PlatformRegistryV1): void {
  const pluginIds = new Set(registry.plugins.map((plugin) => plugin.id))
  for (const [profileName, profile] of Object.entries(registry.profiles)) {
    for (const [index, plugin] of profile.plugins.entries()) {
      if (!pluginIds.has(plugin)) {
        fail(
          'PLATFORM_UNKNOWN_PROFILE_MEMBER',
          `profile "${profileName}" names unknown plugin "${plugin}"`,
          'Add the plugin to registry.plugins or remove it from the profile.',
          `profiles.${profileName}.plugins[${index}]`,
        )
      }
    }
  }
}

async function resolveContainedPath(repoRoot: string, value: string, field: string): Promise<string> {
  if (isAbsolute(value)) {
    fail('PLATFORM_PATH_ESCAPE', `registry path "${value}" must be relative to the repository`, 'Use a repository-relative path.', field)
  }
  const candidate = resolve(repoRoot, value)
  if (isOutside(repoRoot, candidate)) {
    fail('PLATFORM_PATH_ESCAPE', `registry path "${value}" escapes the repository`, 'Use a contained repository-relative path.', field)
  }
  let resolved: string
  try {
    resolved = await realpath(candidate)
  } catch (_error) {
    fail(
      'PLATFORM_PATH_NOT_FOUND',
      `registry path "${value}" does not exist`,
      'Create the declared path or correct moe-platform.yaml.',
      field,
      candidate,
    )
  }
  if (isOutside(repoRoot, resolved)) {
    fail('PLATFORM_PATH_ESCAPE', `registry path "${value}" resolves outside the repository`, 'Remove the escaping symlink or use a contained path.', field, resolved)
  }
  return resolved
}

async function resolvePluginPaths(repoRoot: string, plugins: readonly PlatformPluginDeclarationV1[]): Promise<PlatformRegistryV1['plugins']> {
  const ids = new Set<string>()
  const sources = new Set<string>()
  const configs = new Set<string>()
  const resolved = []
  for (const [index, plugin] of plugins.entries()) {
    if (ids.has(plugin.id)) {
      fail('PLATFORM_DUPLICATE_PLUGIN_ID', `plugin ID "${plugin.id}" appears more than once`, 'Give each registry plugin a unique ID.', `plugins[${index}].id`)
    }
    ids.add(plugin.id)
    const sourcePath = await resolveContainedPath(repoRoot, plugin.source, `plugins[${index}].source`)
    if (sources.has(sourcePath)) {
      fail('PLATFORM_DUPLICATE_PLUGIN_PATH', `plugin source "${plugin.source}" resolves to a duplicate path`, 'Give each plugin a distinct source path.', `plugins[${index}].source`, sourcePath)
    }
    sources.add(sourcePath)
    const configPath = await resolveContainedPath(repoRoot, plugin.config, `plugins[${index}].config`)
    if (configs.has(configPath)) {
      fail('PLATFORM_DUPLICATE_PLUGIN_PATH', `plugin config "${plugin.config}" resolves to a duplicate path`, 'Give each plugin a distinct config path.', `plugins[${index}].config`, configPath)
    }
    configs.add(configPath)
    resolved.push({ ...plugin, sourcePath, configPath })
  }
  return resolved
}

export async function loadPlatformRegistry(repoRoot: string): Promise<PlatformRegistryV1> {
  const root = await realpath(repoRoot)
  const filePath = resolve(root, REGISTRY_FILE)
  let doc: unknown
  try {
    doc = parse(await readFile(filePath, 'utf8'))
  } catch (error) {
    const message = (error as Error).message
    const code = (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'PLATFORM_REGISTRY_NOT_FOUND' : 'PLATFORM_YAML_INVALID'
    fail(code, `moe-platform.yaml could not be loaded: ${message}`, 'Create valid moe-platform.yaml at the repository root.', undefined, filePath)
  }

  validateKnownTargetIds(doc)
  validateOperatingSystemIds(doc)
  validateForbiddenPluginMetadata(doc)
  const parsed = platformRegistrySchema.safeParse(doc)
  if (!parsed.success) {
    const issue = parsed.error.issues[0] ?? { message: 'unknown schema error', path: [] }
    fail(
      'PLATFORM_SCHEMA_INVALID',
      `moe-platform.yaml is invalid: ${issue.message}`,
      'Correct the named field to match the version-1 platform registry schema.',
      fieldForPath(issue.path.map((segment) => (typeof segment === 'symbol' ? String(segment) : segment))),
    )
  }

  const raw = parsed.data
  const registry: PlatformRegistryV1 = {
    ...raw,
    plugins: await resolvePluginPaths(root, raw.plugins),
  }
  validateContracts(registry)
  validateProfiles(registry)
  return registry
}
