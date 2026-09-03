import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { renderLicensePayload, writeLicensePayload } from '../src/artifact/license-payload.js'

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url))
const workspaces: string[] = []

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

describe('artifact legal payload', () => {
  it('emits reviewed BSD and ISC grants after MIT and Apache in fixed family order', async () => {
    const payload = await renderLicensePayload({
      repoRoot,
      pluginId: 'glass',
      license: 'MIT AND Apache-2.0',
      importedWorks: ['fast-uri', 'zod-to-json-schema'],
    })
    const positions = ['MIT License', 'Apache License', 'Redistribution and use', 'ISC License'].map((marker) => payload.license.indexOf(marker))
    expect(positions).toEqual([...positions].sort((left, right) => left - right))
    expect(payload.license).not.toContain('THIRD_PARTY_NOTICES')
  })

  it('renders deduplicated MIT then Apache terms and raw-UTF-8-sorted imported rows', async () => {
    const payload = await renderLicensePayload({
      repoRoot,
      pluginId: 'mixed',
      license: 'MIT AND Apache-2.0',
      importedWorks: ['greenfield', 'double-shot-latte', 'double-shot-latte'],
    })

    expect(payload.license.startsWith('MIT License\n')).toBe(true)
    expect(payload.license.indexOf('MIT License')).toBeLessThan(payload.license.indexOf('Apache License'))
    expect(payload.license.match(/Permission is hereby granted/g)).toHaveLength(1)
    expect(payload.license).toMatch(/limitations under the License\.\n$/)
    expect(payload.notice).toBe([
      'Moe',
      'Copyright 2026 Zak Keown',
      '',
      'THIRD-PARTY ATTRIBUTION',
      '',
      '## Imported works',
      '',
      '| Project | Revision | License | Copyright notice |',
      '|---|---:|---|---|',
      '| `double-shot-latte` | `dfe7567` | MIT | Copyright (c) 2024 Anthropic |',
      '| `greenfield` | `6e6d4b4` | Apache-2.0 | Prime Radiant, Inc. |',
      '',
    ].join('\n'))
  })

  it('writes LICENSE and NOTICE for a package with no imported works', async () => {
    const artifactRoot = await mkdtemp(join(tmpdir(), 'moe-legal-'))
    workspaces.push(artifactRoot)

    await writeLicensePayload({ repoRoot, artifactRoot, pluginId: 'original', license: 'Apache-2.0', importedWorks: [] })

    expect(await readFile(join(artifactRoot, 'LICENSE'), 'utf8')).toContain('Apache License')
    expect(await readFile(join(artifactRoot, 'NOTICE'), 'utf8')).toBe([
      'Moe',
      'Copyright 2026 Zak Keown',
      '',
      'THIRD-PARTY ATTRIBUTION',
      '',
      '## Imported works',
      '',
      'No imported works are included in this artifact.',
      '',
    ].join('\n'))
  })

  it('rejects missing, ungranted, and unsupported imported-work license rows before writing', async () => {
    await expect(renderLicensePayload({ repoRoot, pluginId: 'missing', license: 'MIT', importedWorks: ['not-in-notice'] }))
      .rejects.toMatchObject({ diagnostic: { code: 'ARTIFACT_NOTICE_WORK_MISSING' } })
    await expect(renderLicensePayload({ repoRoot, pluginId: 'ungranted', license: 'MIT', importedWorks: ['superpowers-evals'] }))
      .rejects.toMatchObject({ diagnostic: { code: 'ARTIFACT_LICENSE_GRANT_MISSING' } })
    await expect(renderLicensePayload({ repoRoot, pluginId: 'unsupported', license: 'BSD-3-Clause', importedWorks: [] }))
      .rejects.toMatchObject({ diagnostic: { code: 'ARTIFACT_LICENSE_UNSUPPORTED' } })
  })
})
