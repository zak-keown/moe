import { readFile, realpath } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'

export interface BundleInput {
  output: string
  input: string
  packageName: string
  packageVersion: string
  packageManifest: string
}

export interface BundledPackage {
  name: string
  version: string
  package_manifest: string
  inputs: readonly string[]
  outputs: readonly string[]
}

export interface ReadBundleMetafilesOptions {
  readonly repositoryRoot: string
  readonly packageRoot: string
  readonly metafiles: readonly string[]
}

interface MetafileOutput {
  readonly inputs: Readonly<Record<string, unknown>>
  readonly imports?: readonly { readonly path?: unknown; readonly external?: unknown }[]
}

interface Metafile {
  readonly outputs: Readonly<Record<string, MetafileOutput>>
}

interface PackageIdentity {
  readonly name: string
  readonly version: string
  readonly manifest: string
}

function compareBytes(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'))
}

function compareBundleInputs(left: BundleInput, right: BundleInput): number {
  return compareBytes(left.packageName, right.packageName)
    || compareBytes(left.packageVersion, right.packageVersion)
    || compareBytes(left.packageManifest, right.packageManifest)
    || compareBytes(left.output, right.output)
    || compareBytes(left.input, right.input)
}

async function physicalPath(path: string, label: string): Promise<string> {
  try {
    return await realpath(path)
  } catch (error) {
    throw new Error(`${label} "${path}" does not exist or cannot be resolved`, { cause: error })
  }
}

async function physicalContainedPath(root: string, path: string, label: string): Promise<string> {
  const physical = await physicalPath(path, label)
  if (containedRelative(root, physical) === undefined) {
    throw new Error(`${label} "${path}" is outside the physical repository root`)
  }
  return physical
}

function slashPath(path: string): string {
  return path.split(sep).join('/')
}

function containedRelative(root: string, path: string): string | undefined {
  const candidate = relative(root, path)
  if (candidate === '') return ''
  if (isAbsolute(candidate) || candidate === '..' || candidate.startsWith(`..${sep}`)) return undefined
  return slashPath(candidate)
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseMetafile(value: unknown, path: string): Metafile {
  if (!isObject(value) || !isObject(value.outputs)) {
    throw new Error(`invalid bundler metafile "${path}": outputs must be an object`)
  }
  for (const [output, metadata] of Object.entries(value.outputs)) {
    if (!isObject(metadata) || !isObject(metadata.inputs)) {
      throw new Error(`invalid bundler metafile "${path}": output "${output}" inputs must be an object`)
    }
    if (metadata.imports !== undefined && !Array.isArray(metadata.imports)) {
      throw new Error(`invalid bundler metafile "${path}": output "${output}" imports must be an array`)
    }
  }
  return value as unknown as Metafile
}

async function readPackageIdentity(manifestPath: string, repositoryRoot: string): Promise<PackageIdentity | undefined> {
  let physicalManifest: string
  try {
    physicalManifest = await realpath(manifestPath)
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined
    throw new Error(`cannot resolve package manifest "${manifestPath}"`, { cause: error })
  }
  if (containedRelative(repositoryRoot, physicalManifest) === undefined) {
    throw new Error(`package manifest "${manifestPath}" is outside the physical repository root`)
  }
  let bytes: string
  try {
    bytes = await readFile(physicalManifest, 'utf8')
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined
    throw error
  }

  let manifest: unknown
  try {
    manifest = JSON.parse(bytes)
  } catch (error) {
    throw new Error(`invalid package manifest "${slashPath(relative(repositoryRoot, physicalManifest))}": expected JSON`, { cause: error })
  }
  if (!isObject(manifest)) {
    throw new Error(`invalid package manifest "${slashPath(relative(repositoryRoot, physicalManifest))}": expected an object`)
  }
  if (manifest.name === undefined && manifest.version === undefined) return undefined
  if (typeof manifest.name !== 'string' || manifest.name.length === 0
    || typeof manifest.version !== 'string' || manifest.version.length === 0) {
    throw new Error(`invalid package manifest "${slashPath(relative(repositoryRoot, physicalManifest))}": name and version must be non-empty strings`)
  }
  return {
    name: manifest.name,
    version: manifest.version,
    manifest: slashPath(relative(repositoryRoot, physicalManifest)),
  }
}

async function nearestPackageIdentity(inputPath: string, repositoryRoot: string): Promise<PackageIdentity | undefined> {
  let directory = dirname(inputPath)
  while (containedRelative(repositoryRoot, directory) !== undefined) {
    const identity = await readPackageIdentity(join(directory, 'package.json'), repositoryRoot)
    if (identity) return identity
    if (directory === repositoryRoot) break
    const parent = dirname(directory)
    if (parent === directory) break
    directory = parent
  }
  return undefined
}

function resolveMetafilePath(path: string, repositoryRoot: string): string {
  return resolve(repositoryRoot, path)
}

/**
 * Reads esbuild-compatible metafiles (including tsup's emitted shape) and
 * identifies every third-party input by its nearest package manifest.
 */
export async function readBundleMetafiles(options: ReadBundleMetafilesOptions): Promise<readonly BundleInput[]> {
  const repositoryRoot = await physicalPath(resolve(options.repositoryRoot), 'repository root')
  const packageRoot = await physicalPath(resolve(options.packageRoot), 'package root')
  if (containedRelative(repositoryRoot, packageRoot) === undefined) {
    throw new Error(`package root "${options.packageRoot}" is outside repository root "${options.repositoryRoot}"`)
  }
  const sourceManifest = slashPath(relative(repositoryRoot, await physicalContainedPath(repositoryRoot, join(packageRoot, 'package.json'), 'source package manifest')))

  const inputs = new Map<string, BundleInput>()
  for (const metafilePath of options.metafiles) {
    const physicalMetafile = await physicalContainedPath(repositoryRoot, metafilePath, 'bundler metafile')
    let parsed: unknown
    try {
      parsed = JSON.parse(await readFile(physicalMetafile, 'utf8'))
    } catch (error) {
      throw new Error(`invalid bundler metafile "${metafilePath}": expected JSON`, { cause: error })
    }
    const metafile = parseMetafile(parsed, physicalMetafile)
    for (const [rawOutput, output] of Object.entries(metafile.outputs)) {
      const outputAbsolute = resolveMetafilePath(rawOutput, repositoryRoot)
      const outputRelative = containedRelative(packageRoot, outputAbsolute)
      if (outputRelative === undefined || outputRelative === '') throw new Error(`bundler output "${rawOutput}" is outside the artifact package`)

      const externalInputs = new Set(
        (output.imports ?? [])
          .filter((entry) => entry.external === true && typeof entry.path === 'string')
          .map((entry) => entry.path as string),
      )

      for (const rawInput of Object.keys(output.inputs)) {
        if (externalInputs.has(rawInput)) continue
        const inputAbsolute = resolveMetafilePath(rawInput, repositoryRoot)
        const physicalInput = await physicalContainedPath(repositoryRoot, inputAbsolute, 'bundled input')
        const inputRelative = containedRelative(repositoryRoot, physicalInput)
        if (inputRelative === undefined) throw new Error(`bundled input "${rawInput}" is outside the repository`)
        const identity = await nearestPackageIdentity(physicalInput, repositoryRoot)
        if (!identity) {
          throw new Error(`cannot resolve bundled input "${inputRelative}" to a nearest package.json`)
        }
        if (identity.manifest === sourceManifest) continue
        const bundleInput: BundleInput = {
          output: outputRelative,
          input: inputRelative,
          packageName: identity.name,
          packageVersion: identity.version,
          packageManifest: identity.manifest,
        }
        inputs.set(`${bundleInput.output}\0${bundleInput.input}\0${bundleInput.packageName}\0${bundleInput.packageVersion}\0${bundleInput.packageManifest}`, bundleInput)
      }
    }
  }
  return [...inputs.values()].sort(compareBundleInputs)
}

/** Aggregates input/output evidence while refusing an ambiguous package version. */
export function resolveBundledPackages(inputs: readonly BundleInput[]): readonly BundledPackage[] {
  const versions = new Map<string, Set<string>>()
  for (const input of inputs) {
    const packageVersions = versions.get(input.packageName) ?? new Set<string>()
    packageVersions.add(input.packageVersion)
    versions.set(input.packageName, packageVersions)
  }
  for (const [name, packageVersions] of versions) {
    if (packageVersions.size > 1) {
      const sortedVersions = [...packageVersions].sort(compareBytes)
      throw new Error(`conflicting versions for bundled package "${name}": ${sortedVersions.join(', ')}`)
    }
  }

  const grouped = new Map<string, {
    name: string
    version: string
    manifest: string
    inputs: Set<string>
    outputs: Set<string>
  }>()
  for (const input of inputs) {
    const key = `${input.packageName}\0${input.packageVersion}\0${input.packageManifest}`
    const group = grouped.get(key) ?? {
      name: input.packageName,
      version: input.packageVersion,
      manifest: input.packageManifest,
      inputs: new Set<string>(),
      outputs: new Set<string>(),
    }
    group.inputs.add(input.input)
    group.outputs.add(input.output)
    grouped.set(key, group)
  }

  return [...grouped.values()]
    .sort((left, right) => compareBytes(left.name, right.name) || compareBytes(left.version, right.version) || compareBytes(left.manifest, right.manifest))
    .map((group) => ({
      name: group.name,
      version: group.version,
      package_manifest: group.manifest,
      inputs: [...group.inputs].sort(compareBytes),
      outputs: [...group.outputs].sort(compareBytes),
    }))
}
