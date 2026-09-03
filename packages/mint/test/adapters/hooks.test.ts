import { describe, it, expect } from 'vitest'
import { emitCodexHooks, CODEX_DISABLED_HOOKS } from '../../src/adapters/hooks.js'

const memorySourceHooks = {
  hooks: {
    SessionStart: [
      {
        matcher: 'startup|resume|clear',
        hooks: [
          {
            type: 'command',
            command: 'if [ -n "${PLUGIN_ROOT:-}" ]; then exit 0; fi; node "${CLAUDE_PLUGIN_ROOT}/dist/cli.js" sync --background',
          },
        ],
      },
    ],
  },
}

const bootstrapHooks = {
  hooks: {
    SessionStart: [
      {
        matcher: 'startup|resume|clear',
        hooks: [
          {
            type: 'command',
            command: '/path/to/bootstrap inject',
          },
        ],
      },
    ],
  },
}

describe('emitCodexHooks', () => {
  it('passes source hooks through when policy is source', () => {
    const result = emitCodexHooks(memorySourceHooks, 'source')
    expect(result.hooks).toBeDefined()
    const hooks = result.hooks as Record<string, unknown[]>
    expect(hooks.SessionStart).toHaveLength(1)
  })

  it('returns empty hooks when policy is disabled', () => {
    expect(emitCodexHooks(memorySourceHooks, 'disabled')).toEqual({ hooks: {} })
  })

  it('filters out bootstrap entries', () => {
    const result = emitCodexHooks(bootstrapHooks, 'source')
    const hooks = result.hooks as Record<string, unknown[]>
    expect(hooks.SessionStart).toBeUndefined()
  })

  it('returns empty hooks for undefined source', () => {
    expect(emitCodexHooks(undefined, 'source')).toEqual({ hooks: {} })
  })
})

describe('CODEX_DISABLED_HOOKS', () => {
  it('is a frozen empty hooks object', () => {
    expect(CODEX_DISABLED_HOOKS).toEqual({ hooks: {} })
    expect(Object.isFrozen(CODEX_DISABLED_HOOKS)).toBe(true)
  })
})
