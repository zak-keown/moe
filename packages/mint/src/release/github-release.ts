import { createReadStream } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { createHash } from 'node:crypto'
import { MintError } from '../diagnostics.js'

function releaseError(code: string, message: string, action: string, cause?: unknown): never {
  throw new MintError({
    severity: 'error',
    code,
    source: 'release store',
    message,
    action,
  }, { cause })
}

export interface ReleaseRef {
  id: number
  tag: string
  draft: boolean
  prerelease: boolean
}

export interface ReleaseAsset {
  name: string
  bytes: number
  apiUrl: string
  sha256?: string
}

export interface DraftReleaseInput {
  tag: string
  sourceSha: string
  title: string
}

export interface StableReleaseInput extends DraftReleaseInput {
  candidateTag: string
}

export interface ReleaseStorePort {
  findByTag(tag: string): Promise<ReleaseRef | undefined>
  createDraft(input: DraftReleaseInput): Promise<ReleaseRef>
  listAssets(release: ReleaseRef): Promise<readonly ReleaseAsset[]>
  uploadExact(release: ReleaseRef, file: string, sha256: string): Promise<void>
  download(release: ReleaseRef, asset: string, destination: string): Promise<void>
  finalize(release: ReleaseRef, channel: 'prerelease' | 'stable'): Promise<void>
  createStable(input: StableReleaseInput): Promise<ReleaseRef>
}

export interface GitHubReleaseAdapterOptions {
  owner: string
  repo: string
  token: () => Promise<string>
}

export class GitHubReleaseAdapter implements ReleaseStorePort {
  private readonly owner: string
  private readonly repo: string
  private readonly token: () => Promise<string>

  constructor(options: GitHubReleaseAdapterOptions) {
    this.owner = options.owner
    this.repo = options.repo
    this.token = options.token
  }

  private async headers(): Promise<Record<string, string>> {
    const token = await this.token()
    return {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    }
  }

  private apiUrl(path: string): string {
    return `https://api.github.com/repos/${this.owner}/${this.repo}${path}`
  }

  private toRef(data: Record<string, unknown>): ReleaseRef {
    return {
      id: data.id as number,
      tag: data.tag_name as string,
      draft: data.draft as boolean,
      prerelease: data.prerelease as boolean,
    }
  }

  async findByTag(tag: string): Promise<ReleaseRef | undefined> {
    const headers = await this.headers()
    const response = await fetch(this.apiUrl(`/releases/tags/${encodeURIComponent(tag)}`), { headers })
    if (response.status === 404) return undefined
    if (!response.ok) {
      releaseError('RELEASE_API_FAILED', `GitHub release lookup failed: ${response.status}`, 'Check repository permissions and API availability.')
    }
    return this.toRef(await response.json() as Record<string, unknown>)
  }

  async createDraft(input: DraftReleaseInput): Promise<ReleaseRef> {
    const headers = await this.headers()
    const response = await fetch(this.apiUrl('/releases'), {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tag_name: input.tag,
        target_commitish: input.sourceSha,
        name: input.title,
        draft: true,
        prerelease: true,
      }),
    })
    if (!response.ok) {
      releaseError('RELEASE_CREATE_FAILED', `GitHub draft creation failed: ${response.status}`, 'Check repository permissions.')
    }
    return this.toRef(await response.json() as Record<string, unknown>)
  }

  async listAssets(release: ReleaseRef): Promise<readonly ReleaseAsset[]> {
    const headers = await this.headers()
    const response = await fetch(this.apiUrl(`/releases/${release.id}/assets`), { headers })
    if (!response.ok) {
      releaseError('RELEASE_ASSETS_FAILED', `GitHub asset listing failed: ${response.status}`, 'Check repository permissions.')
    }
    const assets = await response.json() as { name: string; size: number; url: string }[]
    return assets.map((a) => ({
      name: a.name,
      bytes: a.size,
      apiUrl: a.url,
    }))
  }

  async uploadExact(release: ReleaseRef, file: string, expectedSha256: string): Promise<void> {
    const bytes = await readFile(file)
    const actualSha256 = createHash('sha256').update(bytes).digest('hex')
    if (actualSha256 !== expectedSha256) {
      releaseError('RELEASE_UPLOAD_INTEGRITY', `file "${basename(file)}" SHA-256 does not match expected digest`, 'Use exact verified bytes for upload.')
    }
    const headers = await this.headers()
    const uploadUrl = `https://uploads.github.com/repos/${this.owner}/${this.repo}/releases/${release.id}/assets?name=${encodeURIComponent(basename(file))}`
    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/octet-stream' },
      body: bytes,
    })
    if (!response.ok) {
      releaseError('RELEASE_UPLOAD_FAILED', `GitHub asset upload failed: ${response.status}`, 'Check repository permissions and file size limits.')
    }
  }

  async download(release: ReleaseRef, assetName: string, destination: string): Promise<void> {
    const assets = await this.listAssets(release)
    const asset = assets.find((a) => a.name === assetName)
    if (asset === undefined) {
      releaseError('RELEASE_ASSET_NOT_FOUND', `asset "${assetName}" not found in release "${release.tag}"`, 'Upload the asset before attempting to download it.')
    }
    const headers = await this.headers()
    const response = await fetch(asset.apiUrl, {
      headers: { ...headers, Accept: 'application/octet-stream' },
      redirect: 'follow',
    })
    if (!response.ok) {
      releaseError('RELEASE_DOWNLOAD_FAILED', `GitHub asset download failed: ${response.status}`, 'Check repository permissions.')
    }
    const buffer = Buffer.from(await response.arrayBuffer())
    const { writeFile } = await import('node:fs/promises')
    await writeFile(join(destination, assetName), buffer)
  }

  async finalize(release: ReleaseRef, channel: 'prerelease' | 'stable'): Promise<void> {
    const headers = await this.headers()
    const response = await fetch(this.apiUrl(`/releases/${release.id}`), {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        draft: false,
        prerelease: channel === 'prerelease',
      }),
    })
    if (!response.ok) {
      releaseError('RELEASE_FINALIZE_FAILED', `GitHub release finalization failed: ${response.status}`, 'Check repository permissions.')
    }
  }

  async createStable(input: StableReleaseInput): Promise<ReleaseRef> {
    const headers = await this.headers()
    const response = await fetch(this.apiUrl('/releases'), {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tag_name: input.tag,
        target_commitish: input.sourceSha,
        name: input.title,
        body: `Promoted from candidate ${input.candidateTag}`,
        draft: true,
        prerelease: false,
      }),
    })
    if (!response.ok) {
      releaseError('RELEASE_CREATE_FAILED', `GitHub stable release creation failed: ${response.status}`, 'Check repository permissions.')
    }
    return this.toRef(await response.json() as Record<string, unknown>)
  }
}
