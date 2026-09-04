---
id: BL-7394064152
title: glass browsing-compat declares a chrome-ws bin pointing at a missing scripts/ dir
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
tags: glass, dead-code
---

## Context

packages/glass/browsing-compat/package.json sets bin chrome-ws to ./scripts/chrome-ws.mjs, but there is no scripts/ under browsing-compat/. Unpublished mirror; impact nil.

**Done:** remove the dead bin reference.

Source: promise-hunt audit #17, main @ 64304930. Target: v0.2.1.
