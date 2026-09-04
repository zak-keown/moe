---
id: BL-5897265d07
title: update fixing-a-code-review SKILL.md to the BL-hex id format
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
tags: backlog, docs
---

## Context

`packages/core/skills/fixing-a-code-review/SKILL.md` (~line 124) still says
"Record the returned `BL-####`", stale against the v1.5 `BL-<10hex>` id shape.

Cosmetic only: `stamp-disposition.mjs` does not parse ids by digit-count, and
`BL-####` reads as placeholder notation. Out of scope for the jig-only v1.5
branch (no skill surface), hence a separate item.

**Done:** update the SKILL.md prose so the producer skill documents the
`BL-<hex>` format, then regenerate the 7 mirrored `/plugins/` copies via
`pnpm mint` (do NOT hand-edit `/plugins/`). Verify with `pnpm mint:check`.

Source: whole-branch review of backlog v1.5 (merge f27827aa).
