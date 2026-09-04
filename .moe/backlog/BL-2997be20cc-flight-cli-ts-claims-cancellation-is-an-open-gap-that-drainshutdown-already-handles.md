---
id: BL-2997be20cc
title: flight cli.ts claims cancellation is an open gap that drainShutdown already handles
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
tags: flight, docs
---

## Context

packages/flight/src/cli.ts claims cancellation is an open gap, but src/qa/api/shutdown.ts drainShutdown cancels. Also noted (not scheduled here): qa/adapters/tui/adapter.ts hardcoded TUI_GRID {120,40}, and ui/src/App.tsx "TODO: a toast would be nicer".

**Done:** fix the stale comment.

Source: promise-hunt audit #20, main @ 64304930. Target: v0.2.1.
