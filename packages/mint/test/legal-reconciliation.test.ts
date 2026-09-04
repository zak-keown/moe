import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseNotice, readBundledLicenseRecords, reconcileLegalClosure } from '../src/artifact/legal.js'

const noticeText = `## Imported works

| Project | Revision | License | Copyright notice |
|---|---:|---|---|
| \`pkg\` | \`1.2.3\` | MIT | Copyright Pkg |
| \`source\` | \`abc1234\` | Apache-2.0 | Copyright Source |
`

const base = () => ({
  bundledPackages: [{ name: 'pkg', version: '1.2.3', package_manifest: 'node_modules/pkg/package.json', inputs: ['node_modules/pkg/index.js'], outputs: ['dist/index.js'] }],
  stagedImports: [{ work: 'source', artifactPath: 'skills/source/SKILL.md', sourceKind: 'component' as const }],
  importedWorks: [{ name: 'pkg', artifactRoots: [] }, { name: 'source', artifactRoots: ['skills/source'] }],
  notice: parseNotice(noticeText),
  artifactLicenses: [
    { path: 'LICENSE' as const, bytes: Buffer.from('rendered license') },
    { path: 'NOTICE' as const, bytes: Buffer.from('rendered notice') },
  ],
  bundledLicenses: [{ work: 'pkg', license: Buffer.from('Copyright Pkg\nPermission is hereby granted, free of charge\nTHE SOFTWARE IS PROVIDED "AS IS"'), declaredLicense: 'MIT' }],
  expectedLegalPayload: { LICENSE: Buffer.from('rendered license'), NOTICE: Buffer.from('rendered notice') },
  artifactPaths: new Set(['dist/index.js', 'skills/source/SKILL.md']),
})

describe('legal closure reconciliation', () => {
  it('accepts exact bundle identity, staged ownership, NOTICE, and observed license bytes', () => {
    expect(reconcileLegalClosure(base())).toEqual([])
  })

  it.each([
    ['bundle missing NOTICE', (input: ReturnType<typeof base>) => ({ ...input, notice: parseNotice('## Imported works\n') }), 'LEGAL_NOTICE_MISSING'],
    ['bundle missing imported work', (input: ReturnType<typeof base>) => ({ ...input, importedWorks: input.importedWorks.filter((work) => work.name !== 'pkg') }), 'LEGAL_IMPORT_MISSING'],
    ['bundle output absent', (input: ReturnType<typeof base>) => ({ ...input, artifactPaths: new Set(['skills/source/SKILL.md']) }), 'LEGAL_BUNDLE_OUTPUT_MISSING'],
    ['npm version conflict', (input: ReturnType<typeof base>) => ({ ...input, bundledPackages: [{ ...input.bundledPackages[0]!, version: '9.0.0' }], importedWorks: [] }), 'LEGAL_REVISION_MISMATCH'],
    ['bundle license missing', (input: ReturnType<typeof base>) => ({ ...input, bundledLicenses: [], importedWorks: [] }), 'LEGAL_LICENSE_MISSING'],
    ['license family conflict', (input: ReturnType<typeof base>) => ({ ...input, bundledLicenses: [{ ...input.bundledLicenses[0]!, declaredLicense: 'Apache-2.0' }] }), 'LEGAL_LICENSE_MISMATCH'],
    ['license bytes conflict', (input: ReturnType<typeof base>) => ({ ...input, bundledLicenses: [{ ...input.bundledLicenses[0]!, license: Buffer.from('wrong family') }] }), 'LEGAL_LICENSE_CONTENT_MISMATCH'],
    ['staged license drift', (input: ReturnType<typeof base>) => ({ ...input, artifactLicenses: input.artifactLicenses.map((row) => row.path === 'LICENSE' ? { ...row, bytes: Buffer.from('changed') } : row) }), 'LEGAL_PAYLOAD_DRIFT'],
    ['declared work unrepresented', (input: ReturnType<typeof base>) => ({ ...input, importedWorks: [...input.importedWorks, { name: 'ghost', artifactRoots: [] }] }), 'LEGAL_IMPORT_UNREPRESENTED'],
  ] as const)('reports %s deterministically', (_name, mutate, code) => {
    expect(reconcileLegalClosure(mutate(base()))).toContainEqual(expect.objectContaining({ code }))
  })

  it('rejects duplicate NOTICE identities', () => {
    expect(() => parseNotice(`${noticeText}| \`pkg\` | \`1.2.3\` | MIT | Duplicate |\n`)).toThrow(expect.objectContaining({ diagnostic: expect.objectContaining({ code: 'LEGAL_NOTICE_DUPLICATE' }) }))
  })

  it('recognizes exact standard ISC grant and copyright evidence', () => {
    const input = base()
    const notice = parseNotice(noticeText.replace('MIT | Copyright Pkg', 'ISC | Copyright Pkg'))
    const bundledLicenses = [{
      work: 'pkg',
      declaredLicense: 'ISC',
      license: Buffer.from('Copyright Pkg\n\nPermission to use, copy, modify, and/or distribute this software for any\npurpose with or without fee is hereby granted.'),
    }]
    expect(reconcileLegalClosure({ ...input, notice, bundledLicenses })).toEqual([])
  })

  it('rejects ambiguous installed LICENSE candidates instead of trusting filesystem order', async () => {
    const root = await mkdtemp(join(tmpdir(), 'moe-legal-candidates-'))
    const directory = join(root, 'node_modules/pkg')
    await mkdir(directory, { recursive: true })
    await Promise.all([
      writeFile(join(directory, 'package.json'), JSON.stringify({ name: 'pkg', version: '1.2.3', license: 'MIT' })),
      writeFile(join(directory, 'LICENSE'), 'one'),
      writeFile(join(directory, 'LICENSE.md'), 'two'),
    ])
    await expect(readBundledLicenseRecords(root, [{
      name: 'pkg', version: '1.2.3', package_manifest: 'node_modules/pkg/package.json', inputs: [], outputs: ['dist/index.js'],
    }])).rejects.toMatchObject({ diagnostic: { code: 'LEGAL_PACKAGE_LICENSE_AMBIGUOUS' } })
  })
})
