---
id: BL-d27de1c8f2
title: memory bootstraps remembering-conversations on cursor/kimi/pi where no search backend exists
status: open
reason: 
severity: high
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
tags: memory, harness-parity, skill
---

## Context

packages/memory/mint/moe-memory.yaml bootstraps remembering-conversations on cursor/kimi/pi, which declare neither mcp-registration nor agent-discovery; the SKILL.md names only the Task/search agent and MCP tools, never the "moe-memory search" CLI. So on those harnesses an auto-injected "You MUST search before saying you don't know" instruction has no reachable backend.

**Done:** teach the skill the "moe-memory search" CLI fallback, or stop bootstrapping it where no backend exists.

Source: promise-hunt audit #4, main @ 64304930. Target: v0.3.0 (H1).
