import { cpSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { opencode } from '../src/adapters/opencode.js'
import { pi } from '../src/adapters/pi.js'
import type { ComponentSupport, HarnessAdapter } from '../src/adapters/types.js'
import { generate, validateGeneration } from '../src/generate.js'

const stubSupport: ComponentSupport = {
  skills: 'full', commands: 'full', agents: 'full', hooks: 'full',
  mcp: 'full', bootstrap: 'full', rules: 'none', variables: 'none',
}

function freshFixture(): string {
  const dir = mkdtempSync(join(tmpdir(), 'mint-package-contributions-'))
  cpSync('fixtures/kitchen-sink', dir, { recursive: true })
  return dir
}

describe('adapter package contributions', () => {
  it('collects immutable Pi and OpenCode metadata separately from generated files', () => {
    const result = validateGeneration(freshFixture(), [opencode, pi])

    expect(result.files.some((file) => file.path === 'package.json')).toBe(false)
    expect(result.packageContributions).toEqual([
      { owner: 'opencode', exports: { './server': './.opencode/plugins/kitchen-sink.js' } },
      {
        owner: 'pi',
        pi: {
          extensions: ['./.pi/extensions/kitchen-sink.ts'],
          skills: ['./skills'],
        },
      },
    ])
    expect(Object.isFrozen(result.packageContributions)).toBe(true)
    expect(Object.isFrozen(result.packageContributions[0]!)).toBe(true)
    expect(Object.isFrozen(result.packageContributions[0]!.exports!)).toBe(true)
    expect(Object.isFrozen(result.packageContributions[1]!.pi!)).toBe(true)
    expect(Object.isFrozen(result.packageContributions[1]!.pi!.extensions)).toBe(true)
    expect(Object.isFrozen(result.packageContributions[1]!.pi!.skills)).toBe(true)
    expect(() => (result.packageContributions[1]!.pi!.extensions as string[]).push('./mutation')).toThrow(TypeError)

    const generated = generate(freshFixture(), [opencode, pi])
    expect(Object.isFrozen(generated.packageContributions)).toBe(true)
    expect(Object.isFrozen(generated.packageContributions[1]!.pi!.extensions)).toBe(true)
    expect(Object.isFrozen(generated.packageContributions[1]!.pi!.skills)).toBe(true)
  })

  it.each([
    'package.json',
    './package.json',
    'nested/../package.json',
    'nested/./../package.json',
    'PACKAGE.JSON',
    'pac\u212Aage.json',
    'package.j\u017Fon',
  ])(
    'rejects %s as a reserved root package manifest through a stable diagnostic',
    (path) => {
      const adapter: HarnessAdapter = {
        name: 'codex',
        support: stubSupport,
        emit: () => ({
          files: [{ path, content: '{"name":"replacement"}\n' }],
          limitations: [],
          emittedCapabilities: [],
        }),
      }

      try {
        validateGeneration(freshFixture(), [adapter])
        expect.unreachable('reserved root package manifest should have been rejected')
      } catch (error) {
        expect((error as { diagnostic?: unknown }).diagnostic).toMatchObject({
          code: 'ADAPTER_PACKAGE_MANIFEST_EMITTED',
          plugin: 'kitchen-sink',
          target: 'codex',
          source: 'moe-mint.yaml',
          field: 'adapters.codex.files.0.path',
        })
      }
    },
  )

  it.each([
    ['package.j\u00DFon', 'sharp S folds to an extra s'],
    ['package.j\uFB06on', 'the st ligature folds to two characters'],
  ])('allows %s when %s does not fully fold to the reserved filename', (path) => {
    const adapter: HarnessAdapter = {
      name: 'codex',
      support: stubSupport,
      emit: () => ({
        files: [{ path, content: '{"name":"not-the-root-manifest"}\n' }],
        limitations: [],
        emittedCapabilities: ['skill-discovery'],
      }),
    }

    expect(() => validateGeneration(freshFixture(), [adapter])).not.toThrow()
  })

  it.each([
    ['codex', 'pi', { pi: { extensions: ['./foreign.ts'] } }],
    ['codex', 'opencode', { exports: { './server': './foreign.js' } }],
    ['synthetic', 'pi', { pi: { extensions: ['./foreign.ts'] } }],
    ['synthetic', 'opencode', { exports: { './server': './foreign.js' } }],
  ] as const)('rejects %s from claiming %s package metadata', (adapterName, declaredOwner, fields) => {
    const adapter: HarnessAdapter = {
      name: adapterName,
      support: stubSupport,
      emit: () => ({
        files: [],
        limitations: [],
        emittedCapabilities: [],
        packageContribution: { owner: declaredOwner, ...fields },
      }),
    }

    try {
      validateGeneration(freshFixture(), [adapter])
      expect.unreachable('foreign package contribution should have been rejected')
    } catch (error) {
      expect((error as { diagnostic?: unknown }).diagnostic).toMatchObject({
        code: 'ADAPTER_PACKAGE_CONTRIBUTION_OWNER_INVALID',
        plugin: 'kitchen-sink',
        target: adapterName,
        source: 'moe-mint.yaml',
        field: `adapters.${adapterName}.packageContribution.owner`,
        message: expect.stringContaining(`declared owner "${declaredOwner}"`),
      })
    }
  })

  it.each([
    [null, 'null'],
    [[], 'an array'],
    ['metadata', 'a scalar'],
    [{}, 'a missing owner'],
    [{ owner: 1 }, 'a non-string owner'],
  ] as const)('rejects %s package contribution with a stable owner diagnostic', (contribution, _description) => {
    const adapter: HarnessAdapter = {
      name: 'opencode',
      support: stubSupport,
      emit: () => ({
        files: [],
        limitations: [],
        emittedCapabilities: [],
        packageContribution: contribution as never,
      }),
    }

    try {
      validateGeneration(freshFixture(), [adapter])
      expect.unreachable('malformed package contribution should have been rejected')
    } catch (error) {
      expect((error as { diagnostic?: unknown }).diagnostic).toMatchObject({
        code: 'ADAPTER_PACKAGE_CONTRIBUTION_OWNER_INVALID',
        plugin: 'kitchen-sink',
        target: 'opencode',
        source: 'moe-mint.yaml',
        field: 'adapters.opencode.packageContribution.owner',
      })
    }
  })
})
