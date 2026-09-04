---
id: BL-248f2bf469
title: crew reads MOE_CREW_PI_PROVIDER but never documents it
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
tags: crew, docs
---

## Context

packages/crew/src/harness/pi.ts reads MOE_CREW_PI_PROVIDER; it is absent from cli.ts USAGE, the SKILL.md env table, and the README (its sibling MOE_CREW_PI_MODEL is documented). A shipped knob users cannot discover.

**Done:** document it alongside MOE_CREW_PI_MODEL.

Source: promise-hunt audit #15, main @ 64304930. Target: v0.2.1.
