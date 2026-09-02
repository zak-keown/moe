import { readFile, realpath } from 'node:fs/promises'
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { parse } from 'yaml'
import { loadConfig, type MintConfig, type PluginTargetIntent } from '../config.js'
import { MintError, type MintDiagnostic } from '../diagnostics.js'
import { OPERATING_SYSTEM_IDS, TARGET_IDS, type OperatingSystemId, type TargetId } from '../vocabulary.js'
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

interface FailureOptions {
  source?: string
  cause?: unknown
  plugin?: string
  target?: string
}

function fail(code: string, message: string, action: string, field?: string, path?: string, options: FailureOptions = {}): never {
  const diagnostic: MintDiagnostic = {
    severity: 'error',
    code,
    source: options.source ?? REGISTRY_FILE,
    ...(options.plugin === undefined ? {} : { plugin: options.plugin }),
    ...(options.target === undefined ? {} : { target: options.target }),
    ...(field === undefined ? {} : { field }),
    ...(path === undefined ? {} : { path }),
    message,
    action,
  }
  throw new MintError(diagnostic, { cause: options.cause })
}

export interface ResolvedPlugin {
  id: string
  npmPackage: string
  version: string
  sourcePath: string
  configPath: string
  packageJson: Readonly<Record<string, unknown>>
  config: MintConfig
  targets: Readonly<Record<TargetId, PluginTargetIntent>>
}

export interface ResolvedPlatform {
  registry: PlatformRegistryV1
  plugins: readonly ResolvedPlugin[]
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

function validateTargetPrerequisites(registry: PlatformRegistryV1): void {
  const requires = registry.targets.copilot.requires
  if (requires?.length !== 1 || requires[0] !== 'claude-code') {
    fail(
      'PLATFORM_TARGET_PREREQUISITE',
      'copilot must require Claude Code as its sole prerequisite',
      'Set targets.copilot.requires to [claude-code].',
      'targets.copilot.requires',
    )
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
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'PLATFORM_PATH_NOT_FOUND' : 'PLATFORM_PATH_UNAVAILABLE'
    fail(
      code,
      code === 'PLATFORM_PATH_NOT_FOUND'
        ? `registry path "${value}" does not exist`
        : `registry path "${value}" could not be resolved: ${(error as Error).message}`,
      'Make the declared path accessible or correct moe-platform.yaml.',
      field,
      candidate,
      { cause: error },
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

function packageMismatch(
  code: 'PACKAGE_NAME_MISMATCH' | 'PACKAGE_VERSION_MISMATCH' | 'PACKAGE_LICENSE_MISMATCH',
  plugin: string,
  field: string,
  expected: string,
  actual: unknown,
  source = 'package.json',
): never {
  fail(
    code,
    `plugin "${plugin}" ${field} must match package.json (expected "${expected}", received "${String(actual)}")`,
    'Make the package-local Mint policy and source package.json agree.',
    field,
    undefined,
    { source, plugin },
  )
}

function requireRegisteredPlugin(platform: PlatformRegistryV1, config: MintConfig): PlatformRegistryV1['plugins'][number] {
  const plugin = platform.plugins.find((entry) => entry.id === config.name)
  if (plugin === undefined) {
    fail(
      'PLATFORM_PLUGIN_NOT_REGISTERED',
      `package-local Mint config names unregistered plugin "${config.name}"`,
      'Add the plugin to moe-platform.yaml or correct the package-local name.',
      'name',
      undefined,
      { source: 'moe-mint.yaml', plugin: config.name },
    )
  }
  return plugin
}

function validateTargetPolicy(platform: PlatformRegistryV1, config: MintConfig): void {
  for (const target of TARGET_IDS) {
    const intent = config.targets[target]
    if (intent.intent === 'omit') continue
    const registryTarget = platform.targets[target]
    if (registryTarget.kind === 'host') {
      const operatingSystems = intent.operatingSystems ?? []
      for (const operatingSystem of operatingSystems) {
        if (!platform.platform.known_operating_systems.includes(operatingSystem)) {
          fail(
            'TARGET_UNSUPPORTED_OPERATING_SYSTEM',
            `plugin "${config.name}" names operating system "${operatingSystem}" outside platform policy`,
            'Use an operating system declared by moe-platform.yaml.',
            `targets.${target}.operating_systems`,
            undefined,
            { source: 'moe-mint.yaml', plugin: config.name, target },
          )
        }
      }
    }
    for (const prerequisite of registryTarget.requires ?? []) {
      if (config.targets[prerequisite].intent === 'omit') {
        fail(
          'TARGET_PREREQUISITE_UNMET',
          `plugin "${config.name}" activates "${target}" but omits prerequisite "${prerequisite}"`,
          `Activate ${prerequisite} or omit ${target}.`,
          `targets.${target}.intent`,
          undefined,
          { source: 'moe-mint.yaml', plugin: config.name, target },
        )
      }
    }
  }
}

const PRODUCT_TO_NODE_OS: Readonly<Record<OperatingSystemId, string>> = {
  macos: 'darwin',
  linux: 'linux',
  wsl2: 'linux',
  windows: 'win32',
}
const NODE_OS_IDS = new Set(['aix', 'android', 'darwin', 'freebsd', 'haiku', 'linux', 'openbsd', 'sunos', 'win32'])
const NODE_CPU_IDS = new Set(['arm', 'arm64', 'ia32', 'loong64', 'mips', 'mipsel', 'ppc', 'ppc64', 'riscv64', 's390', 's390x', 'x64'])

function constraintsAllow(values: readonly string[], candidate: string): boolean {
  const allowed = values.filter((value) => !value.startsWith('!'))
  const denied = new Set(values.filter((value) => value.startsWith('!')).map((value) => value.slice(1)))
  return !denied.has(candidate) && (allowed.length === 0 || allowed.includes(candidate))
}

function validateSourceConstraints(config: MintConfig, sourceManifest: Readonly<Record<string, unknown>>, source: string): void {
  const activeOperatingSystems = new Set<OperatingSystemId>()
  for (const target of TARGET_IDS) {
    if (config.targets[target].intent === 'omit') continue
    for (const operatingSystem of config.targets[target].operatingSystems ?? []) activeOperatingSystems.add(operatingSystem)
  }

  const os = sourceManifest.os
  if (os !== undefined) {
    if (!Array.isArray(os) || os.some((value) => typeof value !== 'string' || !NODE_OS_IDS.has(value.replace(/^!/, '')))) {
      fail(
        'TARGET_OS_CONTRADICTION',
        `plugin "${config.name}" package.json has an invalid os constraint`,
        'Use Node operating-system IDs that do not exclude active target operating systems.',
        'os',
        undefined,
        { source, plugin: config.name },
      )
    }
    for (const operatingSystem of activeOperatingSystems) {
      if (!constraintsAllow(os, PRODUCT_TO_NODE_OS[operatingSystem])) {
        fail(
          'TARGET_OS_CONTRADICTION',
          `plugin "${config.name}" package.json os constraint excludes active operating system "${operatingSystem}"`,
          'Broaden package.json os or remove the incompatible target operating system.',
          'os',
          undefined,
          { source, plugin: config.name },
        )
      }
    }
  }

  const cpu = sourceManifest.cpu
  if (cpu !== undefined) {
    if (!Array.isArray(cpu) || cpu.some((value) => typeof value !== 'string' || !NODE_CPU_IDS.has(value.replace(/^!/, '')))) {
      fail(
        'TARGET_OS_CONTRADICTION',
        `plugin "${config.name}" package.json has an invalid cpu constraint`,
        'Use canonical Node CPU IDs or omit cpu for an unrestricted target matrix.',
        'cpu',
        undefined,
        { source, plugin: config.name },
      )
    }
    if (activeOperatingSystems.size > 0 && cpu.length > 0) {
      fail(
        'TARGET_OS_CONTRADICTION',
        `plugin "${config.name}" package.json cpu constraint narrows its unrestricted target matrix`,
        'Remove package.json cpu or introduce an explicit CPU target policy in a future schema version.',
        'cpu',
        undefined,
        { source, plugin: config.name },
      )
    }
  }
}

export function resolvePlugin(
  platform: PlatformRegistryV1,
  config: MintConfig,
  sourceManifest: Readonly<Record<string, unknown>>,
  source = 'package.json',
): ResolvedPlugin {
  const declaration = requireRegisteredPlugin(platform, config)
  validateTargetPolicy(platform, config)
  if (sourceManifest.name !== config.distribution.npm) {
    packageMismatch('PACKAGE_NAME_MISMATCH', config.name, 'name', config.distribution.npm, sourceManifest.name, source)
  }
  if (sourceManifest.version !== config.version) {
    packageMismatch('PACKAGE_VERSION_MISMATCH', config.name, 'version', config.version, sourceManifest.version, source)
  }
  if (sourceManifest.license !== config.license) {
    packageMismatch('PACKAGE_LICENSE_MISMATCH', config.name, 'license', config.license ?? '(missing)', sourceManifest.license, source)
  }
  validateSourceConstraints(config, sourceManifest, source)
  return {
    id: declaration.id,
    npmPackage: config.distribution.npm,
    version: config.version,
    sourcePath: declaration.sourcePath,
    configPath: declaration.configPath,
    packageJson: sourceManifest,
    config,
    targets: config.targets,
  }
}

async function readSourceManifest(plugin: PlatformRegistryV1['plugins'][number]): Promise<Readonly<Record<string, unknown>>> {
  const path = resolve(plugin.sourcePath, 'package.json')
  let contents: string
  try {
    contents = await readFile(path, 'utf8')
  } catch (error) {
    fail(
      'PACKAGE_MANIFEST_READ_FAILED',
      `package.json could not be read: ${(error as Error).message}`,
      'Make the source package manifest readable.',
      undefined,
      path,
      { source: path, plugin: plugin.id, cause: error },
    )
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(contents)
  } catch (error) {
    fail(
      'PACKAGE_MANIFEST_INVALID',
      `package.json is not valid JSON: ${(error as Error).message}`,
      'Correct the source package manifest JSON.',
      undefined,
      path,
      { source: path, plugin: plugin.id, cause: error },
    )
  }
  if (!isRecord(parsed)) {
    fail('PACKAGE_MANIFEST_INVALID', 'package.json must contain an object', 'Correct the source package manifest JSON.', undefined, path, { source: path, plugin: plugin.id })
  }
  return parsed
}

export async function resolvePlatform(repoRoot: string): Promise<ResolvedPlatform> {
  const registry = await loadPlatformRegistry(repoRoot)
  const plugins: ResolvedPlugin[] = []
  for (const declaration of registry.plugins) {
    const config = loadConfig(dirname(declaration.configPath), basename(declaration.configPath))
    const sourceManifest = await readSourceManifest(declaration)
    const resolved = resolvePlugin(registry, config, sourceManifest, resolve(declaration.sourcePath, 'package.json'))
    plugins.push({
      ...resolved,
      packageJson: sourceManifest,
    })
  }
  return { registry, plugins }
}

export async function loadPlatformRegistry(repoRoot: string): Promise<PlatformRegistryV1> {
  let root: string
  try {
    root = await realpath(repoRoot)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'PLATFORM_ROOT_NOT_FOUND' : 'PLATFORM_ROOT_UNAVAILABLE'
    fail(code, `repository root "${repoRoot}" is not accessible`, 'Use an accessible repository root.', undefined, repoRoot, { source: repoRoot, cause: error })
  }
  const filePath = resolve(root, REGISTRY_FILE)
  let contents: string
  try {
    contents = await readFile(filePath, 'utf8')
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'PLATFORM_REGISTRY_NOT_FOUND' : 'PLATFORM_REGISTRY_READ_FAILED'
    fail(code, `moe-platform.yaml could not be read: ${(error as Error).message}`, 'Make moe-platform.yaml readable at the repository root.', undefined, filePath, { cause: error })
  }
  let doc: unknown
  try {
    doc = parse(contents)
  } catch (error) {
    fail('PLATFORM_YAML_INVALID', `moe-platform.yaml is not valid YAML: ${(error as Error).message}`, 'Correct the YAML syntax in moe-platform.yaml.', undefined, filePath, { cause: error })
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
  validateTargetPrerequisites(registry)
  validateProfiles(registry)
  return registry
}
