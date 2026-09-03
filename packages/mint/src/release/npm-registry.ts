import { spawn } from 'node:child_process'
import { MintError } from '../diagnostics.js'

function registryError(code: string, message: string, action: string, cause?: unknown): never {
  throw new MintError({
    severity: 'error',
    code,
    source: 'npm registry',
    message,
    action,
  }, { cause })
}

export interface NpmRegistryPort {
  preflight(packageName: string): Promise<void>
  inspectVersion(packageName: string, version: string): Promise<
    | { state: 'absent' }
    | { state: 'present'; integrity: string; distTags: readonly string[] }
  >
  publishTarball(path: string, tag: 'next'): Promise<void>
  setDistTag(packageName: string, version: string, tag: 'latest'): Promise<void>
  inspectDistTags(packageName: string): Promise<Readonly<Record<string, string>>>
}

export interface NpmCommandRunner {
  run(args: readonly string[]): Promise<{ stdout: string; exitCode: number }>
}

export class ProductionNpmRegistry implements NpmRegistryPort {
  private readonly runner: NpmCommandRunner

  constructor(runner: NpmCommandRunner) {
    this.runner = runner
  }

  async preflight(_packageName: string): Promise<void> {
    const result = await this.runner.run(['whoami'])
    if (result.exitCode !== 0) {
      registryError('NPM_AUTH_FAILED', 'npm authentication check failed', 'Configure npm credentials before publication.')
    }
  }

  async inspectVersion(packageName: string, version: string): Promise<
    | { state: 'absent' }
    | { state: 'present'; integrity: string; distTags: readonly string[] }
  > {
    const result = await this.runner.run(['view', `${packageName}@${version}`, '--json'])
    if (result.exitCode !== 0) {
      if (result.stdout.includes('E404') || result.stdout.includes('code 404')) {
        return { state: 'absent' }
      }
      registryError('NPM_INSPECT_FAILED', `npm inspect failed for ${packageName}@${version}`, 'Check npm registry availability.')
    }
    try {
      const data = JSON.parse(result.stdout) as Record<string, unknown>
      if (data.error) return { state: 'absent' }
      const integrity = data.dist && typeof data.dist === 'object' && 'integrity' in data.dist
        ? String((data.dist as Record<string, unknown>).integrity)
        : ''
      const distTags = data['dist-tags'] && typeof data['dist-tags'] === 'object'
        ? Object.entries(data['dist-tags'] as Record<string, string>)
          .filter(([, v]) => v === version)
          .map(([tag]) => tag)
        : []
      return { state: 'present', integrity, distTags }
    } catch {
      return { state: 'absent' }
    }
  }

  async publishTarball(path: string, tag: 'next'): Promise<void> {
    const result = await this.runner.run(['publish', path, '--tag', tag, '--provenance', '--access', 'public'])
    if (result.exitCode !== 0) {
      registryError('NPM_PUBLISH_FAILED', `npm publish failed for ${path}`, 'Check npm authentication and package configuration.')
    }
  }

  async setDistTag(packageName: string, version: string, tag: 'latest'): Promise<void> {
    const result = await this.runner.run(['dist-tag', 'add', `${packageName}@${version}`, tag])
    if (result.exitCode !== 0) {
      registryError('NPM_DIST_TAG_FAILED', `npm dist-tag failed for ${packageName}@${version}`, 'Check npm authentication.')
    }
  }

  async inspectDistTags(packageName: string): Promise<Readonly<Record<string, string>>> {
    const result = await this.runner.run(['view', packageName, 'dist-tags', '--json'])
    if (result.exitCode !== 0) {
      registryError('NPM_INSPECT_FAILED', `npm dist-tag inspect failed for ${packageName}`, 'Check npm registry availability.')
    }
    try {
      return JSON.parse(result.stdout) as Record<string, string>
    } catch {
      return {}
    }
  }
}

export function buildNpmCommandRunner(): NpmCommandRunner {
  return {
    async run(args: readonly string[]): Promise<{ stdout: string; exitCode: number }> {
      return new Promise((resolve, reject) => {
        const child = spawn('npm', [...args], {
          shell: false,
          stdio: ['ignore', 'pipe', 'pipe'],
          env: {
            ...process.env,
            NPM_CONFIG_UPDATE_NOTIFIER: 'false',
          },
        })
        let stdout = ''
        child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8') })
        child.stderr.on('data', () => {})
        child.once('error', (error) => reject(error))
        child.once('close', (exitCode) => resolve({ stdout, exitCode: exitCode ?? 1 }))
      })
    },
  }
}
