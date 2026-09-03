import { spawnSync } from 'node:child_process'
import { lstat, mkdir, mkdtemp, open, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { describe, expect, test } from 'vitest'

const transactionModule = pathToFileURL(
  resolve(import.meta.dirname, '../../../scripts/lib/mint-generation-transaction.mjs'),
).href
const repoRoot = resolve(import.meta.dirname, '../../..')
const recoverScript = resolve(repoRoot, 'scripts/mint-recover.mjs')

type PathState = 'missing' | 'file' | 'directory' | 'symlink' | 'other'

interface FakeSwapFs {
  readonly operations: string[]
  readonly states: Map<string, PathState>
  readonly bytes: Map<string, Uint8Array>
  readonly identities: Map<string, 'old' | 'new' | 'journal'>
  syncPreparedOutput(target: (ReturnType<typeof journal>)['targets'][number]): Promise<void>
  writeDurableFile(path: string, bytes: Uint8Array): Promise<void>
  readFile(path: string): Promise<Uint8Array>
  pathState(path: string): Promise<PathState>
  rename(from: string, to: string): Promise<void>
  remove(path: string): Promise<void>
  fsyncDirectory(path: string): Promise<void>
}

function journal() {
  return {
    schema: 1,
    transactionId: 'abc123',
    targets: [
      { kind: 'directory', current: 'plugins', next: 'plugins.next-abc123', backup: 'plugins.backup-abc123' },
      {
        kind: 'file',
        current: '.claude-plugin/marketplace.json',
        next: '.claude-plugin/marketplace.next-abc123.json',
        backup: '.claude-plugin/marketplace.backup-abc123.json',
      },
      {
        kind: 'file',
        current: 'docs/moe/generated/plugin-catalog.md',
        next: 'docs/moe/generated/plugin-catalog.next-abc123.md',
        backup: 'docs/moe/generated/plugin-catalog.backup-abc123.md',
      },
    ],
  } as const
}

function fakeSwapFs(): FakeSwapFs {
  const states = new Map<string, PathState>([
    ['.', 'directory'],
    ['.claude-plugin', 'directory'],
    ['docs', 'directory'],
    ['docs/moe', 'directory'],
    ['docs/moe/generated', 'directory'],
    ['plugins', 'directory'],
    ['plugins.next-abc123', 'directory'],
    ['.claude-plugin/marketplace.json', 'file'],
    ['.claude-plugin/marketplace.next-abc123.json', 'file'],
    ['docs/moe/generated/plugin-catalog.md', 'file'],
    ['docs/moe/generated/plugin-catalog.next-abc123.md', 'file'],
  ])
  const bytes = new Map<string, Uint8Array>()
  const identities = new Map<string, 'old' | 'new' | 'journal'>([
    ['plugins', 'old'],
    ['plugins.next-abc123', 'new'],
    ['.claude-plugin/marketplace.json', 'old'],
    ['.claude-plugin/marketplace.next-abc123.json', 'new'],
    ['docs/moe/generated/plugin-catalog.md', 'old'],
    ['docs/moe/generated/plugin-catalog.next-abc123.md', 'new'],
  ])
  const operations: string[] = []
  return {
    operations,
    states,
    bytes,
    identities,
    async syncPreparedOutput(target) {
      operations.push(`sync-prepared:${target.next}`)
    },
    async writeDurableFile(path, content) {
      operations.push(`write-temp:${path}`)
      operations.push(`fsync-file:${path}`)
      operations.push(`rename-temp:${path}`)
      states.set(path, 'file')
      bytes.set(path, content)
      identities.set(path, 'journal')
      operations.push(`fsync:${parent(path)}`)
    },
    async readFile(path) {
      const content = bytes.get(path)
      if (content === undefined) throw new Error(`missing fixture bytes for ${path}`)
      return content
    },
    async pathState(path) {
      return states.get(path) ?? 'missing'
    },
    async rename(from, to) {
      operations.push(`rename:${from}->${to}`)
      const state = states.get(from)
      if (state === undefined) throw new Error(`missing ${from}`)
      states.delete(from)
      states.set(to, state)
      const identity = identities.get(from)
      identities.delete(from)
      if (identity !== undefined) identities.set(to, identity)
    },
    async remove(path) {
      operations.push(`remove:${path}`)
      states.delete(path)
      bytes.delete(path)
      identities.delete(path)
    },
    async fsyncDirectory(path) {
      operations.push(`fsync:${path}`)
    },
  }
}

function restartedSwapFs(previous: FakeSwapFs): FakeSwapFs {
  const restarted = fakeSwapFs()
  restarted.states.clear()
  restarted.bytes.clear()
  restarted.identities.clear()
  for (const [key, value] of previous.states) restarted.states.set(key, value)
  for (const [key, value] of previous.bytes) restarted.bytes.set(key, value.slice())
  for (const [key, value] of previous.identities) restarted.identities.set(key, value)
  return restarted
}

type TransactionState = 'unstarted' | 'backed-up' | 'committed' | 'clean'

function recoveryFs(
  states: readonly TransactionState[],
  rawJournal = JSON.stringify(journal()),
  cleanIdentity: 'old' | 'new' = 'old',
) {
  const files = new Map<string, PathState>([
    ['.', 'directory'],
    ['.claude-plugin', 'directory'],
    ['docs', 'directory'],
    ['docs/moe', 'directory'],
    ['docs/moe/generated', 'directory'],
    ['.moe-mint-generation-abc123.json', 'file'],
  ])
  const journalBytes = new Map<string, Uint8Array>([
    ['.moe-mint-generation-abc123.json', new TextEncoder().encode(rawJournal)],
  ])
  const identities = new Map<string, 'old' | 'new' | 'journal'>([
    ['.moe-mint-generation-abc123.json', 'journal'],
  ])
  for (const [index, target] of journal().targets.entries()) {
    const state = states[index]
    if (state === undefined) throw new Error('transaction state missing')
    if (state === 'unstarted' || state === 'committed' || state === 'clean') {
      files.set(target.current, target.kind)
      identities.set(target.current, state === 'committed' ? 'new' : state === 'clean' ? cleanIdentity : 'old')
    }
    if (state === 'unstarted' || state === 'backed-up') {
      files.set(target.next, target.kind)
      identities.set(target.next, 'new')
    }
    if (state === 'backed-up' || state === 'committed') {
      files.set(target.backup, target.kind)
      identities.set(target.backup, 'old')
    }
  }
  const operations: string[] = []
  return {
    operations,
    files,
    journalBytes,
    identities,
    async writeDurableFile(filePath: string, bytes: Uint8Array) {
      files.set(filePath, 'file')
      journalBytes.set(filePath, bytes)
      identities.set(filePath, 'journal')
    },
    async readFile(filePath: string) {
      operations.push(`read:${filePath}`)
      const value = journalBytes.get(filePath)
      if (value === undefined) throw new Error(`missing ${filePath}`)
      return value
    },
    async pathState(filePath: string): Promise<PathState> {
      return files.get(filePath) ?? 'missing'
    },
    async rename(from: string, to: string) {
      operations.push(`rename:${from}->${to}`)
      const state = files.get(from)
      if (state === undefined) throw new Error(`missing ${from}`)
      files.delete(from)
      files.set(to, state)
      const identity = identities.get(from)
      identities.delete(from)
      if (identity !== undefined) identities.set(to, identity)
    },
    async remove(filePath: string) {
      operations.push(`remove:${filePath}`)
      files.delete(filePath)
      journalBytes.delete(filePath)
      identities.delete(filePath)
    },
    async fsyncDirectory(directory: string) {
      operations.push(`fsync:${directory}`)
    },
  }
}

type RecoveryFs = ReturnType<typeof recoveryFs>

function restartedRecoveryFs(previous: RecoveryFs): RecoveryFs {
  const restarted = recoveryFs(['unstarted', 'unstarted', 'unstarted'])
  restarted.files.clear()
  restarted.journalBytes.clear()
  restarted.identities.clear()
  for (const [key, value] of previous.files) restarted.files.set(key, value)
  for (const [key, value] of previous.journalBytes) restarted.journalBytes.set(key, value.slice())
  for (const [key, value] of previous.identities) restarted.identities.set(key, value)
  return restarted
}

function failAfterRecoveryEvent(fs: RecoveryFs, after: number): RecoveryFs {
  let event = 0
  const fault = () => {
    event += 1
    if (event === after) throw new Error(`injected recovery durability failure ${after}`)
  }
  return {
    ...fs,
    async writeDurableFile(path: string, bytes: Uint8Array) {
      await fs.writeDurableFile(path, bytes)
      fault()
    },
    async rename(from: string, to: string) {
      await fs.rename(from, to)
      fault()
    },
    async remove(path: string) {
      await fs.remove(path)
      fault()
    },
    async fsyncDirectory(path: string) {
      await fs.fsyncDirectory(path)
      fault()
    },
  }
}

function failAfterSwapEvent(fs: FakeSwapFs, after: number): FakeSwapFs {
  let event = 0
  const fault = () => {
    event += 1
    if (event === after) throw new Error(`injected failure after swap event ${after}`)
  }
  return {
    operations: fs.operations,
    states: fs.states,
    bytes: fs.bytes,
    identities: fs.identities,
    syncPreparedOutput: fs.syncPreparedOutput.bind(fs),
    async writeDurableFile(filePath, bytes) {
      await fs.writeDurableFile(filePath, bytes)
      fault()
    },
    readFile: fs.readFile.bind(fs),
    pathState: fs.pathState.bind(fs),
    async rename(from, to) {
      await fs.rename(from, to)
      fault()
    },
    async remove(filePath) {
      await fs.remove(filePath)
      fault()
    },
    async fsyncDirectory(directory) {
      await fs.fsyncDirectory(directory)
      fault()
    },
  }
}

function crashAfterSwapEvent(fs: FakeSwapFs, after: number): FakeSwapFs {
  const crashing = failAfterSwapEvent(fs, after)
  const wrap = <T>(method: () => Promise<T>) => async () => {
    try {
      return await method()
    } catch (error) {
      if (error instanceof Error && error.message.includes('injected failure')) {
        Object.assign(error, { code: 'GENERATION_TRANSACTION_SIMULATED_CRASH' })
      }
      throw error
    }
  }
  return {
    ...crashing,
    syncPreparedOutput: crashing.syncPreparedOutput.bind(crashing),
    writeDurableFile: (path, bytes) => wrap(() => crashing.writeDurableFile(path, bytes))(),
    rename: (from, to) => wrap(() => crashing.rename(from, to))(),
    remove: (path) => wrap(() => crashing.remove(path))(),
    fsyncDirectory: (path) => wrap(() => crashing.fsyncDirectory(path))(),
  }
}

function parent(path: string): string {
  const slash = path.lastIndexOf('/')
  return slash === -1 ? '.' : path.slice(0, slash)
}

describe('generation transaction', () => {
  test('durably journals then swaps every output before cleanup', async () => {
    // Break caught: removing a directory sync or reordering a swap can make a
    // crash unrecoverable even though the final tree looked correct.
    const { replaceGeneratedOutputs } = await import(transactionModule)
    const fs = fakeSwapFs()

    await replaceGeneratedOutputs({ journalPath: '.moe-mint-generation-abc123.json', journal: journal() }, fs)

    expect(fs.operations).toEqual([
      'sync-prepared:plugins.next-abc123',
      'sync-prepared:.claude-plugin/marketplace.next-abc123.json',
      'sync-prepared:docs/moe/generated/plugin-catalog.next-abc123.md',
      'write-temp:.moe-mint-generation-abc123.json',
      'fsync-file:.moe-mint-generation-abc123.json',
      'rename-temp:.moe-mint-generation-abc123.json',
      'fsync:.',
      'rename:plugins->plugins.backup-abc123',
      'fsync:.',
      'rename:plugins.next-abc123->plugins',
      'fsync:.',
      'rename:.claude-plugin/marketplace.json->.claude-plugin/marketplace.backup-abc123.json',
      'fsync:.claude-plugin',
      'rename:.claude-plugin/marketplace.next-abc123.json->.claude-plugin/marketplace.json',
      'fsync:.claude-plugin',
      'rename:docs/moe/generated/plugin-catalog.md->docs/moe/generated/plugin-catalog.backup-abc123.md',
      'fsync:docs/moe/generated',
      'rename:docs/moe/generated/plugin-catalog.next-abc123.md->docs/moe/generated/plugin-catalog.md',
      'fsync:docs/moe/generated',
      'remove:plugins.backup-abc123',
      'fsync:.',
      'remove:.claude-plugin/marketplace.backup-abc123.json',
      'fsync:.claude-plugin',
      'remove:docs/moe/generated/plugin-catalog.backup-abc123.md',
      'fsync:docs/moe/generated',
      'remove:.moe-mint-generation-abc123.json',
      'fsync:.',
    ])
  })

  test('leaves every canonical path and prepared sibling untouched when prepared sync fails', async () => {
    // Break caught: writing the recovery journal before all prepared bytes are
    // durable can authorize a swap whose new generation cannot survive a crash.
    const { replaceGeneratedOutputs } = await import(transactionModule)
    const fs = fakeSwapFs()
    fs.syncPreparedOutput = async (target) => {
      fs.operations.push(`sync-prepared:${target.next}`)
      if (target.next.includes('marketplace')) throw new Error('injected prepared sync failure')
    }

    await expect(
      replaceGeneratedOutputs(
        { journalPath: '.moe-mint-generation-abc123.json', journal: journal() },
        fs,
      ),
    ).rejects.toMatchObject({
      code: 'GENERATION_TRANSACTION_PREPARED_OUTPUT_SYNC_FAILED',
      paths: ['.claude-plugin/marketplace.next-abc123.json'],
      cause: expect.objectContaining({ message: 'injected prepared sync failure' }),
    })

    expect(fs.operations).toEqual([
      'sync-prepared:plugins.next-abc123',
      'sync-prepared:.claude-plugin/marketplace.next-abc123.json',
    ])
    await expect(fs.pathState('.moe-mint-generation-abc123.json')).resolves.toBe('missing')
    for (const target of journal().targets) {
      await expect(fs.pathState(target.current)).resolves.toBe(target.kind)
      await expect(fs.pathState(target.next)).resolves.toBe(target.kind)
      await expect(fs.pathState(target.backup)).resolves.toBe('missing')
      expect(fs.identities.get(target.current)).toBe('old')
      expect(fs.identities.get(target.next)).toBe('new')
    }
  })

  test('syncs every nested prepared file and directory in deterministic postorder', async () => {
    // Break caught: syncing only the staging root leaves descendant data and
    // directory entries outside the durability boundary before the swap.
    const { syncPreparedOutput } = await import(transactionModule)
    const directory = await mkdtemp(join(tmpdir(), 'moe-prepared-sync-'))
    const staging = join(directory, 'plugins.next-abc123')
    const projectionParent = join(directory, 'projections')
    const projection = join(projectionParent, 'catalog.next-abc123.md')
    const synced: string[] = []
    const io = {
      lstat,
      readdir,
      async open(filePath: string, flags: number) {
        const handle = await open(filePath, flags)
        return {
          stat: () => handle.stat(),
          async sync() {
            synced.push(relative(directory, filePath) || '.')
            await handle.sync()
          },
          close: () => handle.close(),
        }
      },
    }
    try {
      await mkdir(join(staging, 'zeta', 'inner'), { recursive: true })
      await mkdir(projectionParent)
      await writeFile(join(staging, 'alpha.txt'), 'alpha')
      await writeFile(join(staging, 'zeta', 'beta.txt'), 'beta')
      await writeFile(join(staging, 'zeta', 'inner', 'gamma.txt'), 'gamma')
      await writeFile(projection, 'projection')

      await syncPreparedOutput({ kind: 'directory', next: staging }, io)
      await syncPreparedOutput({ kind: 'file', next: projection }, io)

      expect(synced).toEqual([
        'plugins.next-abc123/alpha.txt',
        'plugins.next-abc123/zeta/beta.txt',
        'plugins.next-abc123/zeta/inner/gamma.txt',
        'plugins.next-abc123/zeta/inner',
        'plugins.next-abc123/zeta',
        'plugins.next-abc123',
        '.',
        'projections/catalog.next-abc123.md',
        'projections',
      ])
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  test.each(['symlink', 'non-regular'] as const)(
    'rejects a static %s inside a prepared directory',
    async (entryKind) => {
      // Break caught: traversing symlinks or special files can sync content
      // outside the staged artifact or authorize unstable device/socket bytes.
      const { syncPreparedOutput } = await import(transactionModule)
      const directory = await mkdtemp(join(tmpdir(), 'moe-prepared-unsafe-'))
      const staging = join(directory, 'plugins.next-abc123')
      await mkdir(staging)
      try {
        const entry = join(staging, entryKind === 'symlink' ? 'outside-link' : 'special-fifo')
        if (entryKind === 'symlink') {
          const outside = join(directory, 'outside.txt')
          await writeFile(outside, 'outside')
          await symlink(outside, entry)
        } else {
          const result = spawnSync('mkfifo', [entry], { encoding: 'utf8' })
          expect(result.status, result.stderr).toBe(0)
        }

        await expect(
          syncPreparedOutput({ kind: 'directory', next: staging }),
        ).rejects.toMatchObject({
          code: 'GENERATION_TRANSACTION_UNSAFE_PATH',
          paths: [entry],
        })
      } finally {
        await rm(directory, { recursive: true, force: true })
      }
    },
  )

  test.each([
    ['file', 'directory'],
    ['directory', 'file'],
  ] as const)(
    'rejects a prepared %s target that changed into a %s',
    async (expectedKind, actualKind) => {
      // Break caught: a root kind change after initial validation must not let
      // a directory replace a projection file (or a file replace the tree).
      const { syncPreparedOutput } = await import(transactionModule)
      const directory = await mkdtemp(join(tmpdir(), 'moe-prepared-kind-'))
      const prepared = join(directory, 'prepared')
      try {
        if (actualKind === 'directory') await mkdir(prepared)
        else await writeFile(prepared, 'file')

        await expect(
          syncPreparedOutput({ kind: expectedKind, next: prepared }),
        ).rejects.toMatchObject({
          code: 'GENERATION_TRANSACTION_UNSAFE_PATH',
          paths: [prepared],
        })
      } finally {
        await rm(directory, { recursive: true, force: true })
      }
    },
  )

  test('restores one complete old generation from a mixed interrupted swap', async () => {
    // Break caught: accepting per-target recovery independently would expose a
    // plugin tree from one generation beside registry projections from another.
    const { recoverGeneratedOutputs } = await import(transactionModule)
    const fs = recoveryFs(['committed', 'backed-up', 'unstarted'])

    await expect(recoverGeneratedOutputs({ journalPath: '.moe-mint-generation-abc123.json' }, fs)).resolves.toEqual({ generation: 'old' })

    for (const target of journal().targets) {
      await expect(fs.pathState(target.current)).resolves.toBe(target.kind)
      await expect(fs.pathState(target.next)).resolves.toBe('missing')
      await expect(fs.pathState(target.backup)).resolves.toBe('missing')
    }
    await expect(fs.pathState('.moe-mint-generation-abc123.json')).resolves.toBe('missing')
  })

  test('finishes one complete new generation after every target committed', async () => {
    // Break caught: rolling back after one backup has been removed can discard
    // the only remaining complete old generation.
    const { recoverGeneratedOutputs } = await import(transactionModule)
    const fs = recoveryFs(['committed', 'clean', 'committed'])

    await expect(recoverGeneratedOutputs({ journalPath: '.moe-mint-generation-abc123.json' }, fs)).resolves.toEqual({ generation: 'new' })

    for (const target of journal().targets) {
      await expect(fs.pathState(target.current)).resolves.toBe(target.kind)
      await expect(fs.pathState(target.next)).resolves.toBe('missing')
      await expect(fs.pathState(target.backup)).resolves.toBe('missing')
    }
  })

  test('is idempotent when a completed transaction already removed its journal', async () => {
    // Break caught: treating successful cleanup as an unrecoverable journal
    // loss makes a restart fail after every output has already committed.
    const { recoverGeneratedOutputs } = await import(transactionModule)
    const fs = recoveryFs(['clean', 'clean', 'clean'])
    await fs.remove('.moe-mint-generation-abc123.json')

    await expect(recoverGeneratedOutputs({ journalPath: '.moe-mint-generation-abc123.json' }, fs)).resolves.toEqual({ generation: 'none' })
    expect(fs.operations.filter((operation) => operation.startsWith('rename:'))).toEqual([])
  })

  test.each(Array.from({ length: 21 }, (_value, index) => index + 1))('recovers a coherent generation after durable swap fault %i', async (cut) => {
    // Break caught: a crash after any durable state transition must never leave
    // a plugin tree paired with projections from a different generation.
    const { recoverGeneratedOutputs, replaceGeneratedOutputs } = await import(transactionModule)
    const original = fakeSwapFs()
    const fs = failAfterSwapEvent(original, cut)

    await expect(replaceGeneratedOutputs({ journalPath: '.moe-mint-generation-abc123.json', journal: journal() }, fs)).rejects.toBeInstanceOf(Error)
    await expect(recoverGeneratedOutputs({ journalPath: '.moe-mint-generation-abc123.json' }, original)).resolves.toMatchObject({
      generation: expect.stringMatching(/^(old|new|none)$/),
    })
    for (const target of journal().targets) {
      await expect(original.pathState(target.current)).resolves.toBe(target.kind)
      await expect(original.pathState(target.next)).resolves.toBe('missing')
      await expect(original.pathState(target.backup)).resolves.toBe('missing')
    }
    await expect(original.pathState('.moe-mint-generation-abc123.json')).resolves.toBe('missing')
  })

  test.each(Array.from({ length: 21 }, (_value, index) => index + 1))('recovers one generation after process restart at forward durability cut %i', async (cut) => {
    // Break caught: same-call recovery can hide a state that a new process
    // cannot classify. The restart gets only durable maps, never the wrapper.
    const { recoverGeneratedOutputs, replaceGeneratedOutputs } = await import(transactionModule)
    const beforeCrash = fakeSwapFs()

    await expect(replaceGeneratedOutputs({ journalPath: '.moe-mint-generation-abc123.json', journal: journal() }, crashAfterSwapEvent(beforeCrash, cut))).rejects.toMatchObject({
      code: 'GENERATION_TRANSACTION_SIMULATED_CRASH',
    })
    const restarted = restartedSwapFs(beforeCrash)
    await recoverGeneratedOutputs({ journalPath: '.moe-mint-generation-abc123.json' }, restarted)
    await expect(recoverGeneratedOutputs({ journalPath: '.moe-mint-generation-abc123.json' }, restarted)).resolves.toEqual({ generation: 'none' })
    expect(new Set(journal().targets.map((target) => restarted.identities.get(target.current)))).toHaveLength(1)
  })

  test('does not read or mutate an escaping journal path', async () => {
    // Break caught: reading the journal before containment checks lets a caller
    // point recovery at an unrelated file outside the repository.
    const { recoverGeneratedOutputs } = await import(transactionModule)
    const fs = recoveryFs(['unstarted', 'unstarted', 'unstarted'])

    await expect(recoverGeneratedOutputs({ journalPath: '../outside.json' }, fs)).rejects.toMatchObject({
      code: 'GENERATION_TRANSACTION_INVALID',
    })
    expect(fs.operations).toEqual([])
  })

  test.each([
    ['malformed JSON', '{'],
    ['wrong schema', JSON.stringify({ ...journal(), schema: 2 })],
    ['wrong nonce sibling', JSON.stringify({ ...journal(), targets: [{ ...journal().targets[0], next: 'plugins.next-other' }, ...journal().targets.slice(1)] })],
  ])('fails closed for %s', async (_name, rawJournal) => {
    // Break caught: sanitizing or guessing malformed state can delete an
    // otherwise recoverable tree.
    const { recoverGeneratedOutputs } = await import(transactionModule)
    const fs = recoveryFs(['unstarted', 'unstarted', 'unstarted'], rawJournal)

    await expect(recoverGeneratedOutputs({ journalPath: '.moe-mint-generation-abc123.json' }, fs)).rejects.toMatchObject({
      code: expect.stringContaining('GENERATION_TRANSACTION_'),
    })
    await expect(fs.pathState('.moe-mint-generation-abc123.json')).resolves.toBe('file')
    expect(fs.operations.filter((operation) => operation.startsWith('rename:') || operation.startsWith('remove:'))).toEqual([])
  })

  test('fails closed for a symlinked target parent', async () => {
    // Break caught: following a replaced parent directory turns contained
    // cleanup into deletion in a path the journal never authorized.
    const { recoverGeneratedOutputs } = await import(transactionModule)
    const fs = recoveryFs(['unstarted', 'unstarted', 'unstarted'])
    fs.files.set('.claude-plugin', 'symlink')

    await expect(recoverGeneratedOutputs({ journalPath: '.moe-mint-generation-abc123.json' }, fs)).rejects.toMatchObject({
      code: 'GENERATION_TRANSACTION_UNSAFE_PATH',
    })
    await expect(fs.pathState('.moe-mint-generation-abc123.json')).resolves.toBe('file')
  })

  test.each([
    ['reused path', JSON.stringify({ ...journal(), targets: [{ ...journal().targets[0], backup: 'plugins' }, ...journal().targets.slice(1)] })],
    ['absolute target', JSON.stringify({ ...journal(), targets: [{ ...journal().targets[0], current: '/tmp/plugins' }, ...journal().targets.slice(1)] })],
    ['traversing target', JSON.stringify({ ...journal(), targets: [{ ...journal().targets[0], next: '../plugins.next-abc123' }, ...journal().targets.slice(1)] })],
  ])('does not mutate an invalid %s journal', async (_name, rawJournal) => {
    // Break caught: accepting aliases or an outside path lets a journal reuse
    // one rename destination for unrelated generated output.
    const { recoverGeneratedOutputs } = await import(transactionModule)
    const fs = recoveryFs(['unstarted', 'unstarted', 'unstarted'], rawJournal)

    await expect(recoverGeneratedOutputs({ journalPath: '.moe-mint-generation-abc123.json' }, fs)).rejects.toMatchObject({
      code: 'GENERATION_TRANSACTION_INVALID',
    })
    expect(fs.operations.filter((operation) => operation.startsWith('rename:') || operation.startsWith('remove:'))).toEqual([])
  })

  test('preserves journal and survivors when restoration rename fails', async () => {
    // Break caught: removing the journal after a partial failed restoration
    // loses the only description of how to finish recovery on the next start.
    const { recoverGeneratedOutputs } = await import(transactionModule)
    const fs = recoveryFs(['backed-up', 'unstarted', 'unstarted'])
    fs.rename = async () => {
      throw new Error('injected restore rename failure')
    }

    await expect(recoverGeneratedOutputs({ journalPath: '.moe-mint-generation-abc123.json' }, fs)).rejects.toMatchObject({
      code: 'GENERATION_TRANSACTION_RECOVERY_FAILED',
      paths: expect.arrayContaining(['.moe-mint-generation-abc123.json', 'plugins.backup-abc123']),
      action: expect.any(String),
    })
    await expect(fs.pathState('.moe-mint-generation-abc123.json')).resolves.toBe('file')
    await expect(fs.pathState('plugins.backup-abc123')).resolves.toBe('directory')
    await expect(fs.pathState('plugins.next-abc123')).resolves.toBe('directory')
  })

  test('fails closed for an ambiguous mixed old/new state', async () => {
    // Break caught: treating a missing backup as evidence of success while a
    // different target remains uncommitted would publish a mixed generation.
    const { recoverGeneratedOutputs } = await import(transactionModule)
    const fs = recoveryFs(['clean', 'backed-up', 'unstarted'])

    await expect(recoverGeneratedOutputs({ journalPath: '.moe-mint-generation-abc123.json' }, fs)).rejects.toMatchObject({
      code: 'GENERATION_TRANSACTION_UNRECOVERABLE',
    })
    await expect(fs.pathState('.moe-mint-generation-abc123.json')).resolves.toBe('file')
  })

  test('resumes interrupted all-old cleanup after one sibling was removed', async () => {
    // Break caught: a crash during old cleanup used to classify clean plus
    // unstarted outputs as an unrecoverable mixed generation.
    const { recoverGeneratedOutputs } = await import(transactionModule)
    const fs = recoveryFs(['clean', 'unstarted', 'unstarted'])

    await expect(recoverGeneratedOutputs({ journalPath: '.moe-mint-generation-abc123.json' }, fs)).resolves.toEqual({ generation: 'old' })
    for (const target of journal().targets) {
      await expect(fs.pathState(target.current)).resolves.toBe(target.kind)
      await expect(fs.pathState(target.next)).resolves.toBe('missing')
      await expect(fs.pathState(target.backup)).resolves.toBe('missing')
    }
  })

  test.each(Array.from({ length: 15 }, (_value, index) => index + 1))('restarts all-old recovery after recovery durability cut %i', async (cut) => {
    // Break caught: every restoration rename, cleanup removal, and parent sync
    // is itself crashable; a later process must finish the same old generation.
    const { recoverGeneratedOutputs } = await import(transactionModule)
    const interrupted = recoveryFs(['committed', 'backed-up', 'unstarted'])

    await expect(recoverGeneratedOutputs({ journalPath: '.moe-mint-generation-abc123.json' }, failAfterRecoveryEvent(interrupted, cut))).rejects.toMatchObject({
      code: cut >= 15
        ? 'GENERATION_TRANSACTION_RECOVERY_OLD_INSTALLED_DURABILITY_UNCERTAIN'
        : 'GENERATION_TRANSACTION_RECOVERY_FAILED',
    })
    const restarted = restartedRecoveryFs(interrupted)
    await expect(recoverGeneratedOutputs({ journalPath: '.moe-mint-generation-abc123.json' }, restarted)).resolves.toEqual({ generation: cut >= 14 ? 'none' : 'old' })
    expect(new Set(journal().targets.map((target) => restarted.identities.get(target.current)))).toEqual(new Set(['old']))
    await expect(recoverGeneratedOutputs({ journalPath: '.moe-mint-generation-abc123.json' }, restarted)).resolves.toEqual({ generation: 'none' })
  })

  test.each(Array.from({ length: 6 }, (_value, index) => index + 1))('restarts all-new recovery after cleanup durability cut %i', async (cut) => {
    // Break caught: cleanup after a fully committed generation must never
    // resurrect a backup or mix old projections with the new plugin tree.
    const { recoverGeneratedOutputs } = await import(transactionModule)
    const interrupted = recoveryFs(['committed', 'clean', 'committed'], undefined, 'new')

    await expect(recoverGeneratedOutputs({ journalPath: '.moe-mint-generation-abc123.json' }, failAfterRecoveryEvent(interrupted, cut))).rejects.toMatchObject({
      code: cut >= 6
        ? 'GENERATION_TRANSACTION_RECOVERY_NEW_INSTALLED_DURABILITY_UNCERTAIN'
        : 'GENERATION_TRANSACTION_RECOVERY_FAILED',
    })
    const restarted = restartedRecoveryFs(interrupted)
    await expect(recoverGeneratedOutputs({ journalPath: '.moe-mint-generation-abc123.json' }, restarted)).resolves.toEqual({ generation: cut >= 5 ? 'none' : 'new' })
    expect(new Set(journal().targets.map((target) => restarted.identities.get(target.current)))).toEqual(new Set(['new']))
    await expect(recoverGeneratedOutputs({ journalPath: '.moe-mint-generation-abc123.json' }, restarted)).resolves.toEqual({ generation: 'none' })
  })

  test('reports a removed recovery journal as selected-generation durability uncertainty', async () => {
    // Break caught: the journal unlink has already selected and installed the
    // all-new generation when its parent sync fails; saying recovery failed
    // and asking to preserve that now-gone journal is false.
    const { recoverGeneratedOutputs } = await import(transactionModule)
    const fs = recoveryFs(['committed', 'clean', 'committed'], undefined, 'new')

    await expect(
      recoverGeneratedOutputs(
        { journalPath: '.moe-mint-generation-abc123.json' },
        failAfterRecoveryEvent(fs, 6),
      ),
    ).rejects.toMatchObject({
      code: 'GENERATION_TRANSACTION_RECOVERY_NEW_INSTALLED_DURABILITY_UNCERTAIN',
      paths: journal().targets.map((target) => target.current),
      action: expect.stringContaining('selected generation as installed'),
      cause: expect.objectContaining({ message: 'injected recovery durability failure 6' }),
    })
    await expect(fs.pathState('.moe-mint-generation-abc123.json')).resolves.toBe('missing')
    expect(new Set(journal().targets.map((target) => fs.identities.get(target.current)))).toEqual(new Set(['new']))
  })

  test('rejects a journal symlink before it is read', async () => {
    // Break caught: reading first follows a hostile journal symlink outside the
    // repository before the transaction can apply any containment rule.
    const { recoverGeneratedOutputs } = await import(transactionModule)
    const fs = recoveryFs(['unstarted', 'unstarted', 'unstarted'])
    fs.files.set('.moe-mint-generation-abc123.json', 'symlink')

    await expect(recoverGeneratedOutputs({ journalPath: '.moe-mint-generation-abc123.json' }, fs)).rejects.toMatchObject({
      code: 'GENERATION_TRANSACTION_UNSAFE_PATH',
    })
    expect(fs.operations).toEqual([])
  })

  test('refuses destructive recovery after a trusted parent is substituted', async () => {
    // Break caught: validation without a recheck at the mutation seam lets a
    // parent swap redirect the first restore rename after it was inspected.
    const { recoverGeneratedOutputs } = await import(transactionModule)
    const fs = recoveryFs(['backed-up', 'unstarted', 'unstarted'])
    let captures = 0
    const guardedFs = Object.assign(fs, {
      async captureTrustedBoundary() {
        captures += 1
        return {
          async assert() {
            if (captures === 2) throw new Error('trusted generation parent changed: .claude-plugin')
          },
        }
      },
    })

    await expect(recoverGeneratedOutputs({ journalPath: '.moe-mint-generation-abc123.json' }, guardedFs)).rejects.toMatchObject({
      code: 'GENERATION_TRANSACTION_UNRECOVERABLE',
    })
    expect(fs.operations.filter((operation) => operation.startsWith('rename:') || operation.startsWith('remove:'))).toEqual([])
  })

  test('rejects a parent substituted during validation before it can become the boundary baseline', async () => {
    // Break caught: capturing after multi-await validation accepted a normal
    // replacement as the new baseline, despite state being read from the old tree.
    const { recoverGeneratedOutputs } = await import(transactionModule)
    const fs = recoveryFs(['backed-up', 'unstarted', 'unstarted'])
    let version = 0
    let captureCount = 0
    const originalPathState = fs.pathState
    fs.pathState = async (path: string) => {
      const state = await originalPathState(path)
      if (path === 'plugins') version = 1
      return state
    }
    const guardedFs = Object.assign(fs, {
      async captureTrustedBoundary() {
        captureCount += 1
        const captured = version
        return {
          async assert() {
            if (captureCount === 2 && version !== captured) throw new Error('trusted generation parent changed: plugins')
          },
        }
      },
    })

    await expect(recoverGeneratedOutputs({ journalPath: '.moe-mint-generation-abc123.json' }, guardedFs)).rejects.toMatchObject({
      code: 'GENERATION_TRANSACTION_UNRECOVERABLE',
    })
    expect(fs.operations.filter((operation) => operation.startsWith('rename:') || operation.startsWith('remove:'))).toEqual([])
  })

  test('rejects invalid UTF-8 journal bytes before parsing', async () => {
    // Break caught: replacement decoding can silently turn invalid durable
    // bytes into a different journal instead of fail-closing recovery.
    const { recoverGeneratedOutputs } = await import(transactionModule)
    const fs = recoveryFs(['unstarted', 'unstarted', 'unstarted'], '')
    fs.readFile = async () => new Uint8Array([0xc3, 0x28])

    await expect(recoverGeneratedOutputs({ journalPath: '.moe-mint-generation-abc123.json' }, fs)).rejects.toMatchObject({
      code: 'GENERATION_TRANSACTION_UNRECOVERABLE',
    })
    expect(fs.operations.filter((operation) => operation.startsWith('rename:') || operation.startsWith('remove:'))).toEqual([])
  })

  test('CLI refuses explicit recovery while multiple journals exist', async () => {
    // Break caught: selecting one nonce does not make two journals over the
    // same canonical outputs independent transactions.
    const directory = await mkdtemp(join(tmpdir(), 'moe-transaction-cli-'))
    try {
      await writeFile(join(directory, '.moe-mint-generation-alpha.json'), '{}')
      await writeFile(join(directory, '.moe-mint-generation-beta.json'), '{}')
      const result = spawnSync(process.execPath, [recoverScript, '.moe-mint-generation-alpha.json'], {
        cwd: directory,
        encoding: 'utf8',
      })

      expect(result.status).toBe(1)
      expect(result.stderr).toContain('code: GENERATION_TRANSACTION_MULTIPLE_JOURNALS')
      expect(result.stderr).toContain('paths: .moe-mint-generation-alpha.json, .moe-mint-generation-beta.json')
      expect(result.stderr).toContain('action: preserve every journal')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  test('CLI renders code paths action and cause for a malformed journal', async () => {
    // Break caught: the pre-build operator interface previously hid the
    // structured survivor/action data carried by the recovery error.
    const directory = await mkdtemp(join(tmpdir(), 'moe-transaction-cli-error-'))
    try {
      await writeFile(join(directory, '.moe-mint-generation-alpha.json'), '{')
      const result = spawnSync(process.execPath, [recoverScript], { cwd: directory, encoding: 'utf8' })

      expect(result.status).toBe(1)
      expect(result.stderr).toContain('code: GENERATION_TRANSACTION_UNRECOVERABLE')
      expect(result.stderr).toContain('paths: .moe-mint-generation-alpha.json')
      expect(result.stderr).toContain('action: preserve the journal and outputs')
      expect(result.stderr).toContain('cause:')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  test('reports final journal-parent sync failure as new-installed uncertainty', async () => {
    // Break caught: journal removal succeeded before its parent sync failed;
    // reporting an old rollback here is factually false.
    const { replaceGeneratedOutputs } = await import(transactionModule)
    const fs = fakeSwapFs()

    await expect(replaceGeneratedOutputs({ journalPath: '.moe-mint-generation-abc123.json', journal: journal() }, failAfterSwapEvent(fs, 21))).rejects.toMatchObject({
      code: 'GENERATION_TRANSACTION_NEW_INSTALLED_DURABILITY_UNCERTAIN',
    })
    expect(new Set(journal().targets.map((target) => fs.identities.get(target.current)))).toEqual(new Set(['new']))
  })

  test('ignores only the durable nonce temp siblings owned by generation', () => {
    // Break caught: a crash before durable rename leaves these exact names;
    // broad sibling ignores would hide unrelated repository files instead.
    const paths = [
      '..moe-mint-generation-abc123.json.tmp-9-uuid',
      '.claude-plugin/.marketplace.next-abc123.json.tmp-9-uuid',
      '.claude-plugin/.marketplace.backup-abc123.json.tmp-9-uuid',
      'docs/moe/generated/.plugin-catalog.next-abc123.md.tmp-9-uuid',
      'docs/moe/generated/.plugin-catalog.backup-abc123.md.tmp-9-uuid',
    ]
    for (const path of paths) {
      expect(spawnSync('git', ['check-ignore', '-q', '--', path], { cwd: repoRoot }).status).toBe(0)
    }
    expect(spawnSync('git', ['check-ignore', '-q', '--', 'plugins.next-unrelated'], { cwd: repoRoot }).status).toBe(0)
    expect(spawnSync('git', ['check-ignore', '-q', '--', 'plugins-not-a-generation-sibling'], { cwd: repoRoot }).status).not.toBe(0)
  })
})
