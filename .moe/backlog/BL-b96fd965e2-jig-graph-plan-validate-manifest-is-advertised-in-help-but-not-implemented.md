---
id: BL-b96fd965e2
title: jig-graph plan validate --manifest is advertised in --help but not implemented
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
tags: jig-graph, stub
---

## Context

packages/jig-graph/src/jig-extension.ts registers --manifest <path> ("Validate all plans listed in a MANIFEST.md"), but the body is: console.error("--manifest is not yet implemented"); return 1. The flag always errors.

**Done:** implement it -- validate every plan a MANIFEST lists -- with tests.

Source: promise-hunt audit #1, main @ 64304930. Target: v0.3.0 (F9).
