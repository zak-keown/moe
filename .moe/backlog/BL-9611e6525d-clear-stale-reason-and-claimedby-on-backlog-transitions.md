---
id: BL-9611e6525d
title: clear stale reason and claimedBy on backlog transitions
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

The transition family (`backlogAccept`, `backlogResume`, `backlogDefer`) never
clears a stale `reason` or `claimedBy` when moving an item to a state where they
no longer apply. E.g. after `accept` promotes a `needs-triage` item to `open`,
the frontmatter still shows the raw unrecognized `reason` (e.g. `mystery`).

Not a spec violation — the schema says `reason` is "required unless status ∈
{open, in-progress, done}", i.e. not-required, not must-be-empty — and the
behavior is consistent across the existing module, so it was left as-is in v1.5.

**Done:** a whole-transition-family normalization pass that clears `reason` (and
`claimedBy` where appropriate) on transitions that invalidate them, with tests.
Decide the policy once and apply it uniformly.

Source: whole-branch review of backlog v1.5 (merge f27827aa) — see
`packages/jig/src/backlog.ts` `backlogAccept` / `backlogResume` / `backlogDefer`.
