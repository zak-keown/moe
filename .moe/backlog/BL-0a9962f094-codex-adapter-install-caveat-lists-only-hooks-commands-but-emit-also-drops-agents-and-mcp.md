---
id: BL-0a9962f094
title: codex adapter install caveat lists only hooks/commands but emit() also drops agents and mcp
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
tags: mint, codex, docs
---

## Context

packages/mint/src/adapters/codex.ts installDoc caveat says only "Hooks and commands are not supported"; emit() also omits agents and mcp.

**Done:** complete the caveat list.

Source: promise-hunt audit #21, main @ 64304930. Target: v0.2.1 (D4).
