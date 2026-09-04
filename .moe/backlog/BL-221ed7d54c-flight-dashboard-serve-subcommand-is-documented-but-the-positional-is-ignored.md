---
id: BL-221ed7d54c
title: flight 'dashboard serve' subcommand is documented but the positional is ignored
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
tags: flight, docs
---

## Context

packages/flight/README.md shows "moe-flight dashboard serve"; dashboard/src/index.ts parses only flags and serves unconditionally -- "serve" (or any positional) is ignored. It works by accident.

**Done:** make it a real subcommand, or drop it from the docs.

Source: promise-hunt audit #14, main @ 64304930. Target: v0.2.1.
