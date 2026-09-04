---
id: BL-3fdd56ee5a
title: mint adapters/mcp.ts is orphaned dead code kept green by its own test
status: open
reason: 
severity: medium
source: promise-hunt:2026-09-04
claimed_by: 
created: 2026-09-04
updated: 2026-09-04
filed_by: promise-hunt-audit
filed_sha: 4d108478
moved_by: 
moved_sha: 
blocked_by: 
blocks: 
parent: 
ref: 
tags: mint, dead-code
---

## Context

packages/mint/src/adapters/mcp.ts (normalizeMcpServers, emitClaudeMcp, emitCodexMcp) is imported only by test/adapters/mcp.test.ts; the pipeline emits MCP inline instead (adapters/claude-code.ts, adapters/cursor.ts). A green suite over code the pipeline never runs -- a false-green risk. Note: emitCodexMcp is the seed for shipping Codex MCP, so the decision belongs with that work.

**Done:** wire it as the single MCP-emit path, or delete the module and its test. Decide when shipping Codex MCP.

Source: promise-hunt audit #2, main @ 64304930. Target: v0.3.0 (tied to H1).
