---
id: BL-0e876bea7e
title: moe-handoff / moe-resume skill pair
status: open
reason: 
severity: high
source: backlog.md
claimed_by: 
created: 2026-09-04
updated: 2026-09-04
filed_by: manual
filed_sha: f27827aa
moved_by: 
moved_sha: 
blocked_by: 
blocks: 
parent: 
ref: 
tags: skill, backlog
---

## Context

Migrated from BACKLOG.md.

Skill pair: `moe-handoff` writes a `.continue-here` into `.moe/`, including the
state of Moe itself; `moe-resume` picks it up and continues.

Note: this is the driver/consumer the backlog v1.5 work anticipated. The
collision-free `BL-<hex>` ids shipped in v1.5 (merge f27827aa) were the stated
prerequisite for a resume driver that fetches items by id — that blocker is now
cleared.
