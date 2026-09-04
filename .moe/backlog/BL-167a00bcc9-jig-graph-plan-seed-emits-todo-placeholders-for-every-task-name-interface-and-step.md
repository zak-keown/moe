---
id: BL-167a00bcc9
title: jig-graph plan seed emits [TODO] placeholders for every task name, interface, and step
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
tags: jig-graph
---

## Context

packages/jig-graph/src/seed.ts emits "### Task N: [TODO: name]", "Consumes: [TODO]", "Produces: [TODO]", "Step 1: [TODO]". The file clustering and depends_on are graph-derived (real); the names/interfaces/steps are literal placeholders -- thin against "plan skeleton from the code graph".

**Done:** enrich names/interfaces from the graph rather than emitting TODOs.

Source: promise-hunt audit #12, main @ 64304930. Target: v0.3.0 (F9).
