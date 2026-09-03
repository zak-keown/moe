import { describe, expect, it } from 'vitest'
import { artifactPath } from '../src/artifact/paths.js'
import { assertValidSkillRuntime, validateSkillRuntime, type SkillRuntimeFile } from '../src/skill-runtime.js'

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

  it('reports executable script mode', () => {
    const report = validateSkillRuntime(input([...valid, file('skills/demo/scripts/executable.mjs', 'console.log("tool")\n', true)]))

    expect(report.diagnostics).toEqual([expect.objectContaining({ code: 'SKILL_RUNTIME_EXECUTABLE', path: 'skills/demo/scripts/executable.mjs' })])
  })

  it('reports shebang content', () => {
    const report = validateSkillRuntime(input([...valid, file('skills/demo/scripts/shebang.mjs', '#!/usr/bin/env node\nconsole.log("tool")\n')]))

    expect(report.diagnostics).toEqual([expect.objectContaining({ code: 'SKILL_RUNTIME_SHEBANG', path: 'skills/demo/scripts/shebang.mjs' })])
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

  it('throws its first stable diagnostic when assertion is requested', () => {
    expect(() => assertValidSkillRuntime(input([
      ...valid,
      file('skills/demo/scripts/z.js', 'console.log("z")\n'),
      file('skills/demo/scripts/a.py', "print('a')\n"),
    ]))).toThrow(expect.objectContaining({ diagnostic: expect.objectContaining({ code: 'SKILL_RUNTIME_LANGUAGE', path: 'skills/demo/scripts/a.py' }) }))
  })
})
