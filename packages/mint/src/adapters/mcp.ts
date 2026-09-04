/**
 * STAGED SEED — not wired into generation (as of v0.2.1).
 *
 * These helpers are imported only by test/adapters/mcp.test.ts. The pipeline
 * emits MCP config inline: cursor.ts writes model.mcp to .cursor-plugin/mcp.json
 * and claude-code.ts points the manifest at the source .mcp.json — neither
 * routes through this module.
 *
 * `emitCodexMcp` is the deliberate seed for 0.3.0 item H1 (BL-f4dac1becd):
 * wiring Codex MCP emission into adapters/codex.ts. Kept and tested ahead of
 * that work on purpose. Its green test attests the emitter's shape, not that
 * the pipeline uses it. Do not delete before H1 resolves its fate
 * (BL-3fdd56ee5a).
 */
import type { PluginModel } from '../model.js'

export interface NormalizedMcpServer {
  name: string
  command: string
  args: readonly string[]
  cwd: '.'
  forwardEnv: readonly string[]
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export function normalizeMcpServers(model: PluginModel): NormalizedMcpServer[] {
  const mcp = model.mcp
  if (mcp === undefined || !isPlainObject(mcp)) return []
  const servers = mcp.mcpServers
  if (!isPlainObject(servers)) return []
  return Object.entries(servers).map(([name, raw]) => {
    if (!isPlainObject(raw)) {
      throw new Error(`mcp server "${name}" is not an object`)
    }
    return {
      name,
      command: typeof raw.command === 'string' ? raw.command : 'node',
      args: Array.isArray(raw.args) ? (raw.args as string[]) : [],
      cwd: '.' as const,
      forwardEnv: Array.isArray(raw.env_vars) ? (raw.env_vars as string[]) : [],
    }
  })
}

export function emitClaudeMcp(servers: NormalizedMcpServer[]): Record<string, unknown> {
  const mcpServers: Record<string, unknown> = {}
  for (const server of servers) {
    const entry: Record<string, unknown> = {
      command: server.command,
      args: [...server.args],
      cwd: server.cwd,
    }
    if (server.forwardEnv.length > 0) {
      entry.env_vars = [...server.forwardEnv]
    }
    mcpServers[server.name] = entry
  }
  return { mcpServers }
}

export function emitCodexMcp(servers: NormalizedMcpServer[]): Record<string, unknown> {
  const mcpServers: Record<string, unknown> = {}
  for (const server of servers) {
    const entry: Record<string, unknown> = {
      command: server.command,
      args: [...server.args],
      cwd: server.cwd,
    }
    mcpServers[server.name] = entry
  }
  return { mcpServers }
}
