---
id: BL-d932811282
title: release candidate/promote/certify-claude --execute are stubbed; 0.2.0 must wire them before tagging
status: open
reason: 
severity: high
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
tags: mint, release
---

## Context

Corrects the earlier "npm tarballs omit the manifest" framing, which packed the wrong artifact (a raw "npm pack" of the packages/<pkg> workspace -- the old 0.1.x path -- not the mint-assembled tree).

The release orchestration is sound: packages/mint/src/release/candidate.ts prepareCandidate packs artifact.artifactRoot, and artifact/check.ts sets artifactRoot = plugins/<id> -- the COMPLETE generated tree, which carries .claude-plugin/plugin.json, LICENSE, NOTICE, dist, and all eight harness dirs (license-payload.ts writes LICENSE/NOTICE into that root). So once the orchestration runs, the published tarballs are complete and the install registers the using-moe SessionStart bootstrap.

The gap is wiring. On main, cli.ts "release candidate --execute" throws CANDIDATE_EXECUTE_NOT_WIRED, "release promote --execute" throws PROMOTE_EXECUTE_NOT_WIRED, and "release certify-claude --execute" throws CERTIFY_CLAUDE_EXECUTE_NOT_WIRED. publish.yml already invokes "mint release candidate --execute" on a v*-* tag, so a real publish today errors out loudly at that step -- nothing ships broken.

Note: the previously published @bubstack/moe-* 0.1.x tarballs were packed the old way and ARE incomplete (no top-level manifest, no LICENSE), so existing 0.1.x installs stay broken until 0.2.0 republishes the complete trees.

**Done:** 0.2.0 wires the three release --execute paths to prepareCandidate / promoteToStable / runClaudeMaintenance and tags a real candidate; then confirm a published tarball contains .claude-plugin/plugin.json, the reachable SessionStart bootstrap, LICENSE and NOTICE (artifact/check.ts already verifies file presence). Owned by the in-flight 0.2.0 release work. The remaining true gap -- an end-to-end "after install, the bootstrap actually fires" test for the non-memory plugins -- is tracked separately under robust e2e harness testing.

Source: packaging verification (this session), main @ 64304930.
