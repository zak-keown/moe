---
id: BL-f4dac1becd
title: Codex MCP emitter (emitCodexMcp) is fully built but never called
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
tags: mint, harness-parity, codex, mcp
---

## Context

emitCodexMcp in packages/mint/src/adapters/mcp.ts is a complete Codex MCP-config emitter, never invoked. adapters/codex.ts sets mcp: 'none' and pushes COMPONENT_OMITTED "mcp servers are not emitted for codex in v1". So memory/glass MCP never reaches Codex despite the emitter existing.

**Done:** ship it -- wire emitCodexMcp into the codex adapter, resolve the mcp.ts dead-code question, and fix the memory CODEX.md/yaml contradiction (its own item).

Source: promise-hunt audit #3, main @ 64304930. Target: v0.3.0 (H1).
