---
id: BL-46935c8fc8
title: memory docs and tests say Codex uses the MCP tool while the mint yaml says it does not
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
tags: memory, docs, harness-parity
---

## Context

packages/memory/docs/CODEX.md and the codex-e2e suite assert Codex uses the moe-memory MCP tool, but moe-memory.yaml gives codex [skill-discovery] only (agent-plugins-1.0 does list mcp-registration).

**Done (v0.2.1):** make the docs/tests match today's reality (no Codex MCP). The real fix -- shipping Codex MCP (H1) -- flips this the other way in v0.3.0.

Source: promise-hunt audit #13, main @ 64304930. Target: v0.2.1 doc / v0.3.0 code.
