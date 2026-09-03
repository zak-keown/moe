import { cpSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { opencode } from '../src/adapters/opencode.js'
import { pi } from '../src/adapters/pi.js'
import type { HarnessAdapter } from '../src/adapters/types.js'
import { validateGeneration } from '../src/generate.js'

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
  })

  it('rejects package.json from every adapter before file merging', () => {
    const adapter: HarnessAdapter = {
      name: 'codex',
      emit: () => ({
        files: [{ path: 'package.json', content: '{"name":"replacement"}\n' }],
        limitations: [],
        emittedCapabilities: [],
      }),
    }

    expect(() => validateGeneration(freshFixture(), [adapter])).toThrowError(
      /adapter "codex" must not emit package\.json; return packageContribution instead/,
    )
  })
})
