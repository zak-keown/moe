#!/usr/bin/env node

/**
 * Self-test for CR-023: a nested `.moe/worktrees/<branch>/` checkout is a
 * real, gitignored, and documented part of this repo's parallel-work
 * protocol (AGENTS.md "Parallel work — the integration protocol"), and it
 * necessarily carries its own legitimately generated LICENSE, NOTICE, and
 * per-plugin LICENSE/NOTICE copies under its nested "plugins" directory.
 * checkCanonicalLegalFiles()'s "skip plugins" guard only matches paths
 * starting with the literal string "plugins/", so it never matches nested
 * paths like ".moe/worktrees/<branch>/plugins/...". Assert none of those
 * nested, legitimate legal-file copies are ever reported as stale.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const result = spawnSync(
  process.execPath,
  ["scripts/check-provenance.mjs", "--json", "scripts/fixtures/provenance-worktree"],
  { encoding: "utf8" },
);

const output = JSON.parse(result.stdout);
const worktreeDiagnostics = output.diagnostics.filter((item) => item.message.includes(".moe/worktrees"));

assert.equal(
  worktreeDiagnostics.length,
  0,
  `expected no diagnostics about the nested .moe/worktrees checkout, got: ${JSON.stringify(worktreeDiagnostics)}`,
);

console.log("provenance self-test: nested .moe/worktrees checkout is not misreported as a stale legal copy");
