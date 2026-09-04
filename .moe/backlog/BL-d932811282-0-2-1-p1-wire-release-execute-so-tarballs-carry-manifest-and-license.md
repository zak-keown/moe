---
id: BL-d932811282
title: 0.2.1 P1 -- wire release --execute paths so published tarballs carry the manifest and LICENSE
status: open
reason: 
severity: critical
source: packaging-verification:2026-09-04
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
tags: mint, release, 0.2.1, priority-1
---

## Context

0.2.1 priority 1. The release orchestration is correct but not invoked, and 0.2.0 ships without wiring it -- so 0.2.0's published install is incomplete and users get the broken shape.

Design (sound): packages/mint/src/release/candidate.ts prepareCandidate packs artifact.artifactRoot, and artifact/check.ts sets artifactRoot = plugins/<id> -- the COMPLETE generated tree, carrying .claude-plugin/plugin.json, LICENSE, NOTICE, dist, and all eight harness dirs (license-payload.ts writes LICENSE/NOTICE there). Run it and the published tarballs are complete and the using-moe SessionStart bootstrap registers.

Gap (wiring): on main, cli.ts "release candidate --execute" throws CANDIDATE_EXECUTE_NOT_WIRED, "release promote --execute" throws PROMOTE_EXECUTE_NOT_WIRED, and "release certify-claude --execute" throws CERTIFY_CLAUDE_EXECUTE_NOT_WIRED. publish.yml already calls "mint release candidate --execute" on a v*-* tag. Per the release owner, 0.2.0 ships before this wiring lands, so 0.2.0 publishes the incomplete raw-workspace tarballs (no top-level manifest, no LICENSE) -- the same broken shape as 0.1.x. This is the worst user-facing state in the release.

**Done:** wire the three release --execute paths to prepareCandidate / promoteToStable / runClaudeMaintenance; cut a v0.2.1 that republishes complete plugin trees. Confirm a published 0.2.1 tarball for every publishable plugin contains .claude-plugin/plugin.json, the reachable SessionStart bootstrap, LICENSE and NOTICE, for all eight harness manifest sets (artifact/check.ts already asserts file presence); pnpm provenance green. Residual (separate, 0.3.0): an end-to-end "after install the bootstrap fires" test for the non-memory plugins, under robust e2e harness testing (BL-3ce1956bb4).

Source: packaging verification (this session), main @ 64304930. Supersedes the earlier framing that this was 0.2.0's job; 0.2.0 ships without it, so it is 0.2.1 priority 1.
