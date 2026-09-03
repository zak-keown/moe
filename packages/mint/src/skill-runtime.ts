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

const CODE_EXTENSIONS = new Set(['.mjs', '.py', '.sh', '.bash', '.cjs', '.js', '.ts', '.cmd'])
const NODE_BUILTINS = new Set(builtinModules)

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
  if (node.type !== 'Property' || node.computed) return undefined
  const key = node.key as AstNode
  return key.type === 'Identifier' ? key.name as string : literalString(key)
}

function objectSetsShellTrue(node: AstNode | undefined): boolean {
  return node?.type === 'ObjectExpression' && (node.properties as unknown[]).some((property) => {
    if (!isAstNode(property) || propertyName(property) !== 'shell') return false
    const value = property.value as AstNode
    return value.type === 'Literal' && value.value === true
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
  if (source.startsWith('node:')) return NODE_BUILTINS.has(source.slice('node:'.length))
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
  return local?.type === 'Identifier' ? local.name as string : undefined
}

function memberName(node: AstNode): string | undefined {
  if (node.type !== 'MemberExpression' || node.computed) return undefined
  const property = node.property as AstNode
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
  const codes = new Set<string>()
  const scriptRoot = `${input.skillsRoot}/${skill}/scripts`
  const childProcessNamespaces = new Set<string>()
  const childProcessSpawns = new Set<string>()

  const add = (code: string, message: string, action: string) => {
    if (!codes.has(code)) diagnostics.push(diagnostic(input, file, code, message, action))
    codes.add(code)
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
    if (node.type !== 'ImportDeclaration' || literalString(node.source as AstNode) !== 'node:child_process') return
    for (const specifier of node.specifiers as AstNode[]) {
      const imported = importedName(specifier)
      const local = localName(specifier)
      if ((imported === 'exec' || imported === 'execSync') && local !== undefined) {
        add('SKILL_RUNTIME_SHELL_EXEC', `runtime module "${file.path}" must not use child_process exec APIs`, 'Remove shell execution from the skill runtime module.')
      }
      if ((imported === 'spawn' || imported === 'spawnSync') && local !== undefined) childProcessSpawns.add(local)
      if (specifier.type === 'ImportNamespaceSpecifier' && local !== undefined) childProcessNamespaces.add(local)
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
      if (moduleSource !== undefined) inspectSource(moduleSource)
    }

    if (node.type === 'ImportExpression') {
      const moduleSource = literalString(node.source as AstNode)
      if (moduleSource === undefined) {
        add('SKILL_RUNTIME_DYNAMIC_IMPORT', `runtime module "${file.path}" must use a literal dynamic import path`, 'Use a literal node: built-in or relative .mjs import path.')
      } else inspectSource(moduleSource)
    }

    if (node.type === 'CallExpression') {
      const callee = node.callee as AstNode
      if (callee.type === 'Identifier' && callee.name === 'require') {
        add('SKILL_RUNTIME_COMMONJS', `runtime module "${file.path}" must not use CommonJS require`, 'Use static or literal dynamic ESM imports instead.')
      }

      const namespaceExec = callee.type === 'MemberExpression'
        && (memberName(callee) === 'exec' || memberName(callee) === 'execSync')
        && (callee.object as AstNode).type === 'Identifier'
        && childProcessNamespaces.has(((callee.object as AstNode).name as string))
      if (namespaceExec) {
        add('SKILL_RUNTIME_SHELL_EXEC', `runtime module "${file.path}" must not use child_process exec APIs`, 'Remove shell execution from the skill runtime module.')
      }

      const directSpawn = callee.type === 'Identifier' && childProcessSpawns.has(callee.name as string)
      const namespaceSpawn = callee.type === 'MemberExpression'
        && (memberName(callee) === 'spawn' || memberName(callee) === 'spawnSync')
        && (callee.object as AstNode).type === 'Identifier'
        && childProcessNamespaces.has(((callee.object as AstNode).name as string))
      if ((directSpawn || namespaceSpawn) && objectSetsShellTrue((node.arguments as AstNode[])[2])) {
        add('SKILL_RUNTIME_SHELL_EXEC', `runtime module "${file.path}" must not spawn a shell`, 'Remove shell: true from child_process spawn options.')
      }
    }
  })

  return diagnostics
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

    const fileExtension = extension(relative)
    const inScripts = relative.startsWith('scripts/')
    const code = CODE_EXTENSIONS.has(fileExtension) || (inScripts && fileExtension === '') || file.executable || hasShebang(file.content)
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

  diagnostics.sort((left, right) => compareArtifactPaths(left.path as ArtifactPath, right.path as ArtifactPath) || left.code.localeCompare(right.code))
  return { skills: skills.size, modules, diagnostics, ok: diagnostics.length === 0 }
}

export function assertValidSkillRuntime(input: ValidateSkillRuntimeInput): SkillRuntimeReport {
  const report = validateSkillRuntime(input)
  if (!report.ok) throw new MintError(report.diagnostics[0]!)
  return report
}
