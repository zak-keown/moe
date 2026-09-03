import { describe, it, expect } from 'vitest'
import {
  parsePlatformTag,
  comparePlatformTags,
  selectBaseline,
  selectStableCandidate,
} from '../src/release/tag-policy.js'

describe('parsePlatformTag', () => {
  it.each([
    { ref: 'v1.0.0', version: '1.0.0', core: '1.0.0', channel: 'stable' as const, npmTag: 'latest' as const },
    { ref: 'v0.1.5', version: '0.1.5', core: '0.1.5', channel: 'stable' as const, npmTag: 'latest' as const },
    { ref: 'v2.3.4', version: '2.3.4', core: '2.3.4', channel: 'stable' as const, npmTag: 'latest' as const },
    { ref: 'v0.1.5-rc.1', version: '0.1.5-rc.1', core: '0.1.5', channel: 'prerelease' as const, npmTag: 'next' as const },
    { ref: 'v1.0.0-alpha.1', version: '1.0.0-alpha.1', core: '1.0.0', channel: 'prerelease' as const, npmTag: 'next' as const },
    { ref: 'v1.0.0-beta.2', version: '1.0.0-beta.2', core: '1.0.0', channel: 'prerelease' as const, npmTag: 'next' as const },
  ])('parses $ref correctly', ({ ref, version, core, channel, npmTag }) => {
    const tag = parsePlatformTag(ref)
    expect(tag.raw).toBe(ref)
    expect(tag.platformVersion).toBe(version)
    expect(tag.semverCore).toBe(core)
    expect(tag.channel).toBe(channel)
    expect(tag.npmTag).toBe(npmTag)
  })

  it.each([
    '1.0.0',
    'v',
    'vnothing',
    'v1.0',
    'v1',
    '',
    'release-1.0.0',
  ])('rejects malformed ref "%s"', (ref) => {
    expect(() => parsePlatformTag(ref)).toThrow()
  })

  it('rejects build metadata', () => {
    expect(() => parsePlatformTag('v1.0.0+build')).toThrow(/build metadata/)
  })
})

describe('comparePlatformTags', () => {
  it('orders by semver', () => {
    const tags = [
      parsePlatformTag('v1.0.0'),
      parsePlatformTag('v0.1.5-rc.1'),
      parsePlatformTag('v0.1.5'),
      parsePlatformTag('v0.1.5-rc.2'),
      parsePlatformTag('v2.0.0'),
    ]
    const sorted = [...tags].sort(comparePlatformTags)
    expect(sorted.map((t) => t.raw)).toEqual([
      'v0.1.5-rc.1',
      'v0.1.5-rc.2',
      'v0.1.5',
      'v1.0.0',
      'v2.0.0',
    ])
  })
})

describe('selectBaseline', () => {
  it('returns genesis when no prior tags exist', () => {
    const candidate = parsePlatformTag('v0.1.5-rc.1')
    const result = selectBaseline(candidate, [])
    expect(result.isGenesis).toBe(true)
  })

  it('finds highest same-core prerelease', () => {
    const candidate = parsePlatformTag('v0.1.5-rc.3')
    const priors = [
      parsePlatformTag('v0.1.5-rc.1'),
      parsePlatformTag('v0.1.5-rc.2'),
      parsePlatformTag('v0.1.4'),
    ]
    const result = selectBaseline(candidate, priors)
    expect(result.isGenesis).toBe(false)
    expect(result.tag.raw).toBe('v0.1.5-rc.2')
  })

  it('rejects a stable tag as candidate input', () => {
    const stable = parsePlatformTag('v1.0.0')
    expect(() => selectBaseline(stable, [])).toThrow()
  })
})

describe('selectStableCandidate', () => {
  it('selects the highest same-core prerelease', () => {
    const stable = parsePlatformTag('v0.1.5')
    const priors = [
      parsePlatformTag('v0.1.5-rc.1'),
      parsePlatformTag('v0.1.5-rc.2'),
    ]
    const result = selectStableCandidate(stable, priors, 'abc123')
    expect(result.raw).toBe('v0.1.5-rc.2')
  })

  it('throws when no candidate exists', () => {
    const stable = parsePlatformTag('v0.1.5')
    expect(() => selectStableCandidate(stable, [], 'abc123')).toThrow(/no prerelease candidate/)
  })

  it('rejects non-stable tag', () => {
    const pre = parsePlatformTag('v0.1.5-rc.1')
    expect(() => selectStableCandidate(pre, [], 'abc123')).toThrow(/stable tag/)
  })
})
