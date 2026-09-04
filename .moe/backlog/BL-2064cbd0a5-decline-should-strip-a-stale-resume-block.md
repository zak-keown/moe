---
id: BL-2064cbd0a5
title: decline should strip a stale Resume block
status: open
reason: 
severity: low
source: code-review:backlog-v1.5-final
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
tags: backlog, jig
---

## Context

`backlogDecline` writes its note under `## Disposition` (v1.5) but does not
strip a pre-existing `## Resume` block. `backlogDefer` writes `## Resume` for
both `blocked` and `carry-over` targets, so a `blocked → decline` or
`carry-over → decline` path (e.g. an `upstream-decision` block later ruled
`wont-fix`) leaves a terminal `declined` record still advertising a resumption
thread — the exact thing the Disposition change set out to prevent.

Inert today: frontmatter `status: declined` is authoritative, lookups key off
frontmatter, and `backlogResume` refuses `declined`. Cosmetic, not correctness.

**Done:** `writeDisposition` strips any existing `## Resume` block before
appending (e.g. `body.replace(/\n*## Resume[\s\S]*$/m, "")`), plus a
`defer → decline` test in `packages/jig/test/backlog.test.ts`.

Source: whole-branch review of backlog v1.5 (merge f27827aa) — see
`packages/jig/src/backlog.ts` `writeDisposition` / `backlogDecline`.
