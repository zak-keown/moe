import type { CodexSourceHookPolicy } from '../config.js'

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export function emitCodexHooks(sourceHooks: unknown, policy: CodexSourceHookPolicy): Record<string, unknown> {
  if (policy === 'disabled') return { hooks: {} }
  if (sourceHooks === undefined || !isPlainObject(sourceHooks)) return { hooks: {} }
  const hooks = sourceHooks.hooks
  if (!isPlainObject(hooks)) return { hooks: {} }
  const out: Record<string, unknown> = {}
  for (const [event, entries] of Object.entries(hooks)) {
    if (!Array.isArray(entries)) continue
    const filtered = entries.filter((entry) => {
      if (!isPlainObject(entry)) return false
      const hookList = entry.hooks
      if (!Array.isArray(hookList)) return false
      return hookList.every((h) => {
        if (!isPlainObject(h)) return false
        const cmd = typeof h.command === 'string' ? h.command : ''
        return !cmd.includes('bootstrap')
      })
    })
    if (filtered.length > 0) out[event] = filtered
  }
  return { hooks: out }
}

export const CODEX_DISABLED_HOOKS: Record<string, unknown> = Object.freeze({ hooks: {} })
