---
id: BL-40d3f00a09
title: main CI is red: render-graphs.test.ts cannot produce the combined SVG
status: open
reason: 
severity: high
source: ci:main-red:2026-09-04
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
tags: core, testing, ci
---

## Context

The ci workflow is failing on main (runs at 64304930 and f27827aa). Failing test: packages/core/test/render-graphs.test.ts > render-graphs > "executes correctly through a symlink and preserves combined artifacts", with ENOENT on /tmp/render-graphs-*/fixture-skill; harmless/diagrams/fixture_skill_harmless_combined.svg -- the combined SVG is never written in the CI environment (likely a missing or misbehaving graphviz "dot", or a real regression in the combine step). It is not gated behind a runtime check, so it fails the whole test job rather than self-skipping.

**Done:** reproduce locally, decide whether it is a missing CI dependency or a real defect; then install the dependency in ci.yml, make the test self-skip when the renderer is absent (matching the tmux/Chrome pattern in AGENTS.md), or fix the combine step. A red main blocks a clean 0.2.x cut.

Source: gh run list --branch main (this session). Target: v0.2.1.
