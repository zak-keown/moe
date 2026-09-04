---
id: BL-09e66c273d
title: flight documents video evidence that is never produced or rendered
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
tags: flight, stub
---

## Context

packages/flight/docs/format.md documents a video evidence field; the writer records screencast frames but never stitches them, and no UI renders it (ui/src/components/RunSummaryCard.tsx says so). The field is always absent.

**Done:** stitch frames into a video and render it in the UI, or remove the documented field. Decide -- do not leave it half-built.

Source: promise-hunt audit #8, main @ 64304930. Target: v0.3.0 (F8).
