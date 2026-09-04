---
id: BL-a959e92b57
title: jig-graph traceCalls/CallResult are exported but referenced only in test mocks
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
tags: jig-graph, dead-code
---

## Context

packages/jig-graph/src/moedex.ts traceCalls() and CallResult are used only by test mocks -- an orphaned MCP wrapper.

**Done:** remove them.

Source: promise-hunt audit #18, main @ 64304930. Target: v0.2.1.
