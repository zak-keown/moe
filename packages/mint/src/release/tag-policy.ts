import { parse, valid, prerelease, compare, major, minor, patch } from 'semver'
import { MintError } from '../diagnostics.js'

export interface PlatformTag {
  raw: string
  platformVersion: string
  semverCore: string
  channel: 'prerelease' | 'stable'
  npmTag: 'next' | 'latest'
}

function tagError(code: string, message: string, action: string, cause?: unknown): never {
  throw new MintError({
    severity: 'error',
    code,
    source: 'release tag',
    message,
    action,
  }, { cause })
}

export function parsePlatformTag(ref: string): PlatformTag {
  if (!ref.startsWith('v')) {
    tagError('TAG_INVALID', `"${ref}" does not start with 'v'`, 'Use a tag of the form v<semver>.')
  }
  const version = ref.slice(1)
  if (!valid(version)) {
    tagError('TAG_INVALID', `"${ref}" is not a valid semver tag`, 'Use a tag of the form v<semver>.')
  }
  const parsed = parse(version)
  if (parsed === null) {
    tagError('TAG_INVALID', `"${ref}" could not be parsed as semver`, 'Use a tag of the form v<semver>.')
  }
  if (parsed.build.length > 0) {
    tagError('TAG_BUILD_METADATA', `"${ref}" contains build metadata`, 'Platform tags must not carry build metadata.')
  }
  const pre = prerelease(version)
  const channel: PlatformTag['channel'] = pre !== null && pre.length > 0 ? 'prerelease' : 'stable'
  const npmTag: PlatformTag['npmTag'] = channel === 'prerelease' ? 'next' : 'latest'
  const semverCore = `${major(version)}.${minor(version)}.${patch(version)}`

  return {
    raw: ref,
    platformVersion: version,
    semverCore,
    channel,
    npmTag,
  }
}

export function comparePlatformTags(a: PlatformTag, b: PlatformTag): number {
  return compare(a.platformVersion, b.platformVersion)
}

export interface BaselineSelection {
  tag: PlatformTag
  isGenesis: boolean
}

export function selectBaseline(
  candidate: PlatformTag,
  priorTags: readonly PlatformTag[],
  _sourceSha?: string,
): BaselineSelection {
  if (candidate.channel !== 'prerelease') {
    tagError('TAG_STABLE_CANDIDATE', 'cannot prepare a candidate from a stable tag', 'Use a prerelease tag for candidate preparation.')
  }

  const sameCoreAndSha = priorTags
    .filter((tag) =>
      tag.channel === 'prerelease'
      && tag.semverCore === candidate.semverCore
    )
    .sort((a, b) => compare(b.platformVersion, a.platformVersion))

  if (sameCoreAndSha.length === 0) {
    return { tag: candidate, isGenesis: true }
  }

  return { tag: sameCoreAndSha[0]!, isGenesis: false }
}

export function selectStableCandidate(
  stableTag: PlatformTag,
  priorTags: readonly PlatformTag[],
  _sourceSha: string,
): PlatformTag {
  if (stableTag.channel !== 'stable') {
    tagError('TAG_NOT_STABLE', 'promotion requires a stable tag', 'Use a stable tag for promotion.')
  }

  const candidates = priorTags
    .filter((tag) =>
      tag.channel === 'prerelease'
      && tag.semverCore === stableTag.semverCore
    )
    .sort((a, b) => compare(b.platformVersion, a.platformVersion))

  if (candidates.length === 0) {
    tagError('TAG_NO_CANDIDATE', `no prerelease candidate found for ${stableTag.raw}`, 'Create and verify a candidate before promoting to stable.')
  }

  return candidates[0]!
}
