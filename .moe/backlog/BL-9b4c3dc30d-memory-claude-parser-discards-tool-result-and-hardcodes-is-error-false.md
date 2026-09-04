---
id: BL-9b4c3dc30d
title: memory Claude parser discards tool_result and hardcodes is_error=false
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
tags: memory, parser
---

## Context

packages/memory/src/parser.ts drops every tool_result in the Claude parser (the Codex parser matches call_id) and hardcodes isError:false throughout; the schema/types/db already carry the fields (types.ts, db.ts). So tool results and error state are captured for Codex only.

**Done:** populate tool_result and is_error Claude-side, then add a consumer in search.ts that uses error state (today it only counts tool names).

Source: promise-hunt audit #7, main @ 64304930. Target: v0.3.0 (F7).
