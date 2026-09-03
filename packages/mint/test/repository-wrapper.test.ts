import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const MINT_WRAPPER = join(REPOSITORY_ROOT, 'scripts/mint-plugins.mjs')
const sandboxes: string[] = []

function sandbox(): string {
  const root = mkdtempSync(join(tmpdir(), 'moe-mint-wrapper-'))
  sandboxes.push(root)
  return root
}

function write(root: string, relative: string, content: string): void {
  const target = join(root, relative)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, content)
}

function wrapperFixture(): string {
  const root = sandbox()
  mkdirSync(join(root, 'scripts'), { recursive: true })
  copyFileSync(MINT_WRAPPER, join(root, 'scripts/mint-plugins.mjs'))
  write(root, 'package.json', '{"type":"module"}\n')
  write(
    root,
    'bin/lib/plugin-registry.mjs',
    [
      'export const REPOSITORY_URL = "https://example.invalid/moe";',
      'export const PLUGINS = [{',
      '  name: "fixture", pkg: "fixture", config: "mint/fixture.yaml",',
      '  distribution: "local", harnesses: [],',
      '}];',
      'export function excludedHarnesses() { return []; }',
      'export function harnessRegistryProblems() { return []; }',
    ].join('\n'),
  )
  write(root, 'packages/mint/dist/adapters/index.js', 'export const adapters = [];\n')
  write(root, 'packages/mint/dist/config.js', 'export const ADAPTER_NAMES = [];\n')
  write(root, 'packages/mint/dist/cli.js', 'process.stdout.write("generated fixture\\n");\n')
  write(
    root,
    'packages/fixture/mint/fixture.yaml',
    [
      'name: fixture',
      'version: 1.0.0',
      'description: wrapper fixture',
      'repository: https://example.invalid/moe',
      'homepage: https://example.invalid/moe',
      'imported_works:',
      '  - fixture-work',
      'bootstrap: none',
    ].join('\n'),
  )
  write(root, 'packages/fixture/skills/demo/SKILL.md', '---\nname: demo\ndescription: Demo\n---\n')
  write(
    root,
    'NOTICE',
    [
      '## Imported works',
      '',
      '| Work | Revision | License | Copyright |',
      '|---|---|---|---|',
      '| `fixture-work` | pinned | Public domain | Fixture authors |',
    ].join('\n'),
  )
  write(
    root,
    '.claude-plugin/marketplace.json',
    JSON.stringify({ plugins: [{ name: 'fixture', source: './plugins/fixture' }] }),
  )
  return root
}

afterEach(() => {
  for (const root of sandboxes.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('repository mint staging wrapper', () => {
  it('rejects a source symlink before following it outside the repository', () => {
    const root = wrapperFixture()
    const outside = sandbox()
    const secret = join(outside, 'secret.txt')
    writeFileSync(secret, 'outside bytes\n')
    const link = join(root, 'packages/fixture/skills/demo/leak.txt')
    symlinkSync(secret, link)

    const result = spawnSync(process.execPath, [join(root, 'scripts/mint-plugins.mjs')], {
      cwd: root,
      encoding: 'utf8',
    })

    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(/symbolic link/i)
    expect(result.stderr).toContain('packages/fixture/skills/demo/leak.txt')
    expect(existsSync(join(root, 'plugins/fixture/skills/demo/leak.txt'))).toBe(false)
    expect(readFileSync(secret, 'utf8')).toBe('outside bytes\n')
  })
})
