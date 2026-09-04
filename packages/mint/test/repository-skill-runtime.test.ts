import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolvePlatform } from '../src/platform/load.js'
import { inspectSkillRuntime } from '../src/artifact/assemble.js'

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..')

describe('repository skill runtime contract', () => {
  it('every registered plugin passes skill runtime validation with zero diagnostics', async () => {
    const platform = await resolvePlatform(REPO_ROOT)
    expect(platform.plugins.length).toBeGreaterThan(0)

    const failures: string[] = []
    for (const plugin of platform.plugins) {
      const report = await inspectSkillRuntime(plugin)
      for (const d of report.diagnostics) {
        failures.push(`${plugin.id}: ${d.code} ${d.path} — ${d.message}`)
      }
    }
    expect(failures).toEqual([])
  }, 30_000)

  it('core plugin has the highest module count', async () => {
    const platform = await resolvePlatform(REPO_ROOT)
    const reports = await Promise.all(
      platform.plugins.map(async (plugin) => ({
        id: plugin.id,
        report: await inspectSkillRuntime(plugin),
      })),
    )
    const core = reports.find((r) => r.id === 'moe')
    expect(core).toBeDefined()
    expect(core!.report.modules).toBeGreaterThan(0)
    expect(core!.report.skills).toBeGreaterThan(0)
  }, 30_000)
})
