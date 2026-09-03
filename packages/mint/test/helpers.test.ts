import { describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadConfig } from '../src/config.js'
import { withV1Policy } from './helpers.js'

describe('withV1Policy', () => {
  it('mirrors quoted block-form harness exclusions into omitted target intents', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mint-v1-policy-'))
    writeFileSync(join(dir, 'moe-mint.yaml'), withV1Policy([
      'name: quoted-excludes',
      'version: 1.0.0',
      'description: quoted block exclusion fixture',
      'harnesses:',
      '  exclude:',
      '    - "claude-code"',
      "    - 'opencode'",
    ].join('\n')))

    const config = loadConfig(dir)
    expect(config.targets['claude-code'].intent).toBe('omit')
    expect(config.targets.opencode.intent).toBe('omit')
    expect(config.targets.codex.intent).toBe('preview')
  })
})
