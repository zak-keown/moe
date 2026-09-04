import { builtinModules } from 'node:module'
import { parse, type Node } from 'acorn'
import { MintError, type MintDiagnostic } from './diagnostics.js'
import { compareArtifactPaths, type ArtifactPath } from './artifact/paths.js'

export interface SkillRuntimeFile {
  readonly path: ArtifactPath
  readonly content: Uint8Array
  readonly executable: boolean
}

export interface ValidateSkillRuntimeInput {
  readonly plugin: string
  readonly source: string
  readonly skillsRoot: string
  readonly files: readonly SkillRuntimeFile[]
}

export interface SkillRuntimeReport {
  readonly skills: number
  readonly modules: number
  readonly diagnostics: readonly MintDiagnostic[]
  readonly ok: boolean
}

const CODE_EXTENSIONS = new Set(['.mjs', '.py', '.rb', '.sh', '.bash', '.zsh', '.fish', '.cjs', '.js', '.jsx', '.ts', '.mts', '.cts', '.tsx', '.ps1', '.cmd'])
const NON_CODE_ASSET_EXTENSIONS = new Set(['.md', '.html', '.json'])
const DECLARATION_SUFFIXES = ['.d.mts', '.d.ts', '.d.cts']
const NODE_BUILTINS = new Set(builtinModules)
const _RUNTIME_BACKEND_SUFFIX = /\.(?:mjs|py|rb|sh|bash|zsh|fish|cjs|js|jsx|ts|mts|cts|tsx|ps1|cmd)(?:\b|$)/
const SHELL_FENCE_LANGUAGES = new Set(['bash', 'console', 'fish', 'sh', 'shell', 'shellscript', 'zsh'])
const RUNTIME_ACTION = 'Use dependency-free Node 24 ESM under the owning scripts/ directory.'

type AstNode = Node & Record<string, unknown>

function skillName(path: ArtifactPath, skillsRoot: string): string | undefined {
  const prefix = `${skillsRoot}/`
  if (!path.startsWith(prefix)) return undefined
  const segments = path.slice(prefix.length).split('/')
  return segments.length === 2 && segments[1] === 'SKILL.md' ? segments[0] : undefined
}

function skillRelativePath(path: ArtifactPath, skillsRoot: string): string | undefined {
  const prefix = `${skillsRoot}/`
  if (!path.startsWith(prefix)) return undefined
  const segments = path.slice(prefix.length).split('/')
  if (segments.length < 2) return undefined
  return segments.slice(1).join('/')
}

function skillDirectory(path: ArtifactPath, skillsRoot: string): string | undefined {
  const prefix = `${skillsRoot}/`
  if (!path.startsWith(prefix)) return undefined
  return path.slice(prefix.length).split('/')[0]
}

function extension(path: string): string {
  const basename = path.slice(path.lastIndexOf('/') + 1)
  const index = basename.lastIndexOf('.')
  return index < 0 ? '' : basename.slice(index)
}

function isDeclarationFile(path: string): boolean {
  const basename = path.slice(path.lastIndexOf('/') + 1)
  return DECLARATION_SUFFIXES.some((suffix) => basename.endsWith(suffix))
}

function compareRawStrings(left: string, right: string): number {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

function hasShebang(content: Uint8Array): boolean {
  return content[0] === 0x23 && content[1] === 0x21
}

function diagnostic(input: ValidateSkillRuntimeInput, file: SkillRuntimeFile, code: string, message: string, action: string): MintDiagnostic {
  return {
    severity: 'error',
    code,
    plugin: input.plugin,
    source: input.source,
    path: file.path,
    message,
    action,
  }
}

function isAstNode(value: unknown): value is AstNode {
  return typeof value === 'object' && value !== null && 'type' in value && typeof value.type === 'string'
}

function walk(node: AstNode, visit: (node: AstNode) => void): void {
  visit(node)
  for (const value of Object.values(node)) {
    if (isAstNode(value)) walk(value, visit)
    else if (Array.isArray(value)) {
      for (const child of value) if (isAstNode(child)) walk(child, visit)
    }
  }
}

function literalString(node: AstNode | undefined): string | undefined {
  return node?.type === 'Literal' && typeof node.value === 'string' ? node.value : undefined
}

function propertyName(node: AstNode): string | undefined {
  if (node.type !== 'Property') return undefined
  const key = node.key as AstNode
  if (node.computed) return literalString(key)
  return key.type === 'Identifier' ? key.name as string : literalString(key)
}

function objectEnablesShell(node: AstNode | undefined): boolean {
  return node?.type === 'ObjectExpression' && (node.properties as unknown[]).some((property) => {
    if (!isAstNode(property) || propertyName(property) !== 'shell') return false
    const value = property.value as AstNode
    if (value.type === 'Literal') return value.value === true || typeof value.value === 'string'
    return value.type === 'TemplateLiteral'
  })
}

function resolveRelativeModule(file: SkillRuntimeFile, scriptRoot: string, source: string): string | undefined {
  if (!(source.startsWith('./') || source.startsWith('../')) || !source.endsWith('.mjs')) return undefined

  const segments = file.path.slice(0, file.path.lastIndexOf('/')).split('/')
  for (const segment of source.split('/')) {
    if (segment === '.' || segment === '') continue
    if (segment === '..') segments.pop()
    else segments.push(segment)
  }
  const resolved = segments.join('/')
  return resolved.startsWith(`${scriptRoot}/`) ? resolved : undefined
}

function isAllowedModuleSource(source: string, file: SkillRuntimeFile, scriptRoot: string, filePaths: ReadonlySet<string>): boolean {
  if (source.startsWith('node:')) return NODE_BUILTINS.has(source) || NODE_BUILTINS.has(source.slice('node:'.length))
  const resolved = resolveRelativeModule(file, scriptRoot, source)
  return resolved !== undefined && filePaths.has(resolved)
}

function importedName(specifier: AstNode): string | undefined {
  if (specifier.type !== 'ImportSpecifier') return undefined
  const imported = specifier.imported as AstNode
  return imported.type === 'Identifier' ? imported.name as string : literalString(imported)
}

function localName(specifier: AstNode): string | undefined {
  const local = specifier.local as AstNode | undefined
  return local?.type === 'Identifier' ? local.name as string : literalString(local)
}

function memberName(node: AstNode): string | undefined {
  if (node.type !== 'MemberExpression') return undefined
  const property = node.property as AstNode
  if (node.computed) return literalString(property)
  return property.type === 'Identifier' ? property.name as string : undefined
}

function inspectModule(
  input: ValidateSkillRuntimeInput,
  file: SkillRuntimeFile,
  skill: string,
  filePaths: ReadonlySet<string>,
): MintDiagnostic[] {
  const source = Buffer.from(file.content).toString('utf8')
  const diagnostics: MintDiagnostic[] = []
  const scriptRoot = `${input.skillsRoot}/${skill}/scripts`
  const childProcessNamespaces = new Set<string>()
  const childProcessCalls = new Map<string, string>()
  const nodeModuleNamespaces = new Set<string>()

  const add = (code: string, message: string, action: string) => {
    diagnostics.push(diagnostic(input, file, code, message, action))
  }
  const inspectSource = (moduleSource: string) => {
    if (!isAllowedModuleSource(moduleSource, file, scriptRoot, filePaths)) {
      add('SKILL_RUNTIME_IMPORT', `runtime module "${file.path}" imports unsupported module "${moduleSource}"`, 'Use a node: built-in or a relative .mjs module inside this skill\'s scripts directory.')
    }
  }

  let program: AstNode
  try {
    program = parse(source, { ecmaVersion: 'latest', sourceType: 'module', allowHashBang: true }) as unknown as AstNode
  } catch {
    add('SKILL_RUNTIME_SYNTAX', `runtime module "${file.path}" must contain valid ECMAScript module syntax`, 'Fix the module syntax and keep it valid ESM.')
    return diagnostics
  }

  walk(program, (node) => {
    if (node.type !== 'ImportDeclaration') return
    const moduleSource = literalString(node.source as AstNode)
    for (const specifier of node.specifiers as AstNode[]) {
      const imported = importedName(specifier)
      const local = localName(specifier)
      const namespace = specifier.type === 'ImportNamespaceSpecifier' || specifier.type === 'ImportDefaultSpecifier'

      if (moduleSource === 'node:child_process') {
        if ((imported === 'exec' || imported === 'execSync') && local !== undefined) {
          add('SKILL_RUNTIME_SHELL_EXEC', `runtime module "${file.path}" must not use child_process exec APIs`, 'Remove shell execution from the skill runtime module.')
        }
        if (imported !== undefined && local !== undefined && ['spawn', 'spawnSync', 'execFile', 'execFileSync'].includes(imported)) {
          childProcessCalls.set(local, imported)
        }
        if (namespace && local !== undefined) childProcessNamespaces.add(local)
      }

      if (moduleSource === 'node:module') {
        if (imported === 'createRequire') {
          add('SKILL_RUNTIME_COMMONJS', `runtime module "${file.path}" must not use createRequire`, 'Use static or literal dynamic ESM imports instead.')
        }
        if (namespace && local !== undefined) nodeModuleNamespaces.add(local)
      }
    }
  })

  walk(program, (node) => {
    if (node.type === 'ImportDeclaration') {
      const moduleSource = literalString(node.source as AstNode)
      if (moduleSource === undefined) add('SKILL_RUNTIME_IMPORT', `runtime module "${file.path}" imports an unsupported module`, 'Use a node: built-in or a relative .mjs module inside this skill\'s scripts directory.')
      else inspectSource(moduleSource)
    }

    if (node.type === 'ExportNamedDeclaration' || node.type === 'ExportAllDeclaration') {
      const moduleSource = literalString(node.source as AstNode | undefined)
      if (moduleSource !== undefined) {
        inspectSource(moduleSource)
        if (moduleSource === 'node:child_process') {
          const shellCapableApis = new Set(['exec', 'execSync', 'spawn', 'spawnSync', 'execFile', 'execFileSync'])
          const exportsShellCapable = node.type === 'ExportAllDeclaration'
            || (node.specifiers as AstNode[]).some((specifier) => {
              const exported = localName(specifier)
              return exported !== undefined && shellCapableApis.has(exported)
            })
          if (exportsShellCapable) {
            add('SKILL_RUNTIME_SHELL_EXEC', `runtime module "${file.path}" must not re-export child_process shell-capable APIs`, 'Remove shell execution from the skill runtime module.')
          }
        }
        if (moduleSource === 'node:module'
          && node.type === 'ExportNamedDeclaration'
          && (node.specifiers as AstNode[]).some((specifier) => localName(specifier) === 'createRequire')) {
          add('SKILL_RUNTIME_COMMONJS', `runtime module "${file.path}" must not re-export createRequire`, 'Use static or literal dynamic ESM imports instead.')
        }
      }
    }

    if (node.type === 'ImportExpression') {
      const moduleSource = literalString(node.source as AstNode)
      if (moduleSource === undefined) {
        add('SKILL_RUNTIME_DYNAMIC_IMPORT', `runtime module "${file.path}" must use a literal dynamic import path`, 'Use a literal node: built-in or relative .mjs import path.')
      } else {
        inspectSource(moduleSource)
        if (moduleSource === 'node:child_process') {
          add('SKILL_RUNTIME_SHELL_EXEC', `runtime module "${file.path}" must not dynamically import child_process APIs`, 'Use a static child_process import whose shell behavior can be validated.')
        }
        if (moduleSource === 'node:module') {
          add('SKILL_RUNTIME_COMMONJS', `runtime module "${file.path}" must not dynamically import node:module`, 'Use static or literal dynamic ESM imports instead.')
        }
      }
    }

    if (node.type === 'MemberExpression'
      && (memberName(node) === 'exec' || memberName(node) === 'execSync')
      && (node.object as AstNode).type === 'Identifier'
      && childProcessNamespaces.has(((node.object as AstNode).name as string))) {
      add('SKILL_RUNTIME_SHELL_EXEC', `runtime module "${file.path}" must not use child_process exec APIs`, 'Remove shell execution from the skill runtime module.')
    }

    if (node.type === 'MemberExpression'
      && memberName(node) === 'createRequire'
      && (node.object as AstNode).type === 'Identifier'
      && nodeModuleNamespaces.has(((node.object as AstNode).name as string))) {
      add('SKILL_RUNTIME_COMMONJS', `runtime module "${file.path}" must not use createRequire`, 'Use static or literal dynamic ESM imports instead.')
    }

    if (node.type === 'CallExpression') {
      const callee = node.callee as AstNode
      if (callee.type === 'Identifier' && callee.name === 'require') {
        add('SKILL_RUNTIME_COMMONJS', `runtime module "${file.path}" must not use CommonJS require`, 'Use static or literal dynamic ESM imports instead.')
      }

      const directApi = callee.type === 'Identifier' ? childProcessCalls.get(callee.name as string) : undefined
      const namespaceApi = callee.type === 'MemberExpression'
        && ['spawn', 'spawnSync', 'execFile', 'execFileSync'].includes(memberName(callee) ?? '')
        && (callee.object as AstNode).type === 'Identifier'
        && childProcessNamespaces.has(((callee.object as AstNode).name as string))
        ? memberName(callee)
        : undefined
      const childProcessApi = directApi ?? namespaceApi
      const callArguments = node.arguments as AstNode[]
      if (childProcessApi !== undefined && [callArguments[1], callArguments[2]].some(objectEnablesShell)) {
        add('SKILL_RUNTIME_SHELL_EXEC', `runtime module "${file.path}" must not spawn a shell`, 'Remove shell: true from child_process spawn options.')
      }
    }
  })

  return diagnostics
}

interface MarkdownCodeFragment {
  readonly command: boolean
  readonly text: string
}

function markdownCodeFragments(source: string): MarkdownCodeFragment[] {
  const fragments: MarkdownCodeFragment[] = []
  const proseLines: string[] = []
  let fence: { readonly marker: string; readonly command: boolean; continuedCommand?: string } | undefined

  for (const line of source.split('\n')) {
    if (fence !== undefined) {
      if (line.trimStart().startsWith(fence.marker)) {
        if (fence.continuedCommand !== undefined) {
          fragments.push({ command: true, text: fence.continuedCommand })
        }
        fence = undefined
      } else if (fence.command) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('#') && (trimmed !== '' || fence.continuedCommand !== undefined)) {
          const continued = /\\\s*$/.test(trimmed)
          const part = continued ? trimmed.replace(/\\\s*$/, '').trimEnd() : trimmed
          const command = fence.continuedCommand === undefined ? part : `${fence.continuedCommand} ${part.trimStart()}`
          if (continued) fence.continuedCommand = command
          else {
            fragments.push({ command: true, text: command })
            delete fence.continuedCommand
          }
        }
      }
      proseLines.push('')
      continue
    }

    const opening = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/)
    if (opening !== null) {
      const marker = opening[1]
      const info = opening[2]
      if (marker === undefined || info === undefined) continue
      const language = info.trim().split(/\s+/, 1)[0]?.toLowerCase()
      fence = { marker, command: language !== undefined && SHELL_FENCE_LANGUAGES.has(language) }
      proseLines.push('')
      continue
    }
    proseLines.push(line)
  }

  const inline = proseLines.join('\n')
  for (const match of inline.matchAll(/(`+)([\s\S]*?)\1/g)) {
    const text = match[2]
    if (text !== undefined) fragments.push({ command: false, text })
  }
  return fragments
}

function commandText(fragment: string): string {
  return fragment.trim().replace(/^(?:[$#]|>)\s+/, '')
}

function mentionsBackendCode(command: string, scriptBasenames: ReadonlySet<string>): boolean {
  if ([...scriptBasenames].some((basename) => command.includes(basename))) return true
  if (/<resolved-[^<>]+>/.test(command)) return true
  if (!command.includes('/scripts/')) return false
  return command.includes('CLAUDE_PLUGIN_ROOT') || command.includes('PLUGIN_ROOT')
}

function isInlineCommandCandidate(command: string): boolean {
  const unquoted = command.replace(/^["']/, '')
  return /^(?:node|python|python3|bash|sh)\b/.test(unquoted)
    || /^(?:\$\{[A-Z][A-Z0-9_]*\}|\$[A-Z][A-Z0-9_]*)/.test(unquoted)
    || /^(?:\.\/|\/)/.test(unquoted)
}

function resolveScriptReference(scriptRoot: string, reference: string): string | undefined {
  const segments = scriptRoot.split('/')
  for (const segment of reference.split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') {
      if (segments.length === scriptRoot.split('/').length) return undefined
      segments.pop()
    } else {
      segments.push(segment)
    }
  }
  return segments.join('/')
}

function canonicalInvocation(input: ValidateSkillRuntimeInput, skill: string, command: string): string | undefined {
  // A bare `VAR="<resolved-name.mjs>"` declares the placeholder for later
  // indirect use (e.g. `node "$VAR" start`); it is an assignment, not an
  // executable position, so it carries the same `<resolved-...>` reference
  // this function otherwise recognizes only as a `node` script argument —
  // handle it directly rather than through the `node`-prefixed match below.
  const assignment = command.match(/^[A-Z_][A-Z0-9_]*="<resolved-([^<>]+)>"$/)
  if (assignment) {
    const name = assignment[1]
    return name === undefined || name === '' ? undefined : name
  }

  const stripped = command
    .replace(/^[A-Z_][A-Z0-9_]*=\$\(/, '')
    .replace(/^(?:[A-Z_][A-Z0-9_]*=(?:"[^"]*"|'[^']*'|[^\s]*)[ \t]+)*/, '')
  const match = stripped.match(/^node[ \t]+(?:"([^"\r\n]+)"|'([^'\r\n]+)'|([^\s"'`]+))(?=$|[ \t])/)
  const script = match?.[1] ?? match?.[2] ?? match?.[3]
  const isMjsPath = script !== undefined && script.endsWith('.mjs')
  const isResolvedPlaceholder = script !== undefined && /^<resolved-[^<>]+>$/.test(script)
  if (!isMjsPath && !isResolvedPlaceholder) return undefined
  const fullPrefix = `\${CLAUDE_PLUGIN_ROOT}/${input.skillsRoot}/${skill}/scripts/`
  const shortPrefix = '$SKILL/'
  let reference: string | undefined
  if (script.startsWith(fullPrefix)) {
    reference = script.slice(fullPrefix.length)
  } else if (script.startsWith(shortPrefix)) {
    reference = script.slice(shortPrefix.length)
  } else {
    // The pre-existing harness-neutral convention: prose resolves
    // `{resource:${skillsRoot}/${skill}/scripts/<name>.mjs}` relative to the
    // loaded document (mint renders that macro as a checked relative link),
    // then the invocation references the placeholder this yields,
    // `<resolved-<name>.mjs>`, instead of a literal `${CLAUDE_PLUGIN_ROOT}`
    // path. Canonical exactly when the name it carries is a real .mjs
    // script in this skill's scripts/ directory — resolveScriptReference
    // below still verifies that.
    const placeholderMatch = script.match(/^<resolved-([^<>]+)>$/)
    if (placeholderMatch?.[1] !== undefined) reference = placeholderMatch[1]
  }
  return reference === undefined || reference === '' ? undefined : reference
}

function inspectMarkdown(
  input: ValidateSkillRuntimeInput,
  file: SkillRuntimeFile,
  skill: string,
  filePaths: ReadonlySet<string>,
): MintDiagnostic[] {
  const scriptRoot = `${input.skillsRoot}/${skill}/scripts`
  const scriptBasenames = new Set(
    input.files
      .filter((candidate) => candidate.path.startsWith(`${scriptRoot}/`) && extension(candidate.path) === '.mjs')
      .map((candidate) => candidate.path.slice(candidate.path.lastIndexOf('/') + 1)),
  )
  const diagnostics: MintDiagnostic[] = []

  for (const fragment of markdownCodeFragments(Buffer.from(file.content).toString('utf8'))) {
    const command = commandText(fragment.text)
    if (command === '' || !mentionsBackendCode(command, scriptBasenames)) continue
    if (!fragment.command && !isInlineCommandCandidate(command)) continue

    const reference = canonicalInvocation(input, skill, command)
    if (reference === undefined) {
      diagnostics.push(diagnostic(
        input,
        file,
        'SKILL_RUNTIME_INVOCATION',
        `documented runtime invocation "${command}" must use the canonical node command`,
        `Use node \"\${CLAUDE_PLUGIN_ROOT}/${input.skillsRoot}/${skill}/scripts/<path>.mjs\".`,
      ))
      continue
    }

    const resolved = resolveScriptReference(scriptRoot, reference)
    const resolvesInThisSkill = resolved !== undefined && filePaths.has(resolved)
    // The resolved-placeholder convention's `{resource:...}` macro can point
    // at another skill's scripts/ directory (writing-plans documenting
    // subagent-driven-development's task-set.mjs, for example) — a bare
    // basename reference that doesn't resolve within this skill still counts
    // if it names a real .mjs script under some skill's scripts/ directory.
    const resolvesInAnotherSkill =
      !resolvesInThisSkill &&
      !reference.includes('/') &&
      [...filePaths].some((path) => path.startsWith(`${input.skillsRoot}/`) && path.endsWith(`/scripts/${reference}`))
    if (!resolvesInThisSkill && !resolvesInAnotherSkill) {
      diagnostics.push(diagnostic(
        input,
        file,
        'SKILL_RUNTIME_REFERENCE',
        `documented runtime invocation "${command}" must reference an existing .mjs script`,
        'Reference an existing .mjs script under this skill\'s scripts directory.',
      ))
    }
  }
  return diagnostics
}

export class SkillRuntimeError extends MintError {
  readonly diagnostics: readonly MintDiagnostic[]

  constructor(input: ValidateSkillRuntimeInput, diagnostics: readonly MintDiagnostic[]) {
    const first = diagnostics[0]!
    if (first.path === undefined) throw new TypeError('skill runtime diagnostics must identify a path')
    super({
      severity: 'error',
      code: 'SKILL_RUNTIME_INVALID',
      plugin: input.plugin,
      source: input.source,
      path: first.path,
      message: `skill runtime validation found ${diagnostics.length} violation${diagnostics.length === 1 ? '' : 's'}`,
      action: RUNTIME_ACTION,
    })
    this.name = 'SkillRuntimeError'
    this.diagnostics = diagnostics
  }
}

export function validateSkillRuntime(input: ValidateSkillRuntimeInput): SkillRuntimeReport {
  const skills = new Set(input.files.map((file) => skillName(file.path, input.skillsRoot)).filter((name): name is string => name !== undefined))
  const filePaths = new Set(input.files.map((file) => file.path as string))
  const diagnostics: MintDiagnostic[] = []
  let modules = 0

  for (const file of input.files) {
    const relative = skillRelativePath(file.path, input.skillsRoot)
    const skill = skillDirectory(file.path, input.skillsRoot)
    if (relative === undefined || skill === undefined || !skills.has(skill) || relative === 'SKILL.md' || relative.startsWith('examples/')) continue
    // A .d.mts/.d.ts/.d.cts sibling carries type declarations only — it
    // compiles to nothing and never executes, so it is not a runtime module
    // and is exempt from the .mjs/scripts/ contract the way .md prose is.
    if (isDeclarationFile(relative)) continue

    const fileExtension = extension(relative)
    const inScripts = relative.startsWith('scripts/')
    const code = (inScripts ? !NON_CODE_ASSET_EXTENSIONS.has(fileExtension) : CODE_EXTENSIONS.has(fileExtension))
      || file.executable
      || hasShebang(file.content)
    if (!code) continue

    modules += 1
    if (!inScripts) {
      diagnostics.push(diagnostic(input, file, 'SKILL_RUNTIME_LOCATION', `runtime module "${file.path}" must be under a skill's scripts directory`, 'Move the runtime module under scripts/ or remove it from the skill artifact.'))
    }
    if (fileExtension !== '.mjs') {
      diagnostics.push(diagnostic(input, file, 'SKILL_RUNTIME_LANGUAGE', `runtime module "${file.path}" must use the .mjs extension`, 'Convert the runtime module to .mjs.'))
    }
    if (file.executable) {
      diagnostics.push(diagnostic(input, file, 'SKILL_RUNTIME_EXECUTABLE', `runtime module "${file.path}" must not be executable`, 'Remove the executable mode from the runtime module.'))
    }
    if (hasShebang(file.content)) {
      diagnostics.push(diagnostic(input, file, 'SKILL_RUNTIME_SHEBANG', `runtime module "${file.path}" must not begin with a shebang`, 'Remove the shebang from the runtime module.'))
    }
    if (fileExtension === '.mjs') diagnostics.push(...inspectModule(input, file, skill, filePaths))
  }

  for (const file of input.files) {
    const relative = skillRelativePath(file.path, input.skillsRoot)
    const skill = skillDirectory(file.path, input.skillsRoot)
    if (relative === undefined || skill === undefined || !skills.has(skill) || relative.startsWith('examples/') || extension(relative) !== '.md') continue
    diagnostics.push(...inspectMarkdown(input, file, skill, filePaths))
  }

  diagnostics.sort((left, right) => compareArtifactPaths(left.path as ArtifactPath, right.path as ArtifactPath)
    || compareRawStrings(left.code, right.code)
    || compareRawStrings(left.message, right.message))
  return { skills: skills.size, modules, diagnostics, ok: diagnostics.length === 0 }
}

export function assertValidSkillRuntime(input: ValidateSkillRuntimeInput): SkillRuntimeReport {
  const report = validateSkillRuntime(input)
  if (!report.ok) throw new SkillRuntimeError(input, report.diagnostics)
  return report
}
