import { describe, it, expect } from 'vitest'
import {
  canonicalJson,
  sha256,
  sha512Integrity,
  validatePlatformCatalog,
  buildPrereleaseCatalog,
  buildStableCatalog,
  detectChangedPlugins,
  requireVersionChangeForArtifactChange,
  REGISTRY_PLUGIN_COUNT,
  type PlatformCatalogV1,
  type PluginCatalogRecordV1,
  type CertificationTupleV1,
} from '../src/release/catalog.js'
import { parsePlatformTag } from '../src/release/tag-policy.js'

function fakeArtifactRecord(pluginId: string): PluginCatalogRecordV1['artifact'] {
  return {
    artifact_tree_sha256: 'a'.repeat(64),
    artifact_manifest_sha256: 'b'.repeat(64),
    tarball: { integrity: 'sha512-AAAA', bytes: 1024 },
    mirror: { asset: `${pluginId}.tgz`, sha256: 'c'.repeat(64) },
    legal: {
      files: { LICENSE: 'd'.repeat(64), NOTICE: 'e'.repeat(64) },
      bundle_inventory_sha256: 'f'.repeat(64),
    },
    emitted_capabilities: {},
  }
}

function fakePlugin(id: string, pkg: string, version: string): PluginCatalogRecordV1 {
  return {
    plugin: id,
    package: pkg,
    version,
    artifact: fakeArtifactRecord(id),
    certification: [],
  }
}

const SIX_PLUGINS: readonly PluginCatalogRecordV1[] = [
  fakePlugin('moe', '@bubstack/moe-core', '0.1.5'),
  fakePlugin('moe-backstory', '@bubstack/moe-backstory', '0.1.5'),
  fakePlugin('moe-memory', '@bubstack/moe-memory', '0.1.5'),
  fakePlugin('moe-glass', '@bubstack/moe-glass', '0.1.5'),
  fakePlugin('moe-crew', '@bubstack/moe-crew', '0.1.5'),
  fakePlugin('moe-statusline', '@bubstack/moe-statusline', '0.1.1'),
]

function fakeCatalog(channel: 'prerelease' | 'stable' = 'prerelease'): PlatformCatalogV1 {
  return {
    schema: 1,
    platform_version: channel === 'prerelease' ? '0.1.5-rc.1' : '0.1.5',
    channel,
    source: {
      git_sha: '0'.repeat(40),
      lockfile_sha256: '1'.repeat(64),
      platform_registry_schema: 1,
      platform_registry_sha256: '2'.repeat(64),
      mint_version: '0.0.0',
    },
    plugins: SIX_PLUGINS,
  }
}

describe('canonicalJson', () => {
  it('produces two-space indented JSON with trailing newline', () => {
    const result = canonicalJson({ a: 1 })
    expect(result).toBe('{\n  "a": 1\n}\n')
    expect(result.endsWith('\n')).toBe(true)
  })
})

describe('sha256', () => {
  it('returns lowercase hex', () => {
    const result = sha256('hello')
    expect(result).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('sha512Integrity', () => {
  it('returns sha512-<base64> format', () => {
    const result = sha512Integrity(Buffer.from('hello'))
    expect(result).toMatch(/^sha512-[A-Za-z0-9+/]+=*$/)
  })
})

describe('validatePlatformCatalog', () => {
  it('accepts a valid catalog', () => {
    const catalog = fakeCatalog()
    const result = validatePlatformCatalog(catalog)
    expect(result.schema).toBe(1)
    expect(result.plugins).toHaveLength(REGISTRY_PLUGIN_COUNT)
  })

  it('rejects wrong plugin count', () => {
    const catalog = { ...fakeCatalog(), plugins: SIX_PLUGINS.slice(0, 3) }
    expect(() => validatePlatformCatalog(catalog)).toThrow()
  })

  it('rejects duplicate packages', () => {
    const duped = [...SIX_PLUGINS]
    duped[1] = { ...duped[1]!, package: duped[0]!.package }
    const catalog = { ...fakeCatalog(), plugins: duped }
    expect(() => validatePlatformCatalog(catalog)).toThrow(/duplicate/)
  })

  it('rejects missing schema fields', () => {
    expect(() => validatePlatformCatalog({})).toThrow()
    expect(() => validatePlatformCatalog({ schema: 2 })).toThrow()
  })

  it('rejects unknown keys', () => {
    const catalog = { ...fakeCatalog(), unknown_field: true }
    expect(() => validatePlatformCatalog(catalog)).toThrow()
  })
})

describe('buildPrereleaseCatalog', () => {
  it('builds a prerelease catalog', () => {
    const tag = parsePlatformTag('v0.1.5-rc.1')
    const result = buildPrereleaseCatalog(
      tag,
      '0'.repeat(40),
      '1'.repeat(64),
      '2'.repeat(64),
      '0.0.0',
      SIX_PLUGINS,
    )
    expect(result.channel).toBe('prerelease')
    expect(result.platform_version).toBe('0.1.5-rc.1')
    expect(result.plugins).toHaveLength(6)
  })

  it('rejects stable tag', () => {
    const tag = parsePlatformTag('v0.1.5')
    expect(() =>
      buildPrereleaseCatalog(tag, '0'.repeat(40), '1'.repeat(64), '2'.repeat(64), '0.0.0', SIX_PLUGINS),
    ).toThrow(/prerelease/)
  })

  it('rejects wrong plugin count', () => {
    const tag = parsePlatformTag('v0.1.5-rc.1')
    expect(() =>
      buildPrereleaseCatalog(tag, '0'.repeat(40), '1'.repeat(64), '2'.repeat(64), '0.0.0', []),
    ).toThrow()
  })
})

describe('buildStableCatalog', () => {
  it('preserves candidate artifact records', () => {
    const candidateCatalog = fakeCatalog('prerelease')
    const stableTag = parsePlatformTag('v0.1.5')
    const result = buildStableCatalog(stableTag, candidateCatalog, new Map())
    expect(result.channel).toBe('stable')
    expect(result.platform_version).toBe('0.1.5')
    for (let i = 0; i < REGISTRY_PLUGIN_COUNT; i++) {
      expect(result.plugins[i]!.artifact).toEqual(candidateCatalog.plugins[i]!.artifact)
    }
  })

  it('applies certification overrides', () => {
    const candidateCatalog = fakeCatalog('prerelease')
    const stableTag = parsePlatformTag('v0.1.5')
    const certs: CertificationTupleV1[] = [{
      target: 'claude-code',
      os: 'macos',
      status: 'certified',
      evidence: { asset: 'evidence.json', sha256: 'a'.repeat(64), result_id: 'r1' },
    }]
    const certMap = new Map([['moe', certs]])
    const result = buildStableCatalog(stableTag, candidateCatalog, certMap)
    expect(result.plugins[0]!.certification).toEqual(certs)
    expect(result.plugins[1]!.certification).toEqual([])
  })

  it('rejects prerelease tag', () => {
    const preTag = parsePlatformTag('v0.1.5-rc.1')
    expect(() => buildStableCatalog(preTag, fakeCatalog(), new Map())).toThrow(/stable/)
  })
})

describe('detectChangedPlugins', () => {
  it('marks all changed for genesis (no previous)', () => {
    const current = SIX_PLUGINS.map((p) => ({
      plugin: p.plugin,
      version: p.version,
      treeSha256: p.artifact.artifact_tree_sha256,
      manifestSha256: p.artifact.artifact_manifest_sha256,
    }))
    const result = detectChangedPlugins(current)
    expect([...result.values()].every(Boolean)).toBe(true)
  })

  it('detects version change', () => {
    const previous = fakeCatalog()
    const current = SIX_PLUGINS.map((p, i) => ({
      plugin: p.plugin,
      version: i === 0 ? '0.1.6' : p.version,
      treeSha256: p.artifact.artifact_tree_sha256,
      manifestSha256: p.artifact.artifact_manifest_sha256,
    }))
    const result = detectChangedPlugins(current, previous)
    expect(result.get('moe')).toBe(true)
    expect(result.get('moe-backstory')).toBe(false)
  })

  it('detects tree hash change', () => {
    const previous = fakeCatalog()
    const current = SIX_PLUGINS.map((p, i) => ({
      plugin: p.plugin,
      version: p.version,
      treeSha256: i === 0 ? 'x'.repeat(64) : p.artifact.artifact_tree_sha256,
      manifestSha256: p.artifact.artifact_manifest_sha256,
    }))
    const result = detectChangedPlugins(current, previous)
    expect(result.get('moe')).toBe(true)
  })
})

describe('requireVersionChangeForArtifactChange', () => {
  it('passes when no previous catalog', () => {
    expect(() =>
      requireVersionChangeForArtifactChange('moe', '0.1.5', 'a'.repeat(64), 'b'.repeat(64)),
    ).not.toThrow()
  })

  it('passes when version changed', () => {
    const previous = fakeCatalog()
    expect(() =>
      requireVersionChangeForArtifactChange('moe', '0.1.6', 'x'.repeat(64), 'y'.repeat(64), previous),
    ).not.toThrow()
  })

  it('passes when bytes unchanged', () => {
    const previous = fakeCatalog()
    const record = previous.plugins[0]!
    expect(() =>
      requireVersionChangeForArtifactChange(
        'moe',
        record.version,
        record.artifact.artifact_tree_sha256,
        record.artifact.artifact_manifest_sha256,
        previous,
      ),
    ).not.toThrow()
  })

  it('rejects bytes changed without version change', () => {
    const previous = fakeCatalog()
    const record = previous.plugins[0]!
    expect(() =>
      requireVersionChangeForArtifactChange('moe', record.version, 'x'.repeat(64), 'y'.repeat(64), previous),
    ).toThrow(/version change/)
  })
})
