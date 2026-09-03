import type { NpmRegistryPort } from '../../src/release/npm-registry.js'

export function createFakeNpmRegistry(): NpmRegistryPort & {
  packages: Map<string, Map<string, { integrity: string; distTags: string[] }>>
  publishLog: string[]
  distTagLog: string[]
} {
  const packages = new Map<string, Map<string, { integrity: string; distTags: string[] }>>()
  const publishLog: string[] = []
  const distTagLog: string[] = []

  return {
    packages,
    publishLog,
    distTagLog,

    async preflight(_packageName: string): Promise<void> {},

    async inspectVersion(packageName: string, version: string) {
      const pkg = packages.get(packageName)
      if (pkg === undefined) return { state: 'absent' as const }
      const entry = pkg.get(version)
      if (entry === undefined) return { state: 'absent' as const }
      return { state: 'present' as const, integrity: entry.integrity, distTags: entry.distTags }
    },

    async publishTarball(path: string, _tag: 'next'): Promise<void> {
      publishLog.push(path)
    },

    async setDistTag(packageName: string, version: string, tag: 'latest'): Promise<void> {
      distTagLog.push(`${packageName}@${version} -> ${tag}`)
      const pkg = packages.get(packageName)
      if (pkg) {
        for (const entry of pkg.values()) {
          entry.distTags = entry.distTags.filter((t) => t !== tag)
        }
        const entry = pkg.get(version)
        if (entry) entry.distTags.push(tag)
      }
    },

    async inspectDistTags(packageName: string) {
      const pkg = packages.get(packageName)
      if (pkg === undefined) return {}
      const tags: Record<string, string> = {}
      for (const [version, entry] of pkg) {
        for (const tag of entry.distTags) {
          tags[tag] = version
        }
      }
      return tags
    },
  }
}
