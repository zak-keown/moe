---
id: BL-ab3955cad8
title: crew pi-extension carries a done 'tsup TODO' and claude-centric stop docs
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

packages/crew/src/pi-extension/index.ts says "tsup TODO (not yet applied)" but tsup.config.ts already builds ESM .mjs; skills/driving-claude-code-sessions/SKILL.md describes stop as a uniform /exit, while codex sends /quit with no session_end (stop.ts and harness/codex.ts).

**Done:** truth both.

Source: promise-hunt audit #19, main @ 64304930. Target: v0.2.1 (D5).
