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

## Verified unblocked + small (docs check 2026-09-04)

The integration path exists — Codex loads plugin-shipped MCP servers, so this is
a genuine small change, not a research spike. Kept in 0.3.0 (H1) only because it
is a NEW user-facing capability and 0.2.1 is a no-new-capability patch; size was
never the reason.

Facts (from Codex plugin docs):
- A Codex plugin's `.codex-plugin/plugin.json` supports an `mcpServers` field:
  either a path string (`"mcpServers": "./.mcp.json"`) or an inline object
  (OpenAI codex PR #28580 added object-valued plugin MCP manifests).
- The `.mcp.json` wrapper key is `mcpServers` (camelCase), NOT `mcp_servers`
  (openai/codex issue #22105 was this exact docs bug). This is distinct from the
  GLOBAL `~/.codex/config.toml`, which uses `[mcp_servers.<name>]` (snake_case
  TOML) — the plugin path is JSON/camelCase.
- Tools register as `mcp__<server>__<tool>`.

Implementation notes for whoever ships H1:
- Template is `packages/mint/src/adapters/cursor.ts` almost verbatim: a
  `CODEX_MCP_PATH = '.codex-plugin/mcp.json'` (or `.mcp.json`) file plus the
  `plugin.json` `mcpServers` path reference. Replace the `COMPONENT_OMITTED`
  push in `codex.ts` `emit()`; flip `support.mcp: 'none' -> 'full'`; teach
  `platform/capabilities.ts` (the `mcp-registration` gate, `manifestPathSupports`
  check) about codex; complete the `installDoc` caveat; re-mint; add codex cases
  to `adapters/*` + capabilities tests.
- FIELD PRECISION: `emitCodexMcp` currently emits `command`/`args`/`cwd` and
  DROPS env. Codex `.mcp.json` stdio entries want `command`/`args`/`env`, so the
  memory server's env forwarding must be preserved — do not ship the emitter's
  current output blind (same class as issue #22105).
- Coupled with BL-46935c8fc8: shipping this makes the memory Codex-MCP docs
  CORRECT, so that item flips from "downgrade docs to admit no Codex MCP" to
  "give codex the mcp tier in moe-memory.yaml so reality matches the docs."
