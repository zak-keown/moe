import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, test } from 'vitest'

const transactionModule = pathToFileURL(
  resolve(import.meta.dirname, '../../../scripts/lib/mint-generation-transaction.mjs'),
).href

type PathState = 'missing' | 'file' | 'directory' | 'symlink' | 'other'

interface FakeSwapFs {
  readonly operations: string[]
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
  const operations: string[] = []
  return {
    operations,
    async writeDurableFile(path, content) {
      operations.push(`write-temp:${path}`)
      operations.push(`fsync-file:${path}`)
      operations.push(`rename-temp:${path}`)
      states.set(path, 'file')
      bytes.set(path, content)
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
    },
    async remove(path) {
      operations.push(`remove:${path}`)
      states.delete(path)
      bytes.delete(path)
    },
    async fsyncDirectory(path) {
      operations.push(`fsync:${path}`)
    },
  }
}

type TransactionState = 'unstarted' | 'backed-up' | 'committed' | 'clean'

function recoveryFs(states: readonly TransactionState[], rawJournal = JSON.stringify(journal())) {
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
  for (const [index, target] of journal().targets.entries()) {
    const state = states[index]
    if (state === undefined) throw new Error('transaction state missing')
    if (state === 'unstarted' || state === 'committed' || state === 'clean') files.set(target.current, target.kind)
    if (state === 'unstarted' || state === 'backed-up') files.set(target.next, target.kind)
    if (state === 'backed-up' || state === 'committed') files.set(target.backup, target.kind)
  }
  const operations: string[] = []
  return {
    operations,
    files,
    async writeDurableFile(filePath: string, bytes: Uint8Array) {
      files.set(filePath, 'file')
      journalBytes.set(filePath, bytes)
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
    },
    async remove(filePath: string) {
      operations.push(`remove:${filePath}`)
      files.delete(filePath)
      journalBytes.delete(filePath)
    },
    async fsyncDirectory(directory: string) {
      operations.push(`fsync:${directory}`)
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
    const fs = recoveryFs(['clean', 'unstarted', 'unstarted'])

    await expect(recoverGeneratedOutputs({ journalPath: '.moe-mint-generation-abc123.json' }, fs)).rejects.toMatchObject({
      code: 'GENERATION_TRANSACTION_UNRECOVERABLE',
    })
    await expect(fs.pathState('.moe-mint-generation-abc123.json')).resolves.toBe('file')
  })
})
