import { rmSync, rmdirSync, readdirSync, readFileSync, existsSync, statSync, lstatSync } from 'node:fs'
import { dirname, resolve, isAbsolute, sep } from 'node:path'
import { buildModel, capturePersistedSkillSources } from './model.js'
import {
  contentEquals,
  generatedFileMode,
  writeFileSet,
  type FileContent,
  type FileSet,
  type GeneratedFile,
} from './fileset.js'
import { saveManifest, loadManifest, sha256, type GenerationManifest } from './manifest.js'
import { adapters, type HarnessAdapter, type SkillDelivery } from './adapters/index.js'
import { emitDocs, injectReadme } from './docs-emit.js'
import { ConfigError, type MintConfig } from './config.js'
import {
  loadVocabulary,
  validateCoverage,
  scanForUnknownTokens,
  assertNoSurvivors,
  assertNoResourceSurvivors,
  substituteAllSkills,
  adjustedModel,
} from './vocabulary.js'

export const TOOL_VERSION = '0.0.0'

export interface GenerateResult {
  files: FileSet<FileContent>
  warnings: string[]
  adaptersRun: string[]
  pruned: string[]
  readmeInjected: boolean
  skillDelivery: Record<string, SkillDelivery>
}

function validateSkillClosure(
  root: string,
  model: ReturnType<typeof buildModel>,
  active: HarnessAdapter[],
  renderedSkillFiles: GeneratedFile<FileContent>[],
): Record<string, SkillDelivery> {
  const renderedPaths = new Set(renderedSkillFiles.map((file) => file.path))
  const delivery: Record<string, SkillDelivery> = Object.fromEntries(
    adapters.map((adapter) => [adapter.name, 'unsupported' as const]),
  )

  for (const adapter of active) {
    let state = adapter.skillDelivery
    if (state === 'shared-compatible') {
      const provider = active.find(
        (candidate) =>
          candidate !== adapter &&
          candidate.skillDelivery !== 'shared-compatible' &&
          candidate.skillDelivery !== 'unsupported' &&
          candidate.skillLayout.outputDir === adapter.skillLayout.outputDir &&
          candidate.skillLayout.profile === adapter.skillLayout.profile,
      )
      if (!provider) state = 'unsupported'
    }

    if (state === 'rendered' || state === 'shared-compatible') {
      for (const file of model.skillFiles) {
        const path = `${adapter.skillLayout.outputDir}/${file.path}`
        if (!renderedPaths.has(path)) {
          throw new ConfigError(`adapter "${adapter.name}" skill delivery is incomplete: missing ${path}`)
        }
      }
    } else if (state === 'native-discovery') {
      for (const file of model.skillFiles) {
        const path = `${adapter.skillLayout.outputDir}/${file.path}`
        if (!existsSync(resolve(root, path))) {
          throw new ConfigError(`adapter "${adapter.name}" skill delivery is incomplete: missing ${path}`)
        }
      }
    }
    delivery[adapter.name] = state
  }

  return delivery
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
  byPath: Map<string, { owner: string; file: GeneratedFile<FileContent> }>,
  owner: string,
  files: GeneratedFile<FileContent>[],
  config: MintConfig,
): void {
  for (const file of files) {
    if (isSourcePath(file.path, config)) {
      throw new ConfigError(`adapter "${owner}" would overwrite source file ${file.path}`)
    }
    const existing = byPath.get(file.path)
    if (existing) {
      const identical =
        contentEquals(existing.file.content, file.content) &&
        generatedFileMode(existing.file) === generatedFileMode(file)
      if (!identical) {
        throw new ConfigError(`adapters "${existing.owner}" and "${owner}" both emit ${file.path}`)
      }
      continue // identical content: dedupe silently
    }
    byPath.set(file.path, { owner, file })
  }
}

export function generate(
  root: string,
  adapterList: HarnessAdapter[] = adapters,
  opts: { force?: boolean } = {},
): GenerateResult {
  const warnings: string[] = []
  let prior: GenerationManifest | undefined
  try {
    prior = loadManifest(root)
  } catch (e) {
    if (!(e instanceof ConfigError)) throw e
    warnings.push(`ignoring unreadable generation manifest (${e.message}); skipping prune for this run`)
    prior = undefined
  }

  const model = buildModel(root, prior?.skillSources)
  const excluded = new Set(model.config.harnesses.exclude)
  const active = adapterList.filter((a) => !excluded.has(a.name))

  const configuredVocab = loadVocabulary(root)
  const vocab = configuredVocab ?? { tokens: new Map(), blocks: new Map() }
  if (configuredVocab) {
    const activeProfiles = [...new Set(active.map((a) => a.skillLayout.profile))]
    validateCoverage(vocab, activeProfiles)
    scanForUnknownTokens(root, model.config.components.skills, vocab)
  }

  // Snapshot-derived skill trees are prepared before adapter emission. An
  // in-place layout updates the staged source tree; rendered layouts flow
  // through the same collision, manifest, and writer pipeline as adapter files.
  const renderedSkillFiles = substituteAllSkills(root, model, vocab, active)
  const skillDelivery = validateSkillClosure(root, model, active, renderedSkillFiles)

  const byPath = new Map<string, { owner: string; file: GeneratedFile<FileContent> }>()
  for (const adapter of active) {
    const adapterModel = adjustedModel(model, adapter.skillLayout)
    const result = adapter.emit(adapterModel)
    mergeFiles(byPath, adapter.name, result.files, model.config)
    warnings.push(...result.warnings.map((w) => `[${adapter.name}] ${w}`))
  }
  mergeFiles(byPath, 'skill-renderer', renderedSkillFiles, model.config)
  if (configuredVocab) assertNoSurvivors(renderedSkillFiles, model.skillFiles)
  else assertNoResourceSurvivors(renderedSkillFiles, model.skillFiles)
  mergeFiles(byPath, 'docs', emitDocs(model, active, skillDelivery), model.config)
  const files: FileSet<FileContent> = [...byPath.values()].map((v) => v.file)

  // A corrupt manifest shouldn't dead-end generate the way it does validate:
  // recover by treating this run as if there were no prior manifest at all, and
  // skip pruning (we have no record of what to prune). validate() still fails
  // loudly on the same corruption — regenerating is the recovery path.
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
  if (model.config.components.mcp === '.mcp.json') {
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
    if (contentEquals(readFileSync(abs), file.content)) continue
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
      if (sha256(readFileSync(abs)) === entry.sha256) {
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
  saveManifest(root, files, TOOL_VERSION, capturePersistedSkillSources(root, model))

  // README.md is a user file (never a GeneratedFile, never manifest-tracked),
  // so its injection runs after everything else is written and on its own path.
  const readme = injectReadme(root, active)
  if (readme.warning) warnings.push(readme.warning)

  return {
    files,
    warnings,
    adaptersRun: active.map((a) => a.name),
    pruned,
    readmeInjected: readme.injected,
    skillDelivery,
  }
}
