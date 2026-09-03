import { execFile as execFileCallback } from 'node:child_process'
import { cp, mkdir, mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const execFile = promisify(execFileCallback)
const repositoryRoot = fileURLToPath(new URL('../../..', import.meta.url))
const provenance = join(repositoryRoot, 'scripts', 'check-provenance.mjs')
const caseFoldingFixture = 'packages/mint/test/fixtures/casefold/CaseFolding-16.0.0.txt'
const workspaces: string[] = []

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map((workspace) => rm(workspace, { recursive: true, force: true })))
})

async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'moe-provenance-'))
  workspaces.push(root)
  await mkdir(join(root, 'packages', 'mint', 'test', 'fixtures'), { recursive: true })
  await Promise.all([
    cp(join(repositoryRoot, 'NOTICE'), join(root, 'NOTICE')),
    cp(join(repositoryRoot, 'LICENSE-BSD-3-CLAUSE'), join(root, 'LICENSE-BSD-3-CLAUSE')),
    cp(join(repositoryRoot, 'LICENSE-ISC'), join(root, 'LICENSE-ISC')),
    cp(join(repositoryRoot, 'plugins'), join(root, 'plugins'), { recursive: true }),
    cp(join(repositoryRoot, 'packages', 'mint', 'test', 'fixtures', 'casefold'), join(root, 'packages', 'mint', 'test', 'fixtures', 'casefold'), { recursive: true }),
  ])
  return root
}

async function expectProvenanceFailure(root: string, message: string): Promise<void> {
  await expect(execFile(process.execPath, [provenance, root])).rejects.toMatchObject({
    stderr: expect.stringContaining(message),
  })
}

describe('Unicode CaseFolding provenance', () => {
  it('requires the Unicode imported-work row', async () => {
    const root = await fixture()
    const notice = await readFile(join(root, 'NOTICE'), 'utf8')
    await writeFile(join(root, 'NOTICE'), notice.replace(/^.*Unicode Character Database CaseFolding.*\n/m, ''))

    await expectProvenanceFailure(root, 'NOTICE is missing required Unicode CaseFolding imported-work row')
  })

  it.each([
    ['altered', (notice: string) => notice.replace('IN NO EVENT SHALL THE COPYRIGHT HOLDER', 'IN NO EVENT SHALL COPYRIGHT HOLDER')],
    ['truncated', (notice: string) => notice.replace(/\nExcept as contained in this notice[\s\S]*?(?=\n## Unresolved)/, '')],
  ])('rejects Unicode License V3 payloads that are %s', async (_kind, mutate) => {
    const root = await fixture()
    const notice = await readFile(join(root, 'NOTICE'), 'utf8')
    await writeFile(join(root, 'NOTICE'), mutate(notice))

    await expectProvenanceFailure(root, 'NOTICE Unicode License V3 payload does not match the pinned canonical digest')
  })

  // @bubstack/moe-mint is a build tool, not a generated plugin, so no mint
  // manifest owns this data. A future plugin redistribution needs its own
  // imported_works entry in addition to this package-level source check.
  it('requires the build tool’s independent pinned CaseFolding fixture', async () => {
    const root = await fixture()
    const source = join(root, caseFoldingFixture)
    await writeFile(source, `${await readFile(source, 'utf8')}# altered\n`)

    await expectProvenanceFailure(root, 'CaseFolding fixture does not match the pinned canonical digest')
  })
})

describe('canonical bundled-license provenance', () => {
  it.each([
    ['LICENSE-BSD-3-CLAUSE', 'deleted', async (path: string) => unlink(path)],
    ['LICENSE-BSD-3-CLAUSE', 'truncated', async (path: string) => writeFile(path, (await readFile(path)).subarray(0, 32))],
    ['LICENSE-BSD-3-CLAUSE', 'mutated', async (path: string) => writeFile(path, `${await readFile(path, 'utf8')}altered\n`)],
    ['LICENSE-ISC', 'deleted', async (path: string) => unlink(path)],
    ['LICENSE-ISC', 'truncated', async (path: string) => writeFile(path, (await readFile(path)).subarray(0, 32))],
    ['LICENSE-ISC', 'mutated', async (path: string) => writeFile(path, `${await readFile(path, 'utf8')}altered\n`)],
  ])('rejects a %s template when %s', async (file, _kind, mutate) => {
    const root = await fixture()
    const path = join(root, file)
    await mutate(path)

    await expectProvenanceFailure(root, file)
  })
})
