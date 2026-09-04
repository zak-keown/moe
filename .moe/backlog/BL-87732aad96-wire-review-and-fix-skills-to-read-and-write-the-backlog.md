---
id: BL-87732aad96
title: Wire review and fix skills to read and write the backlog
status: open
reason: 
severity: medium
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

Change the codebase-review / fix skills to write to and use the new backlog.
v1.5 wired `fixing-a-code-review` as the first producer; this extends the pattern
to the remaining review/fix skills (e.g. `reviewing-a-codebase`) so findings land
durably in `.moe/backlog/` instead of review-scoped reports that die with the
worktree.
