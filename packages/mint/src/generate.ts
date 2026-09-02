import { rmSync, rmdirSync, readdirSync, readFileSync, existsSync, statSync, lstatSync } from 'node:fs'
import { dirname, relative, resolve, isAbsolute, sep } from 'node:path'
import { buildModel } from './model.js'
import { writeFileSet, type FileSet, type GeneratedFile } from './fileset.js'
import { saveManifest, loadManifest, sha256, type GenerationManifest } from './manifest.js'
import { adapters, type HarnessAdapter } from './adapters/index.js'
import type { AdapterEmission } from './adapters/types.js'
import { emitDocs } from './docs-emit.js'
import { ConfigError, type MintConfig, type PluginTargetIntent } from './config.js'
import { capabilityError, validateTargetEmission } from './platform/capabilities.js'
import { TARGET_IDS, type TargetId } from './vocabulary.js'

export const TOOL_VERSION = '0.0.0'

export interface GenerateResult {
  files: FileSet
  warnings: string[]
  emissions: Partial<Record<TargetId, AdapterEmission>>
  adaptersRun: string[]
  pruned: string[]
}

/**
 * The complete adapter-emission and capability-validation result, before any
 * generated file or manifest is touched. Projection consumers use this exact
 * object as evidence that their emissions came from the real current pass.
 */
export interface GenerationValidation {
  files: FileSet
  warnings: string[]
  emissions: Partial<Record<TargetId, AdapterEmission>>
  adaptersRun: string[]
  config: MintConfig
}

export interface CanonicalGenerationIdentity {
  sourcePath: string
  sourcePackagePath: string
  configPath: string
  configSource: string
}

export interface CanonicalProjectionPlugin {
  readonly id: string
  readonly npmPackage: string
  readonly version: string
  readonly summary: string
  readonly author: Readonly<NonNullable<MintConfig['author']>> | undefined
  readonly sourcePackagePath: string
  readonly configSource: string
  readonly targets: Readonly<Record<TargetId, Readonly<PluginTargetIntent>>>
}

export interface CanonicalProjectionEvidence {
  readonly plugin: CanonicalProjectionPlugin
  readonly emissions: Readonly<Partial<Record<TargetId, AdapterEmission>>>
}

type CanonicalGenerationProvenance = Readonly<CanonicalGenerationIdentity>

const canonicalValidations = new WeakMap<GenerationValidation, CanonicalGenerationProvenance>()
const canonicalEvidence = new WeakMap<GenerationValidation, CanonicalProjectionEvidence>()
const canonicalAdapters = Object.freeze([...adapters])

export interface GenerateOptions {
  force?: boolean
  /** Set by registry projection orchestration; package-local callers omit it. */
  marketplaceName?: string
  /** Registry validation reads a package-local config without staging it. */
  configPath?: string
  configSource?: string
}

function isSourcePath(path: string, config: MintConfig): boolean {
  if (path === 'moe-mint.yaml') return true
  if (path === config.components.hooks || path === config.components.mcp) return true
  const { skills, commands, agents } = config.components
  if (path === skills || path.startsWith(`${skills}/`)) return true
  // commands/agents source files are always .md; adapters may emit
  // non-.md siblings into the same directory (e.g. TOML commands)
  // without risking a source clobber.
  for (const dir of [commands, agents]) {
    if (path.endsWith('.md') && (path === dir || path.startsWith(`${dir}/`))) return true
  }
  return false
}

// Merges one owner's emitted files into the accumulated byPath map: rejects
// a file that would clobber a source path, dedupes byte-identical
// collisions across owners, and rejects differing-content collisions.
// Shared by the adapter emission loop and the docs stage below so both go
// through the exact same collision rules.
function mergeFiles(
  byPath: Map<string, { owner: string; file: GeneratedFile }>,
  owner: string,
  files: GeneratedFile[],
  config: MintConfig,
): void {
  for (const file of files) {
    if (isSourcePath(file.path, config)) {
      throw new ConfigError(`adapter "${owner}" would overwrite source file ${file.path}`)
    }
    const existing = byPath.get(file.path)
    if (existing) {
      const identical =
        existing.file.content === file.content && Boolean(existing.file.executable) === Boolean(file.executable)
      if (!identical) {
        throw new ConfigError(`adapters "${existing.owner}" and "${owner}" both emit ${file.path}`)
      }
      continue // identical content: dedupe silently
    }
    byPath.set(file.path, { owner, file })
  }
}

export function validateGeneration(
  root: string,
  adapterList: readonly HarnessAdapter[] = adapters,
  opts: GenerateOptions = {},
): GenerationValidation {
  const configFile = opts.configPath === undefined ? 'moe-mint.yaml' : relative(root, opts.configPath)
  const sourceModel = buildModel(root, configFile, opts.configSource ?? configFile)
  const model: typeof sourceModel = opts.marketplaceName === undefined
    ? sourceModel
    : {
      ...sourceModel,
      config: {
        ...sourceModel.config,
        marketplace: { ...(sourceModel.config.marketplace ?? {}), name: opts.marketplaceName },
      },
    }
  const excluded = new Set(model.config.harnesses.exclude)
  const active = adapterList.filter((a) => !excluded.has(a.name))

  const warnings: string[] = []
  const emissions: Partial<Record<TargetId, AdapterEmission>> = {}
  const emittedByAdapter = new Map<HarnessAdapter, AdapterEmission>()
  const byPath = new Map<string, { owner: string; file: GeneratedFile }>()
  for (const adapter of active) {
    const result = adapter.emit(model)
    emittedByAdapter.set(adapter, result)
    if ('warnings' in result) {
      throw capabilityError(
        'CAPABILITY_ADAPTER_WARNING_UNRECOGNIZED', model.config.name, adapter.name as TargetId, model.config.source,
        `adapters.${adapter.name}.warnings`, `adapter "${adapter.name}" returned unrecognized free-form warnings`,
        'Return typed limitations instead of free-form warnings.',
      )
    }
    mergeFiles(byPath, adapter.name, result.files, model.config)
    if ((TARGET_IDS as readonly string[]).includes(adapter.name)) {
      const target = adapter.name as TargetId
      if (result.projectionOwner !== undefined) continue
      const policy = model.config.targets[target]
      emissions[target] = {
        ...result,
        emittedCapabilities: validateTargetEmission(model.config.name, target, policy, result.emittedCapabilities, result.limitations, model.config.source),
      }
    }
  }
  for (const adapter of active) {
    const result = emittedByAdapter.get(adapter)
    if (result === undefined) throw new Error(`adapter "${adapter.name}" did not produce an emission`)
    if (result.projectionOwner === undefined || !(TARGET_IDS as readonly string[]).includes(adapter.name)) continue
    const target = adapter.name as TargetId
    const owner = emissions[result.projectionOwner]
    if (owner === undefined) {
      throw capabilityError(
        'CAPABILITY_PROJECTION_OWNER_MISSING', model.config.name, target, model.config.source,
        `targets.${target}.projection_owner`, `adapter "${target}" requires projection owner "${result.projectionOwner}" to emit first`,
        'Activate the required projection owner target or omit this target.',
      )
    }
    if (result.files.length !== 0 || result.emittedCapabilities.length !== 0) {
      throw capabilityError(
        'CAPABILITY_PROJECTION_OWNER_CONFLICT', model.config.name, target, model.config.source,
        `targets.${target}.projection_owner`, `adapter "${target}" projection must not emit independent files or capabilities`,
        'Remove independent projection output and use the owner emission.',
      )
    }
    emissions[target] = {
      ...result,
      emittedCapabilities: validateTargetEmission(
        model.config.name,
        target,
        model.config.targets[target],
        owner.emittedCapabilities,
        result.limitations,
        model.config.source,
      ),
    }
  }
  mergeFiles(byPath, 'docs', emitDocs(model, active, emissions), model.config)
  const files: FileSet = [...byPath.values()].map((v) => v.file)

  const validation = {
    files,
    warnings,
    emissions,
    adaptersRun: active.map((adapter) => adapter.name),
    config: model.config,
  }
  return validation
}

function immutableEmissions(
  emissions: Readonly<Partial<Record<TargetId, AdapterEmission>>>,
): Readonly<Partial<Record<TargetId, AdapterEmission>>> {
  const snapshot: Partial<Record<TargetId, AdapterEmission>> = {}
  for (const target of TARGET_IDS) {
    const emission = emissions[target]
    if (emission === undefined) continue
    snapshot[target] = Object.freeze({
      ...emission,
      files: Object.freeze(emission.files.map((file) => Object.freeze({ ...file }))) as AdapterEmission['files'],
      limitations: Object.freeze(emission.limitations.map((limitation) => Object.freeze({ ...limitation }))),
      emittedCapabilities: Object.freeze([...emission.emittedCapabilities]),
    })
  }
  return Object.freeze(snapshot)
}

function immutablePluginAuthority(
  identity: CanonicalGenerationIdentity,
  config: MintConfig,
): CanonicalProjectionPlugin {
  const targets = {} as Record<TargetId, Readonly<PluginTargetIntent>>
  for (const target of TARGET_IDS) {
    const policy = config.targets[target]
    targets[target] = Object.freeze({
      intent: policy.intent,
      expectedCapabilities: Object.freeze([...policy.expectedCapabilities]),
      ...(policy.operatingSystems === undefined
        ? {}
        : { operatingSystems: Object.freeze([...policy.operatingSystems]) }),
    })
  }
  return Object.freeze({
    id: config.name,
    npmPackage: config.distribution.npm,
    version: config.version,
    summary: config.description,
    author: config.author === undefined ? undefined : Object.freeze({ ...config.author }),
    sourcePackagePath: identity.sourcePackagePath,
    configSource: identity.configSource,
    targets: Object.freeze(targets),
  })
}

/**
 * Validate one registry package with Mint's complete canonical adapter set,
 * without writing generated files. The provenance remains private so a caller
 * cannot turn a custom-adapter validation into projection evidence.
 */
export function validateCanonicalGeneration(
  identity: CanonicalGenerationIdentity,
  opts: Pick<GenerateOptions, 'marketplaceName'> = {},
): GenerationValidation {
  const canonicalTargets = canonicalAdapters.map((adapter) => adapter.name)
  if (
    canonicalTargets.length !== TARGET_IDS.length
    || new Set(canonicalTargets).size !== TARGET_IDS.length
    || TARGET_IDS.some((target) => !canonicalTargets.includes(target))
  ) {
    throw new Error('canonical adapter registry must contain every target exactly once')
  }
  const options: GenerateOptions = opts.marketplaceName === undefined
    ? { configPath: identity.configPath, configSource: identity.configSource }
    : {
      marketplaceName: opts.marketplaceName,
      configPath: identity.configPath,
      configSource: identity.configSource,
  }
  const validation = validateGeneration(identity.sourcePath, canonicalAdapters, options)
  canonicalEvidence.set(validation, Object.freeze({
    plugin: immutablePluginAuthority(identity, validation.config),
    emissions: immutableEmissions(validation.emissions),
  }))
  canonicalValidations.set(validation, Object.freeze({
    sourcePath: resolve(identity.sourcePath),
    sourcePackagePath: identity.sourcePackagePath,
    configPath: resolve(identity.configPath),
    configSource: identity.configSource,
  }))
  return validation
}

export function isCanonicalGenerationFor(
  validation: GenerationValidation,
  identity: CanonicalGenerationIdentity,
): boolean {
  const provenance = canonicalValidations.get(validation)
  return provenance !== undefined
    && canonicalEvidence.has(validation)
    && provenance.sourcePath === resolve(identity.sourcePath)
    && provenance.sourcePackagePath === identity.sourcePackagePath
    && provenance.configPath === resolve(identity.configPath)
    && provenance.configSource === identity.configSource
}

export function canonicalProjectionEmissions(
  validation: GenerationValidation,
): Readonly<Partial<Record<TargetId, AdapterEmission>>> | undefined {
  return canonicalEvidence.get(validation)?.emissions
}

export function canonicalProjectionEvidence(
  validation: GenerationValidation,
): CanonicalProjectionEvidence | undefined {
  return canonicalEvidence.get(validation)
}

export function generate(
  root: string,
  adapterList: readonly HarnessAdapter[] = adapters,
  opts: GenerateOptions = {},
): GenerateResult {
  const validation = validateGeneration(root, adapterList, opts)
  const { files, warnings, emissions, adaptersRun, config } = validation

  // A corrupt manifest shouldn't dead-end generate the way it does validate:
  // recover by treating this run as if there were no prior manifest at all, and
  // skip pruning (we have no record of what to prune). validate() still fails
  // loudly on the same corruption — regenerating is the recovery path.
  let prior: GenerationManifest | undefined
  try {
    prior = loadManifest(root)
  } catch (e) {
    if (!(e instanceof ConfigError)) throw e
    warnings.push(`ignoring unreadable generation manifest (${e.message}); skipping prune for this run`)
    prior = undefined
  }
  const rootAbs = resolve(root)

  // A plain `mcp.json` at the plugin root is the Agent Plugins 1.0 on-disk
  // name, not moe-mint's MCP source default (`.mcp.json`). If one is
  // sitting there unrecognized — not something an adapter emitted this run,
  // and not already known from a prior generation (in which case it's either
  // legitimately ours or about to be pruned as stale below) — it's very
  // likely a misnamed source config the user meant to write to `.mcp.json`.
  // Only applies when the user hasn't customized components.mcp away from
  // that default; an explicit `components.mcp: mcp.json` means this path IS
  // the intended source, not a stray file.
  if (config.components.mcp === '.mcp.json') {
    const strayAbs = resolve(root, 'mcp.json')
    const inNewFiles = files.some((f) => f.path === 'mcp.json')
    const inPriorManifest = prior !== undefined && Object.prototype.hasOwnProperty.call(prior.files, 'mcp.json')
    if (!inNewFiles && !inPriorManifest && existsSync(strayAbs) && statSync(strayAbs).isFile()) {
      warnings.push(
        'found mcp.json at the plugin root; the source MCP default is .mcp.json — rename it if it is your MCP config',
      )
    }
  }

  // Refuse to clobber files that already exist on disk but weren't produced by a
  // prior moe-mint run — e.g. a hand-written plugin.json dropped in before the
  // first `generate`. A file absent from the prior manifest (or with no prior
  // manifest at all) is only a conflict if its content actually differs from what
  // we're about to write; byte-identical files are left alone so a first run
  // right after cloning a repo that already contains generated output succeeds.
  // Note: when the manifest is unreadable, prior is undefined here too, so every
  // pre-existing generated file looks "not created by moe-mint" to the check
  // below. Its byte-identical allowance still lets unchanged files pass without
  // --force; files that actually differ correctly require --force, since we can
  // no longer tell "known-generated but hand-edited" apart from "genuinely
  // user-authored" once the manifest recording that is gone.
  const conflicts: string[] = []
  for (const file of files) {
    const abs = resolve(root, file.path)
    let lst: ReturnType<typeof lstatSync> | undefined
    try {
      lst = lstatSync(abs)
    } catch {
      continue // nothing there — existsSync would agree
    }
    if (lst.isSymbolicLink()) {
      // existsSync follows symlinks and reports false for a dangling one,
      // which would otherwise skip the file entirely here — silently
      // treating "someone planted a link at this path" as "nothing to see".
      // writeFileSet refuses to write through any symlink regardless of
      // --force, so this is always a real conflict, never byte-identical.
      conflicts.push(file.path)
      continue
    }
    if (prior && Object.prototype.hasOwnProperty.call(prior.files, file.path)) continue
    if (readFileSync(abs, 'utf8') === file.content) continue
    conflicts.push(file.path)
  }
  if (conflicts.length > 0 && !opts.force) {
    // package.json is npm-standard, hand-authored territory for most
    // projects, and moe-mint doesn't merge into it -- generate() only
    // ever emits a full replacement (opencode/pi's nodePackageManifest).
    // Point the user at the two actual ways out instead of leaving them to
    // guess why --force means "lose your package.json".
    const packageJsonNote = conflicts.includes('package.json')
      ? ' — note: package.json merging is not yet supported; either exclude the opencode and pi adapters (harnesses.exclude) or move your package.json fields into the generated one manually. --force will REPLACE your package.json entirely.'
      : ''
    throw new ConfigError(
      `refusing to overwrite existing file(s) not created by moe-mint: ${conflicts.join(', ')} (re-run with --force to overwrite)${packageJsonNote}`,
    )
  }

  const pruned: string[] = []
  if (prior) {
    const newPaths = new Set(files.map((f) => f.path))
    for (const [path, entry] of Object.entries(prior.files)) {
      if (newPaths.has(path)) continue

      // Skip and warn if path is unsafe (absolute or escapes root)
      if (isAbsolute(path)) {
        warnings.push(`ignoring manifest entry with unsafe path ${path}`)
        continue
      }
      const abs = resolve(root, path)
      if (!abs.startsWith(rootAbs + sep)) {
        warnings.push(`ignoring manifest entry with unsafe path ${path}`)
        continue
      }

      if (!existsSync(abs)) continue
      if (sha256(readFileSync(abs, 'utf8')) === entry.sha256) {
        rmSync(abs)
        pruned.push(path)
        let parent = dirname(abs)
        while (resolve(parent) !== rootAbs && existsSync(parent) && readdirSync(parent).length === 0) {
          rmdirSync(parent)
          parent = dirname(parent)
        }
      } else {
        warnings.push(`stale generated file ${path} was hand-modified; delete it or move changes into moe-mint.yaml`)
      }
    }
  }

  writeFileSet(root, files)
  saveManifest(root, files, TOOL_VERSION)

  return { files, warnings, emissions, adaptersRun, pruned }
}
