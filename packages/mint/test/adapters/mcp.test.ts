// Exercises the STAGED, unwired MCP-emit seed (src/adapters/mcp.ts). Green here
// attests the emitter's shape only; generation emits MCP inline. See H1 /
// BL-f4dac1becd for the wiring decision, BL-3fdd56ee5a for context.
import { describe, it, expect } from 'vitest'
import { normalizeMcpServers, emitClaudeMcp, emitCodexMcp } from '../../src/adapters/mcp.js'
import type { PluginModel } from '../../src/model.js'

const memoryMcp = {
  mcpServers: {
    'moe-memory': {
      command: 'node',
      args: ['./dist/cli.js', 'mcp-server'],
      cwd: '.',
      env_vars: ['MOE_MEMORY_CONFIG_DIR', 'MOE_MEMORY_DB_PATH'],
    },
  },
}

function modelWithMcp(mcp: unknown): PluginModel {
  return { mcp } as PluginModel
}

describe('normalizeMcpServers', () => {
  it('extracts server from Claude-shaped mcp', () => {
    const servers = normalizeMcpServers(modelWithMcp(memoryMcp))
    expect(servers).toHaveLength(1)
    expect(servers[0]).toEqual({
      name: 'moe-memory',
      command: 'node',
      args: ['./dist/cli.js', 'mcp-server'],
      cwd: '.',
      forwardEnv: ['MOE_MEMORY_CONFIG_DIR', 'MOE_MEMORY_DB_PATH'],
    })
  })

  it('returns empty for undefined mcp', () => {
    expect(normalizeMcpServers(modelWithMcp(undefined))).toEqual([])
  })
})

describe('emitClaudeMcp', () => {
  it('preserves env_vars as forwardEnv', () => {
    const servers = normalizeMcpServers(modelWithMcp(memoryMcp))
    const result = emitClaudeMcp(servers)
    expect(result).toEqual({
      mcpServers: {
        'moe-memory': {
          command: 'node',
          args: ['./dist/cli.js', 'mcp-server'],
          cwd: '.',
          env_vars: ['MOE_MEMORY_CONFIG_DIR', 'MOE_MEMORY_DB_PATH'],
        },
      },
    })
  })
})

describe('emitCodexMcp', () => {
  it('drops env_vars for Codex', () => {
    const servers = normalizeMcpServers(modelWithMcp(memoryMcp))
    const result = emitCodexMcp(servers)
    const entry = result.mcpServers as Record<string, Record<string, unknown>>
    expect(entry['moe-memory']).toEqual({
      command: 'node',
      args: ['./dist/cli.js', 'mcp-server'],
      cwd: '.',
    })
    expect(entry['moe-memory']!.env_vars).toBeUndefined()
    expect(entry['moe-memory']!.env).toBeUndefined()
  })
})
