import { describe, expect, it } from 'vitest'
import { artifactPath } from '../src/artifact/paths.js'
import { SkillRuntimeError, assertValidSkillRuntime, validateSkillRuntime, type SkillRuntimeFile } from '../src/skill-runtime.js'

const file = (path: string, content: string, executable = false): SkillRuntimeFile => ({
  path: artifactPath(path),
  content: Buffer.from(content),
  executable,
})

const valid = [
  file('skills/demo/SKILL.md', 'Run `node "${CLAUDE_PLUGIN_ROOT}/skills/demo/scripts/main.mjs"`.\n'),
  file('skills/demo/scripts/main.mjs', 'import { value } from "./lib.mjs";\nconsole.log(value);\n'),
  file('skills/demo/scripts/lib.mjs', 'import { readFile } from "node:fs/promises";\nexport const value = typeof readFile;\n'),
  file('skills/demo/scripts/prompt.md', '# Prompt\n'),
  file('skills/demo/examples/example.py', "print('example')\n"),
]

function input(files: readonly SkillRuntimeFile[]) {
  return { plugin: 'demo', source: 'test fixture', skillsRoot: 'skills', files }
}

describe('skill runtime validation', () => {
  it('accepts a skill whose executable modules are mjs scripts and excludes examples', () => {
    expect(validateSkillRuntime(input(valid))).toEqual({
      skills: 1,
      modules: 2,
      diagnostics: [],
      ok: true,
    })
  })

  it('does not classify a directory as a skill without its direct SKILL.md', () => {
    expect(validateSkillRuntime(input([
      ...valid,
      file('skills/not-a-skill/scripts/tool.js', 'console.log("tool")\n'),
    ]))).toEqual({
      skills: 1,
      modules: 2,
      diagnostics: [],
      ok: true,
    })
  })

  it.each([
    ['.py', 'skills/demo/scripts/tool.py', "print('tool')\n", ['SKILL_RUNTIME_LANGUAGE']],
    ['.sh', 'skills/demo/scripts/tool.sh', '#!/bin/sh\necho tool\n', ['SKILL_RUNTIME_LANGUAGE', 'SKILL_RUNTIME_SHEBANG']],
    ['.bash', 'skills/demo/scripts/tool.bash', '#!/usr/bin/env bash\necho tool\n', ['SKILL_RUNTIME_LANGUAGE', 'SKILL_RUNTIME_SHEBANG']],
    ['.cjs', 'skills/demo/scripts/tool.cjs', 'module.exports = {}\n', ['SKILL_RUNTIME_LANGUAGE']],
    ['.js', 'skills/demo/scripts/test-unlinked.js', 'console.log("tool")\n', ['SKILL_RUNTIME_LANGUAGE']],
    ['.ts', 'skills/demo/scripts/tool.ts', 'export const tool: string = "tool"\n', ['SKILL_RUNTIME_LANGUAGE']],
    ['.cmd', 'skills/demo/scripts/tool.cmd', '@echo off\r\n', ['SKILL_RUNTIME_LANGUAGE']],
    ['.ps1', 'skills/demo/scripts/tool.ps1', 'Write-Output "tool"\n', ['SKILL_RUNTIME_LANGUAGE']],
    ['.rb', 'skills/demo/scripts/tool.rb', 'puts "tool"\n', ['SKILL_RUNTIME_LANGUAGE']],
    ['.jsx', 'skills/demo/scripts/tool.jsx', 'export const tool = <div />\n', ['SKILL_RUNTIME_LANGUAGE']],
    ['.mts', 'skills/demo/scripts/tool.mts', 'export const tool = "tool"\n', ['SKILL_RUNTIME_LANGUAGE']],
    ['extensionless code', 'skills/demo/scripts/tool', 'console.log("tool")\n', ['SKILL_RUNTIME_LANGUAGE']],
    ['mjs outside scripts', 'skills/demo/tool.mjs', 'console.log("tool")\n', ['SKILL_RUNTIME_LOCATION']],
  ] as const)('reports %s code as unsupported without inspecting invocation links', (_name, path, content, codes) => {
    const report = validateSkillRuntime(input([...valid, file(path, content)]))

    expect(report).toMatchObject({ ok: false, skills: 1, modules: 3 })
    expect(report.diagnostics).toEqual(codes.map((code) => expect.objectContaining({ code, path })))
  })

  it.each([
    file('skills/demo/examples/example.js', 'console.log("example")\n', true),
    file('skills/demo/examples/example', '#!/bin/sh\necho example\n', true),
    file('skills/demo/examples/nested/example.py', "print('example')\n"),
  ])('excludes all examples content structurally regardless of mode', (example) => {
    expect(validateSkillRuntime(input([...valid, example]))).toEqual({
      skills: 1,
      modules: 2,
      diagnostics: [],
      ok: true,
    })
  })

  it('accepts the closed set of non-code assets under scripts', () => {
    expect(validateSkillRuntime(input([
      ...valid,
      file('skills/demo/scripts/template.html', '<main>prompt</main>\n'),
      file('skills/demo/scripts/config.json', '{"enabled":true}\n'),
    ]))).toMatchObject({ modules: 2, diagnostics: [], ok: true })
  })

  it('reports executable script mode', () => {
    const report = validateSkillRuntime(input([...valid, file('skills/demo/scripts/executable.mjs', 'console.log("tool")\n', true)]))

    expect(report.diagnostics).toEqual([expect.objectContaining({ code: 'SKILL_RUNTIME_EXECUTABLE', path: 'skills/demo/scripts/executable.mjs' })])
  })

  it('reports shebang content', () => {
    const report = validateSkillRuntime(input([...valid, file('skills/demo/scripts/shebang.mjs', '#!/usr/bin/env node\nconsole.log("tool")\n')]))

    expect(report.diagnostics).toEqual([expect.objectContaining({ code: 'SKILL_RUNTIME_SHEBANG', path: 'skills/demo/scripts/shebang.mjs' })])
  })

  it.each([
    ['bare built-in imports', 'import fs from "fs";', 'SKILL_RUNTIME_IMPORT'],
    ['package imports', 'import value from "left-pad";', 'SKILL_RUNTIME_IMPORT'],
    ['absolute imports', 'import value from "/tmp/value.mjs";', 'SKILL_RUNTIME_IMPORT'],
    ['parent imports', 'import value from "../other/scripts/value.mjs";', 'SKILL_RUNTIME_IMPORT'],
    ['computed dynamic imports', 'import("./" + name);', 'SKILL_RUNTIME_DYNAMIC_IMPORT'],
    ['CommonJS require calls', 'const value = require("./value.cjs");', 'SKILL_RUNTIME_COMMONJS'],
    ['aliased createRequire loaders', 'import { createRequire as makeRequire } from "node:module"; const load = makeRequire(import.meta.url); load("left-pad");', 'SKILL_RUNTIME_COMMONJS'],
    ['child-process exec imports', 'import { execSync } from "node:child_process";', 'SKILL_RUNTIME_SHELL_EXEC'],
    ['child-process namespace exec calls', 'import * as childProcess from "node:child_process"; childProcess.exec("tool");', 'SKILL_RUNTIME_SHELL_EXEC'],
    ['literal computed namespace exec calls', 'import * as childProcess from "node:child_process"; childProcess["exec"]("tool");', 'SKILL_RUNTIME_SHELL_EXEC'],
    ['default child-process namespace exec calls', 'import childProcess from "node:child_process"; childProcess.exec("tool");', 'SKILL_RUNTIME_SHELL_EXEC'],
    ['extracted namespace exec calls', 'import * as childProcess from "node:child_process"; const run = childProcess.exec; run("tool");', 'SKILL_RUNTIME_SHELL_EXEC'],
    ['spawn calls with shell enabled', 'import { spawn } from "node:child_process"; spawn("tool", [], { shell: true });', 'SKILL_RUNTIME_SHELL_EXEC'],
    ['spawnSync calls with shell enabled', 'import { spawnSync } from "node:child_process"; spawnSync("tool", [], { shell: true });', 'SKILL_RUNTIME_SHELL_EXEC'],
    ['spawn calls with second-position options', 'import { spawn } from "node:child_process"; spawn("tool", { shell: true });', 'SKILL_RUNTIME_SHELL_EXEC'],
    ['spawnSync calls with a string shell', 'import { spawnSync } from "node:child_process"; spawnSync("tool", [], { shell: "/bin/sh" });', 'SKILL_RUNTIME_SHELL_EXEC'],
    ['execFile calls with second-position options', 'import { execFile } from "node:child_process"; execFile("tool", { shell: true });', 'SKILL_RUNTIME_SHELL_EXEC'],
    ['execFileSync calls with a string shell', 'import { execFileSync } from "node:child_process"; execFileSync("tool", [], { shell: "/bin/sh" });', 'SKILL_RUNTIME_SHELL_EXEC'],
    ['namespace execFile calls with shell enabled', 'import * as childProcess from "node:child_process"; childProcess.execFile("tool", [], { shell: true });', 'SKILL_RUNTIME_SHELL_EXEC'],
    ['dynamic child-process namespace imports', 'const childProcess = await import("node:child_process"); childProcess.exec("tool");', 'SKILL_RUNTIME_SHELL_EXEC'],
    ['re-exported child-process exec APIs', 'export { exec } from "node:child_process";', 'SKILL_RUNTIME_SHELL_EXEC'],
    ['literal computed namespace spawn calls', 'import * as childProcess from "node:child_process"; childProcess["spawn"]("tool", [], { shell: true });', 'SKILL_RUNTIME_SHELL_EXEC'],
    ['spawn calls before their static imports', 'spawn("tool", [], { shell: true }); import { spawn } from "node:child_process";', 'SKILL_RUNTIME_SHELL_EXEC'],
    ['dynamic import of node:module followed by createRequire', 'const mod = await import("node:module"); const req = mod.createRequire(import.meta.url); req("left-pad");', 'SKILL_RUNTIME_COMMONJS'],
    ['re-exported child-process spawn API', 'export { spawn } from "node:child_process";', 'SKILL_RUNTIME_SHELL_EXEC'],
    ['re-exported child-process execFileSync API', 'export { execFileSync } from "node:child_process";', 'SKILL_RUNTIME_SHELL_EXEC'],
    ['export-all child-process re-export', 'export * from "node:child_process";', 'SKILL_RUNTIME_SHELL_EXEC'],
    ['missing relative modules', 'import value from "./missing.mjs";', 'SKILL_RUNTIME_IMPORT'],
    ['relative modules without the mjs extension', 'import value from "./lib.js";', 'SKILL_RUNTIME_IMPORT'],
    ['unknown node built-ins', 'import value from "node:not-a-real-built-in";', 'SKILL_RUNTIME_IMPORT'],
    ['malformed module syntax', 'import {', 'SKILL_RUNTIME_SYNTAX'],
  ] as const)('rejects %s', (_name, source, code) => {
    const path = 'skills/demo/scripts/policy.mjs'
    const report = validateSkillRuntime(input([...valid, file(path, source)]))

    expect(report.diagnostics).toContainEqual(expect.objectContaining({ code, path }))
  })

  it('accepts Node 24 built-ins that exist only with the node: prefix', () => {
    const report = validateSkillRuntime(input([
      ...valid,
      file('skills/demo/scripts/sqlite.mjs', 'import { DatabaseSync } from "node:sqlite";\nexport const database = new DatabaseSync(":memory:");\n'),
    ]))

    expect(report).toMatchObject({ skills: 1, modules: 3, diagnostics: [], ok: true })
  })

  it('accepts literal dynamic imports and re-exports of same-skill mjs modules', () => {
    const report = validateSkillRuntime(input([
      ...valid,
      file('skills/demo/scripts/reexport.mjs', 'export { value } from "./lib.mjs";\n'),
      file('skills/demo/scripts/dynamic.mjs', 'const module = await import("./lib.mjs");\nconsole.log(module.value);\n'),
    ]))

    expect(report).toMatchObject({ skills: 1, modules: 4, diagnostics: [], ok: true })
  })

  it('reports every import-policy violation in stable order regardless of file order', () => {
    const files = [
      ...valid,
      file('skills/demo/scripts/z-import.mjs', 'import first from "left-pad"; import second from "/tmp/value.mjs";'),
      file('skills/demo/scripts/a-syntax.mjs', 'import {'),
      file('skills/demo/scripts/m-shell.mjs', 'import { exec, execSync } from "node:child_process";'),
    ]

    expect(validateSkillRuntime(input(files)).diagnostics).toEqual(
      validateSkillRuntime(input([...files].reverse())).diagnostics,
    )
    expect(validateSkillRuntime(input(files)).diagnostics.map(({ path, code, message }) => ({ path, code, message }))).toEqual([
      { path: 'skills/demo/scripts/a-syntax.mjs', code: 'SKILL_RUNTIME_SYNTAX', message: 'runtime module "skills/demo/scripts/a-syntax.mjs" must contain valid ECMAScript module syntax' },
      { path: 'skills/demo/scripts/m-shell.mjs', code: 'SKILL_RUNTIME_SHELL_EXEC', message: 'runtime module "skills/demo/scripts/m-shell.mjs" must not use child_process exec APIs' },
      { path: 'skills/demo/scripts/m-shell.mjs', code: 'SKILL_RUNTIME_SHELL_EXEC', message: 'runtime module "skills/demo/scripts/m-shell.mjs" must not use child_process exec APIs' },
      { path: 'skills/demo/scripts/z-import.mjs', code: 'SKILL_RUNTIME_IMPORT', message: 'runtime module "skills/demo/scripts/z-import.mjs" imports unsupported module "/tmp/value.mjs"' },
      { path: 'skills/demo/scripts/z-import.mjs', code: 'SKILL_RUNTIME_IMPORT', message: 'runtime module "skills/demo/scripts/z-import.mjs" imports unsupported module "left-pad"' },
    ])
  })

  it('sorts diagnostic messages with locale-independent raw string ordering', () => {
    const report = validateSkillRuntime(input([
      ...valid,
      file('skills/demo/scripts/non-ascii.mjs', 'import zed from "z-package"; import accented from "é-package";\n'),
    ]))

    expect(report.diagnostics.map(({ message }) => message)).toEqual([
      'runtime module "skills/demo/scripts/non-ascii.mjs" imports unsupported module "z-package"',
      'runtime module "skills/demo/scripts/non-ascii.mjs" imports unsupported module "é-package"',
    ])
  })

  it('reports every violation for an executable shebang JavaScript module outside scripts in stable order', () => {
    const report = validateSkillRuntime(input([
      ...valid,
      file('skills/demo/tool.js', '#!/usr/bin/env node\nconsole.log("tool")\n', true),
    ]))

    expect(report.diagnostics.map(({ path, code, message }) => ({ path, code, message }))).toEqual([
      {
        path: 'skills/demo/tool.js',
        code: 'SKILL_RUNTIME_EXECUTABLE',
        message: 'runtime module "skills/demo/tool.js" must not be executable',
      },
      {
        path: 'skills/demo/tool.js',
        code: 'SKILL_RUNTIME_LANGUAGE',
        message: 'runtime module "skills/demo/tool.js" must use the .mjs extension',
      },
      {
        path: 'skills/demo/tool.js',
        code: 'SKILL_RUNTIME_LOCATION',
        message: 'runtime module "skills/demo/tool.js" must be under a skill\'s scripts directory',
      },
      {
        path: 'skills/demo/tool.js',
        code: 'SKILL_RUNTIME_SHEBANG',
        message: 'runtime module "skills/demo/tool.js" must not begin with a shebang',
      },
    ])
  })

  it('rejects noncanonical documented invocations and unresolved canonical references in Markdown', () => {
    const report = validateSkillRuntime(input([
      ...valid,
      file('skills/demo/guide.md', [
        '`${CLAUDE_PLUGIN_ROOT}/skills/demo/scripts/main.mjs`',
        '`python3 "${CLAUDE_PLUGIN_ROOT}/skills/demo/scripts/main.py"`',
        '`node ./scripts/main.mjs`',
        '',
        'The helper is `scripts/main.mjs`.',
        '| Helper | Path |',
        '| --- | --- |',
        '| main | `scripts/main.mjs` |',
      ].join('\n')),
      file('skills/demo/scripts/prompt.md', [
        '```console',
        'node "$SKILL/main.mjs"',
        'node "${CLAUDE_PLUGIN_ROOT}/skills/demo/scripts/missing.mjs"',
        '```',
      ].join('\n')),
    ]))

    expect(report.diagnostics.map(({ path, code }) => ({ path, code }))).toEqual([
      { path: 'skills/demo/guide.md', code: 'SKILL_RUNTIME_INVOCATION' },
      { path: 'skills/demo/guide.md', code: 'SKILL_RUNTIME_INVOCATION' },
      { path: 'skills/demo/guide.md', code: 'SKILL_RUNTIME_INVOCATION' },
      { path: 'skills/demo/scripts/prompt.md', code: 'SKILL_RUNTIME_REFERENCE' },
    ])
  })

  it('accepts canonical invocations with supported quoting, arguments, comments, and continuations', () => {
    const report = validateSkillRuntime(input([
      ...valid,
      file('skills/demo/guide.md', [
        'Run `node ${CLAUDE_PLUGIN_ROOT}/skills/demo/scripts/main.mjs`.',
        'Run `node \'${CLAUDE_PLUGIN_ROOT}/skills/demo/scripts/main.mjs\' --format json`.',
        '```shell',
        'node "${CLAUDE_PLUGIN_ROOT}/skills/demo/scripts/main.mjs" --format json # render output',
        'node "${CLAUDE_PLUGIN_ROOT}/skills/demo/scripts/main.mjs" \\',
        '  --format json',
        '```',
      ].join('\n')),
    ]))

    expect(report.diagnostics).toEqual([])
  })

  it('rejects quoted direct calls and dangling noncanonical mjs invocations', () => {
    const report = validateSkillRuntime(input([
      ...valid,
      file('skills/demo/guide.md', [
        '`"${CLAUDE_PLUGIN_ROOT}/skills/demo/scripts/main.mjs"`',
        '`node "${CLAUDE_PLUGIN_ROOT}/skills/demo/scripts/missing.mjs"`',
        '`node main.mjs`',
      ].join('\n')),
    ]))

    expect(report.diagnostics.map(({ code }) => code)).toEqual([
      'SKILL_RUNTIME_INVOCATION',
      'SKILL_RUNTIME_INVOCATION',
      'SKILL_RUNTIME_REFERENCE',
    ])
  })

  it('throws an aggregate runtime error with every sorted diagnostic when assertion is requested', () => {
    const runtimeInput = input([
      ...valid,
      file('skills/demo/scripts/z.js', 'console.log("z")\n'),
      file('skills/demo/scripts/a.py', "print('a')\n"),
    ])

    try {
      assertValidSkillRuntime(runtimeInput)
      throw new Error('expected assertValidSkillRuntime to throw')
    } catch (error) {
      expect(error).toBeInstanceOf(SkillRuntimeError)
      expect(error).toMatchObject({
        diagnostic: expect.objectContaining({
          code: 'SKILL_RUNTIME_INVALID',
          path: 'skills/demo/scripts/a.py',
          action: 'Use dependency-free Node 24 ESM under the owning scripts/ directory.',
        }),
        diagnostics: [
          expect.objectContaining({ code: 'SKILL_RUNTIME_LANGUAGE', path: 'skills/demo/scripts/a.py' }),
          expect.objectContaining({ code: 'SKILL_RUNTIME_LANGUAGE', path: 'skills/demo/scripts/z.js' }),
        ],
      })
      expect((error as SkillRuntimeError).message).toBe('skill runtime validation found 2 violations')
    }
  })
})
