---
id: BL-0f9d99223b
title: README/ARCHITECTURE present '8 harnesses' flatly while commands/mcp/hooks/agents are skills-only on most
status: open
reason: 
severity: medium
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
tags: docs, harness-parity
---

## Context

Only claude-code is certify-tier; the other seven are preview. commands/mcp/hooks/agents are 'none' on most non-Claude harnesses (see each packages/mint/src/adapters/*.ts support: block); memory's MCP server reaches only 4/8. This is honest at the machine level (mint yaml intents, INSTALL matrix, moe-install refusal, generated support-matrix.md) but invisible in README/ARCHITECTURE prose, and support-matrix.md Notes never warn that MCP plugins degrade.

**Done (doc half):** add the certify/preview tiering and an MCP-degradation note to README/ARCHITECTURE and to support-matrix.md Notes. Closing the actual gaps is a separate v0.3.0 effort (H1).

Source: promise-hunt audit #5, main @ 64304930. Target: v0.2.1 (D3).
