---
id: BL-2ff666d13d
title: mint support matrix renders rules/variables columns that nothing can author
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
tags: mint, dead-code
---

## Context

packages/mint/src/adapters/types.ts ComponentSupport.rules/variables are rendered as columns by matrix.ts renderSupportMatrix into support-matrix.md, but every adapter sets both to 'none', and they are absent from model.ts, config.ts, platform/schema.ts, and every mint yaml -- impossible to author, always 'none'.

**Done:** drop the two columns, or document them as reserved.

Source: promise-hunt audit #9, main @ 64304930. Target: v0.2.1.
