import { describe, expect, it } from 'vitest'
import { classifyStagedImports } from '../src/artifact/staged-imports.js'

describe('staged imported-work ownership', () => {
  it('maps component and payload paths by segment-boundary roots and permits shared bundle outputs', () => {
    expect(classifyStagedImports({
      importedWorks: [
        { name: 'source-work', artifactRoots: ['skills/imported'] },
        { name: 'pkg-a', artifactRoots: [] },
        { name: 'pkg-b', artifactRoots: [] },
      ],
      staged: [
        { artifactPath: 'skills/imported/SKILL.md', sourceKind: 'component' },
        { artifactPath: 'dist/index.js', sourceKind: 'bundle', work: 'pkg-a' },
        { artifactPath: 'dist/index.js', sourceKind: 'bundle', work: 'pkg-b' },
      ],
    })).toEqual([
      { work: 'pkg-a', artifactPath: 'dist/index.js', sourceKind: 'bundle' },
      { work: 'pkg-b', artifactPath: 'dist/index.js', sourceKind: 'bundle' },
      { work: 'source-work', artifactPath: 'skills/imported/SKILL.md', sourceKind: 'component' },
    ])
  })

  it.each([
    ['an imported root not staged', [{ name: 'work', artifactRoots: ['vendor/work'] }], [], 'STAGED_IMPORT_ROOT_MISSING'],
    ['independently identified staged import not declared', [], [{ artifactPath: 'vendor/work/file.js', sourceKind: 'payload', work: 'work' }], 'STAGED_IMPORT_UNDECLARED'],
    ['overlapping claims', [{ name: 'a', artifactRoots: ['vendor'] }, { name: 'b', artifactRoots: ['vendor/b'] }], [{ artifactPath: 'vendor/b/x', sourceKind: 'payload' }], 'STAGED_IMPORT_OVERLAP'],
    ['path escape', [{ name: 'a', artifactRoots: ['vendor'] }], [{ artifactPath: '../escape', sourceKind: 'payload' }], 'STAGED_IMPORT_PATH_INVALID'],
  ] as const)('rejects %s', (_name, importedWorks, staged, code) => {
    expect(() => classifyStagedImports({ importedWorks, staged })).toThrow(expect.objectContaining({ diagnostic: expect.objectContaining({ code }) }))
  })
})
