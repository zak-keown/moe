---
id: BL-a3be0ddde5
title: glass auto-capture always writes a 'console logging not yet implemented' stub file
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
tags: glass, stub
---

## Context

packages/glass/skills/browsing/scripts/lib/capture.mjs always writes "# TODO: Console logging not yet implemented" (propagated through navigation.mjs and the dialog branches; mirrored in browsing-compat/lib/capture.js), yet the SKILL.md promises a {prefix}-console.txt on every DOM auto-capture. The interactive console API is already built (skills/browsing/scripts/lib/console-logging.mjs, src/index.ts).

**Done:** wire auto-capture to the existing CDP console path so the file carries real output.

Source: promise-hunt audit #6, main @ 64304930. Target: v0.3.0 (F6).
