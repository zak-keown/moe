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

export function validateSkillRuntime(input: ValidateSkillRuntimeInput): SkillRuntimeReport {
  const skills = new Set(input.files.map((file) => skillName(file.path, input.skillsRoot)).filter((name): name is string => name !== undefined))
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
    } else if (fileExtension !== '.mjs') {
      diagnostics.push(diagnostic(input, file, 'SKILL_RUNTIME_LANGUAGE', `runtime module "${file.path}" must use the .mjs extension`, 'Convert the runtime module to .mjs.'))
    } else if (file.executable) {
      diagnostics.push(diagnostic(input, file, 'SKILL_RUNTIME_EXECUTABLE', `runtime module "${file.path}" must not be executable`, 'Remove the executable mode from the runtime module.'))
    } else if (hasShebang(file.content)) {
      diagnostics.push(diagnostic(input, file, 'SKILL_RUNTIME_SHEBANG', `runtime module "${file.path}" must not begin with a shebang`, 'Remove the shebang from the runtime module.'))
    }
  }

  diagnostics.sort((left, right) => compareArtifactPaths(left.path as ArtifactPath, right.path as ArtifactPath) || left.code.localeCompare(right.code))
  return { skills: skills.size, modules, diagnostics, ok: diagnostics.length === 0 }
}

export function assertValidSkillRuntime(input: ValidateSkillRuntimeInput): SkillRuntimeReport {
  const report = validateSkillRuntime(input)
  if (!report.ok) throw new MintError(report.diagnostics[0]!)
  return report
}
