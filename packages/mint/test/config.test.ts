import { describe, it, expect } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadConfig, ConfigError } from '../src/config.js'

const POLICY = `
distribution:
  npm: "@scope/demo"
artifact:
  payloads: []
targets:
  claude-code: { intent: preview, expected_capabilities: [], operating_systems: [macos] }
  cursor: { intent: preview, expected_capabilities: [], operating_systems: [macos] }
  codex: { intent: preview, expected_capabilities: [], operating_systems: [macos] }
  kimi: { intent: preview, expected_capabilities: [], operating_systems: [macos] }
  opencode: { intent: preview, expected_capabilities: [], operating_systems: [macos] }
  pi: { intent: preview, expected_capabilities: [], operating_systems: [macos] }
  agent-plugins-1.0: { intent: preview, expected_capabilities: [] }
  copilot: { intent: preview, expected_capabilities: [], operating_systems: [macos] }
imported_works: []
`

function repoWith(yamlText: string, appendPolicy = true): string {
  const dir = mkdtempSync(join(tmpdir(), 'mint-config-'))
  writeFileSync(join(dir, 'moe-mint.yaml'), appendPolicy ? `${yamlText}${POLICY}` : yamlText)
  return dir
}

describe('loadConfig', () => {
  it('loads a minimal config with defaults', () => {
    const cfg = loadConfig(repoWith(
      'name: demo\nversion: 1.0.0\ndescription: A demo plugin\n'
    ))
    expect(cfg.name).toBe('demo')
    expect(cfg.version).toBe('1.0.0')
    expect(cfg.bootstrap).toEqual({ kind: 'none' })
    expect(cfg.components).toEqual({
      skills: 'skills',
      commands: 'commands',
      agents: 'agents',
      hooks: 'hooks/hooks.json',
      mcp: '.mcp.json',
    })
    expect(cfg.harnesses).toEqual({ exclude: [], settings: {} })
  })

  it('loads a full config in v2 syntax', () => {
    const cfg = loadConfig(repoWith([
      'name: kitchen-sink',
      'version: 0.1.0',
      'description: Fixture',
      'author: { name: Bubstack, email: dev@bubstack.example }',
      'license: MIT',
      'repository: https://github.com/example/kitchen-sink',
      'keywords: [fixture]',
      'bootstrap:',
      '  skill: using-kitchen-sink',
      'harnesses:',
      '  claude-code:',
      '    manifest:',
      '      homepage: https://example.com/kitchen-sink',
    ].join('\n')))
    expect(cfg.bootstrap).toEqual({ kind: 'skill', skill: 'using-kitchen-sink' })
    expect(cfg.harnesses.exclude).toEqual([])
    expect(cfg.harnesses.settings['claude-code']?.manifest).toEqual({
      homepage: 'https://example.com/kitchen-sink',
    })
    expect(cfg.author?.name).toBe('Bubstack')
  })

  describe('package-local artifact policy', () => {
    it('parses a typed distribution, payload, target and imported-work policy', () => {
      const cfg = loadConfig(repoWith([
        'name: demo',
        'version: 1.0.0',
        'description: demo',
        'distribution:',
        '  npm: "@scope/demo"',
        'artifact:',
        '  payloads:',
        '    - { from: "dist/", to: "runtime//dist/", required: true }',
        'targets:',
        '  claude-code: { intent: certify, expected_capabilities: [skill-discovery], operating_systems: [macos] }',
        '  cursor: { intent: omit }',
        '  codex: { intent: omit }',
        '  kimi: { intent: omit }',
        '  opencode: { intent: omit }',
        '  pi: { intent: omit }',
        '  agent-plugins-1.0: { intent: omit }',
        '  copilot: { intent: omit }',
        'imported_works: [{ name: upstream-work }]',
        'harnesses:',
        '  exclude: [cursor, codex, kimi, opencode, pi, agent-plugins-1.0, copilot]',
      ].join('\n'), false))

      expect(cfg.distribution).toEqual({ npm: '@scope/demo' })
      expect(cfg.artifact.payloads).toEqual([{ from: 'dist', to: 'runtime/dist', required: true }])
      expect(cfg.targets['claude-code']).toEqual({
        intent: 'certify', expectedCapabilities: ['skill-discovery'], operatingSystems: ['macos'],
      })
      expect(cfg.targets.cursor).toEqual({ intent: 'omit', expectedCapabilities: [] })
      expect(cfg.importedWorks).toEqual([{ name: 'upstream-work' }])
    })

    it.each([
      ['an unscoped npm name', '  npm: demo', /distribution\.npm/],
      ['an invalid npm name', '  npm: "@Scope/demo"', /distribution\.npm/],
      ['a glob payload source', '  payloads: [{ from: "dist/*", to: dist, required: true }]', /artifact\.payloads/],
      ['a traversal payload destination', '  payloads: [{ from: dist, to: "../dist", required: true }]', /artifact\.payloads/],
      ['a reserved payload destination', '  payloads: [{ from: dist, to: package.json, required: true }]', /artifact\.payloads/],
      ['a missing payload required boolean', '  payloads: [{ from: dist, to: dist }]', /required/],
    ])('rejects %s', (_name, replacement, expected) => {
      const yaml = `name: demo\nversion: 1.0.0\ndescription: demo\n${POLICY}`
      const start = replacement.startsWith('  npm') ? '  npm: "@scope/demo"' : '  payloads: []'
      expect(() => loadConfig(repoWith(yaml.replace(start, replacement), false))).toThrow(expected)
    })

    it.each([
      ['unknown target', '  unknown: { intent: omit }', /unknown/],
      ['unknown capability', '  claude-code: { intent: preview, expected_capabilities: [unknown-capability], operating_systems: [macos] }', /targets\.claude-code/],
      ['unknown operating system', '  claude-code: { intent: preview, expected_capabilities: [], operating_systems: [haiku] }', /targets\.claude-code/],
    ])('rejects an %s', (_name, entry, expected) => {
      const yaml = `name: demo\nversion: 1.0.0\ndescription: demo\n${POLICY}`
      expect(() => loadConfig(repoWith(yaml.replace('  claude-code: { intent: preview, expected_capabilities: [], operating_systems: [macos] }', entry), false))).toThrow(expected)
    })

    it('rejects duplicate imported work names', () => {
      const yaml = `name: demo\nversion: 1.0.0\ndescription: demo\n${POLICY}`
      expect(() => loadConfig(repoWith(yaml.replace('imported_works: []', 'imported_works: [{ name: one }, { name: one }]'), false))).toThrow(/duplicate/i)
    })

    it.each([
      ['omits a host operating-system matrix', '  claude-code: { intent: preview, expected_capabilities: [] }'],
      ['adds an operating-system matrix to the format target', '  agent-plugins-1.0: { intent: preview, expected_capabilities: [], operating_systems: [macos] }'],
      ['omits a canonical target', ''],
    ])('rejects a target policy that %s', (_name, replacement) => {
      const yaml = `name: demo\nversion: 1.0.0\ndescription: demo\n${POLICY}`
      const invalid = replacement === ''
        ? yaml.replace('  copilot: { intent: preview, expected_capabilities: [], operating_systems: [macos] }\n', '')
        : yaml.replace(replacement.includes('agent-plugins')
          ? '  agent-plugins-1.0: { intent: preview, expected_capabilities: [] }'
          : '  claude-code: { intent: preview, expected_capabilities: [], operating_systems: [macos] }', replacement)
      expect(() => loadConfig(repoWith(invalid, false))).toThrow(ConfigError)
    })

    it('rejects an exclude list that disagrees with target intent', () => {
      const yaml = `name: demo\nversion: 1.0.0\ndescription: demo\n${POLICY}`
      expect(() => loadConfig(repoWith(`${yaml}harnesses:\n  exclude: [cursor]\n`, false))).toThrow(/disagree/)
    })

    it('rejects scalar imported works with the object-form migration action', () => {
      const yaml = `name: demo\nversion: 1.0.0\ndescription: demo\n${POLICY}`
      try {
        loadConfig(repoWith(yaml.replace('imported_works: []', 'imported_works: [one]'), false))
        expect.unreachable('loadConfig should reject scalar imported work')
      } catch (error) {
        expect(error).toMatchObject({ diagnostic: { action: expect.stringContaining('{name: ...}') } })
      }
    })
  })

  it('rejects a missing required field, naming its YAML path', () => {
    expect(() => loadConfig(repoWith('version: 1.0.0\ndescription: x\n')))
      .toThrowError(ConfigError)
    try {
      loadConfig(repoWith('version: 1.0.0\ndescription: x\n'))
    } catch (e) {
      expect((e as ConfigError).details.join('\n')).toContain('name')
      expect((e as ConfigError).diagnostic).toMatchObject({
        code: 'CONFIG_INVALID',
        source: 'moe-mint.yaml',
        action: 'Correct the configuration and run the command again.',
      })
    }
  })

  describe('bootstrap tagged union', () => {
    it('resolves the "none" string literal to kind none', () => {
      const cfg = loadConfig(repoWith(
        'name: x\nversion: 1.0.0\ndescription: x\nbootstrap: none\n'
      ))
      expect(cfg.bootstrap).toEqual({ kind: 'none' })
    })

    it('resolves the "generate" string literal to kind generate', () => {
      const cfg = loadConfig(repoWith(
        'name: x\nversion: 1.0.0\ndescription: x\nbootstrap: generate\n'
      ))
      expect(cfg.bootstrap).toEqual({ kind: 'generate' })
    })

    it('resolves the { skill } object form to kind skill', () => {
      const cfg = loadConfig(repoWith(
        'name: x\nversion: 1.0.0\ndescription: x\nbootstrap:\n  skill: using-x\n'
      ))
      expect(cfg.bootstrap).toEqual({ kind: 'skill', skill: 'using-x' })
    })

    it('resolves an absent bootstrap key to kind none', () => {
      const cfg = loadConfig(repoWith(
        'name: x\nversion: 1.0.0\ndescription: x\n'
      ))
      expect(cfg.bootstrap).toEqual({ kind: 'none' })
    })

    it('rejects an empty bootstrap object (no skill)', () => {
      expect(() => loadConfig(repoWith(
        'name: x\nversion: 1.0.0\ndescription: x\nbootstrap: {}\n'
      ))).toThrowError(ConfigError)
    })
  })

  describe('per-harness settings', () => {
    it('resolves harnesses.<name>.hooks: own into the settings record', () => {
      const cfg = loadConfig(repoWith([
        'name: x',
        'version: 1.0.0',
        'description: x',
        'bootstrap:',
        '  skill: using-x',
        'harnesses:',
        '  claude-code:',
        '    hooks: own',
      ].join('\n')))
      expect(cfg.bootstrap).toEqual({ kind: 'skill', skill: 'using-x' })
      expect(cfg.harnesses.settings['claude-code']).toEqual({ hooks: 'own' })
    })

    it('defaults a harness with no hooks key to hooks: generated', () => {
      const cfg = loadConfig(repoWith([
        'name: x',
        'version: 1.0.0',
        'description: x',
        'bootstrap: generate',
        'harnesses:',
        '  cursor:',
        '    hooks: generated',
      ].join('\n')))
      expect(cfg.bootstrap).toEqual({ kind: 'generate' })
      expect(cfg.harnesses.settings.cursor).toEqual({ hooks: 'generated' })
    })

    it('resolves harnesses.<name>.manifest into the settings record', () => {
      const cfg = loadConfig(repoWith([
        'name: x',
        'version: 1.0.0',
        'description: x',
        'harnesses:',
        '  codex:',
        '    manifest:',
        '      description: codex-specific',
      ].join('\n')))
      expect(cfg.harnesses.settings.codex?.manifest).toEqual({ description: 'codex-specific' })
    })

    it('carries a null delete-sentinel inside a manifest patch', () => {
      const cfg = loadConfig(repoWith([
        'name: x',
        'version: 1.0.0',
        'description: x',
        'harnesses:',
        '  kimi:',
        '    manifest:',
        '      repository: null',
      ].join('\n')))
      expect(cfg.harnesses.settings.kimi?.manifest).toEqual({ repository: null })
    })

    it('rejects an unknown harness name, naming the key and the valid set', () => {
      expect(() => loadConfig(repoWith([
        'name: x',
        'version: 1.0.0',
        'description: x',
        'harnesses:',
        '  claudecode:',
        '    hooks: own',
      ].join('\n')))).toThrow(/claudecode.*claude-code.*cursor.*codex/s)
    })

    it('rejects an unknown harness name in exclude', () => {
      expect(() => loadConfig(repoWith([
        'name: x',
        'version: 1.0.0',
        'description: x',
        'harnesses:',
        '  exclude: [cursur]',
      ].join('\n')))).toThrow(/harnesses\.exclude.*cursur.*claude-code/s)
    })

    it('rejects a stray key inside the bootstrap skill object', () => {
      expect(() => loadConfig(repoWith([
        'name: x',
        'version: 1.0.0',
        'description: x',
        'bootstrap:',
        '  skill: using-x',
        '  bogus: 1',
      ].join('\n')))).toThrow(ConfigError)
    })

    it('rejects hooks: own on a non-hook-emitting harness (codex)', () => {
      expect(() => loadConfig(repoWith([
        'name: x',
        'version: 1.0.0',
        'description: x',
        'bootstrap: generate',
        'harnesses:',
        '  codex:',
        '    hooks: own',
      ].join('\n')))).toThrow(/codex.*hook-emitting.*claude-code.*cursor/s)
    })

    it('rejects hooks: own when bootstrap is none', () => {
      expect(() => loadConfig(repoWith([
        'name: x',
        'version: 1.0.0',
        'description: x',
        'bootstrap: none',
        'harnesses:',
        '  claude-code:',
        '    hooks: own',
      ].join('\n')))).toThrow(/claude-code.*requires an active bootstrap/s)
    })

    it('rejects hooks: own when bootstrap is absent', () => {
      expect(() => loadConfig(repoWith([
        'name: x',
        'version: 1.0.0',
        'description: x',
        'harnesses:',
        '  claude-code:',
        '    hooks: own',
      ].join('\n')))).toThrow(/requires an active bootstrap/)
    })

    it('rejects a manifest value that is not a mapping', () => {
      expect(() => loadConfig(repoWith([
        'name: x',
        'version: 1.0.0',
        'description: x',
        'harnesses:',
        '  cursor:',
        '    manifest: nope',
      ].join('\n')))).toThrow(/manifest.*must be a mapping/)
    })

    it('rejects an unknown key inside a harness block', () => {
      expect(() => loadConfig(repoWith([
        'name: x',
        'version: 1.0.0',
        'description: x',
        'harnesses:',
        '  cursor:',
        '    bogus: 1',
      ].join('\n')))).toThrow(/cursor\.bogus.*unknown key/)
    })
  })

  describe('old-syntax hard errors (each names its replacement)', () => {
    it('rejects bootstrap: { none: true } with the tagged-value message', () => {
      try {
        loadConfig(repoWith(
          'name: x\nversion: 1.0.0\ndescription: x\nbootstrap:\n  none: true\n'
        ))
        expect.unreachable('should have thrown')
      } catch (e) {
        expect((e as ConfigError).message).toBe(
          'bootstrap is now a tagged value: use "bootstrap: none", "bootstrap: generate", or "bootstrap: { skill: <name> }"',
        )
      }
    })

    it('rejects bootstrap: { generate: true } with the tagged-value message', () => {
      try {
        loadConfig(repoWith(
          'name: x\nversion: 1.0.0\ndescription: x\nbootstrap:\n  generate: true\n'
        ))
        expect.unreachable('should have thrown')
      } catch (e) {
        expect((e as ConfigError).message).toBe(
          'bootstrap is now a tagged value: use "bootstrap: none", "bootstrap: generate", or "bootstrap: { skill: <name> }"',
        )
      }
    })

    it('rejects bootstrap.emitHooks with the moved message', () => {
      try {
        loadConfig(repoWith(
          'name: x\nversion: 1.0.0\ndescription: x\nbootstrap:\n  skill: using-x\n  emitHooks: false\n'
        ))
        expect.unreachable('should have thrown')
      } catch (e) {
        expect((e as ConfigError).message).toBe('bootstrap.emitHooks moved: set harnesses.<name>.hooks: own')
      }
    })

    it('rejects harnesses.overrides with the moved message', () => {
      try {
        loadConfig(repoWith([
          'name: x',
          'version: 1.0.0',
          'description: x',
          'harnesses:',
          '  overrides:',
          '    claude-code:',
          '      homepage: https://example.com',
        ].join('\n')))
        expect.unreachable('should have thrown')
      } catch (e) {
        expect((e as ConfigError).message).toBe(
          'harnesses.overrides moved: put manifest patches under harnesses.<name>.manifest',
        )
      }
    })

    it('rejects a bump: section with the renamed message', () => {
      try {
        loadConfig(repoWith([
          'name: x',
          'version: 1.0.0',
          'description: x',
          'bump:',
          '  files:',
          '    - { path: release.json, field: version }',
        ].join('\n')))
        expect.unreachable('should have thrown')
      } catch (e) {
        expect((e as ConfigError).message).toBe('bump: was renamed: use release: (same fields)')
      }
    })
  })

  it('reports a missing moe-mint.yaml as a ConfigError', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mint-empty-'))
    expect(() => loadConfig(dir)).toThrowError(/moe-mint\.yaml not found/)
  })

  it('rejects version 1.0.0 x (trailing garbage)', () => {
    expect(() => loadConfig(repoWith(
      'name: bad\nversion: 1.0.0 x\ndescription: bad\n'
    ))).toThrowError(ConfigError)
    try {
      loadConfig(repoWith('name: bad\nversion: 1.0.0 x\ndescription: bad\n'))
    } catch (e) {
      expect((e as ConfigError).details.join('\n')).toContain('version')
    }
  })

  it('rejects version 1.0.0.7 (too many segments)', () => {
    expect(() => loadConfig(repoWith(
      'name: bad\nversion: 1.0.0.7\ndescription: bad\n'
    ))).toThrowError(ConfigError)
    try {
      loadConfig(repoWith('name: bad\nversion: 1.0.0.7\ndescription: bad\n'))
    } catch (e) {
      expect((e as ConfigError).details.join('\n')).toContain('version')
    }
  })

  it('accepts version 1.2.3-rc.1 (prerelease suffix)', () => {
    const cfg = loadConfig(repoWith(
      'name: demo\nversion: 1.2.3-rc.1\ndescription: test\n'
    ))
    expect(cfg.version).toBe('1.2.3-rc.1')
  })

  it('rejects invalid YAML syntax', () => {
    expect(() => loadConfig(repoWith(
      'name: [unclosed\n'
    ))).toThrowError(ConfigError)
    try {
      loadConfig(repoWith('name: [unclosed\n'))
    } catch (e) {
      expect((e as ConfigError).message).toMatch(/not valid YAML/)
    }
  })

  it('chains the original parse error as .cause for invalid YAML', () => {
    try {
      loadConfig(repoWith('name: [unclosed\n'))
      expect.unreachable('loadConfig should have thrown')
    } catch (e) {
      const err = e as ConfigError
      expect(err.cause).toBeInstanceOf(Error)
      expect((err.cause as Error).message).toBeTruthy()
      expect(err.message).toContain((err.cause as Error).message)
    }
  })

  it('loads the kitchen-sink fixture config', () => {
    const cfg = loadConfig('fixtures/kitchen-sink')
    expect(cfg.name).toBe('kitchen-sink')
    expect(cfg.bootstrap).toEqual({ kind: 'skill', skill: 'using-kitchen-sink' })
  })

  it('loads the typed policy fixture', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mint-typed-fixture-'))
    writeFileSync(join(dir, 'moe-mint.yaml'), readFileSync('test/fixtures/config/typed-policy.yaml', 'utf8'))
    expect(loadConfig(dir).artifact.payloads).toEqual([{ from: 'dist', to: 'dist', required: true }])
  })

  it('normalizes trailing slashes on component paths', () => {
    const cfg = loadConfig(repoWith([
      'name: test-normalize',
      'version: 1.0.0',
      'description: Test trailing slash normalization',
      'components:',
      '  skills: skills/',
      '  commands: cmds//',
    ].join('\n')))
    expect(cfg.components.skills).toBe('skills')
    expect(cfg.components.commands).toBe('cmds')
  })

  it('rejects component paths with quotes, rejecting via components.skills', () => {
    expect(() => loadConfig(repoWith(
      'name: bad\nversion: 1.0.0\ndescription: bad\ncomponents:\n  skills: \'weird"dir\'\n'
    ))).toThrowError(ConfigError)
    try {
      loadConfig(repoWith('name: bad\nversion: 1.0.0\ndescription: bad\ncomponents:\n  skills: \'weird"dir\'\n'))
    } catch (e) {
      const err = e as ConfigError
      expect(err.details.join('\n')).toContain('components.skills')
      expect(err.details.join('\n')).toContain('path segments may contain only')
    }
  })

  it('accepts multi-segment component paths', () => {
    const cfg = loadConfig(repoWith([
      'name: multi-seg',
      'version: 1.0.0',
      'description: Multi-segment paths',
      'components:',
      '  skills: my/skills',
      '  commands: my/commands/here',
    ].join('\n')))
    expect(cfg.components.skills).toBe('my/skills')
    expect(cfg.components.commands).toBe('my/commands/here')
  })

  it('rejects component paths with backslashes', () => {
    expect(() => loadConfig(repoWith(
      'name: bad\nversion: 1.0.0\ndescription: bad\ncomponents:\n  skills: \'skills\\\\dir\'\n'
    ))).toThrowError(ConfigError)
  })

  it('rejects component paths with spaces', () => {
    expect(() => loadConfig(repoWith(
      'name: bad\nversion: 1.0.0\ndescription: bad\ncomponents:\n  skills: \'my skills\'\n'
    ))).toThrowError(ConfigError)
  })

  it('rejects . and .. path segments (traversal), even though the charset regex alone would allow them', () => {
    expect(() => loadConfig(repoWith(
      'name: bad\nversion: 1.0.0\ndescription: bad\ncomponents:\n  skills: ../../elsewhere\n'
    ))).toThrowError(ConfigError)
    try {
      loadConfig(repoWith('name: bad\nversion: 1.0.0\ndescription: bad\ncomponents:\n  skills: ../../elsewhere\n'))
    } catch (e) {
      const err = e as ConfigError
      expect(err.details.join('\n')).toContain('components.skills')
      expect(err.details.join('\n')).toContain('path segments may not be . or ..')
    }
  })

  it('accepts the widened marketplace key', () => {
    const cfg = loadConfig(repoWith([
      'name: pub-plugin',
      'version: 1.0.0',
      'description: A publishable plugin',
      'repository: https://github.com/o/r',
      'marketplace:',
      '  name: pub',
      '  description: D',
      '  source: repository',
      '  strict: false',
      '  category: c',
      '  tags: [t]',
    ].join('\n')))
    expect(cfg.marketplace).toEqual({
      name: 'pub',
      description: 'D',
      source: 'repository',
      strict: false,
      category: 'c',
      tags: ['t'],
    })
  })

  it('accepts an explicit http(s) URL as marketplace.source', () => {
    expect(() => loadConfig(repoWith([
      'name: pub-plugin',
      'version: 1.0.0',
      'description: A publishable plugin',
      'marketplace:',
      '  source: https://github.com/o/r.git',
    ].join('\n')))).not.toThrow()
  })

  it('rejects marketplace.source: repository without a top-level repository field', () => {
    expect(() => loadConfig(repoWith([
      'name: pub-plugin',
      'version: 1.0.0',
      'description: A publishable plugin',
      'marketplace:',
      '  source: repository',
    ].join('\n')))).toThrow(/marketplace\.source.*repository/)
  })

  it('rejects a junk marketplace.source value', () => {
    expect(() => loadConfig(repoWith([
      'name: pub-plugin',
      'version: 1.0.0',
      'description: A publishable plugin',
      'marketplace:',
      '  source: ftp://x',
    ].join('\n')))).toThrow()
  })

  it('accepts the release key', () => {
    const cfg = loadConfig(repoWith([
      'name: demo',
      'version: 1.0.0',
      'description: A demo plugin',
      'release:',
      '  files:',
      '    - path: package.json',
      '      field: version',
      '  audit:',
      '    exclude: [CHANGELOG.md]',
    ].join('\n')))
    expect(cfg.release?.files).toEqual([{ path: 'package.json', field: 'version' }])
    expect(cfg.release?.audit?.exclude).toEqual(['CHANGELOG.md'])
  })

  it('leaves release undefined when absent', () => {
    const cfg = loadConfig(repoWith(
      'name: demo\nversion: 1.0.0\ndescription: A demo plugin\n'
    ))
    expect(cfg.release).toBeUndefined()
  })

  it('rejects a release.files path that traverses out of the plugin root', () => {
    expect(() => loadConfig(repoWith([
      'name: demo',
      'version: 1.0.0',
      'description: A demo plugin',
      'release:',
      '  files:',
      '    - path: ../x.json',
      '      field: version',
    ].join('\n')))).toThrowError(ConfigError)
  })

  it('rejects a release.files path with shell metacharacters', () => {
    expect(() => loadConfig(repoWith(
      'name: demo\nversion: 1.0.0\ndescription: A demo plugin\nrelease:\n  files:\n    - path: \'weird"dir/x.json\'\n      field: version\n'
    ))).toThrowError(ConfigError)
  })
})
