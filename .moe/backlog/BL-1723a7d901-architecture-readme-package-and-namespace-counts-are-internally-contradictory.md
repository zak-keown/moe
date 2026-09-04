---
id: BL-1723a7d901
title: ARCHITECTURE/README package and namespace counts are internally contradictory
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
tags: docs
---

## Context

ARCHITECTURE.md says "nine source packages / seven namespaces" but its own section 8 lists eight namespaces, and 11 package dirs exist; section 3 omits jig-graph and statusline. README omits the jig namespace (bin/moe.js fronts it) and three packages.

**Done:** truth the counts and add the missing packages/namespaces. Unguarded prose.

Source: promise-hunt audit #11, main @ 64304930. Target: v0.2.1 (D1).
