---
id: BL-e6e0a743f3
title: memory MCP-TOOLS.md says seven MCP tools while the server registers nine
status: open
reason: 
severity: low
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
tags: memory, docs
---

## Context

packages/memory/skills/remembering-conversations/MCP-TOOLS.md says "seven MCP tools"; src/mcp-server.ts registers nine, adding link_memories and trace_provenance (both db-backed and real).

**Done:** fix the count and document the two missing tools.

Source: promise-hunt audit #16, main @ 64304930. Target: v0.2.1 (D2).
