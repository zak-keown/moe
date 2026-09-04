#!/usr/bin/env node

/**
 * Self-test for CR-069: check-provenance.mjs's documented contract is
 * `usage: check-provenance.mjs [--json] [root]` producing a controlled list
 * of `diagnostics` for any root — including one with no plugins/ directory
 * at all. checkPluginLicenses() previously called readdirSync(pluginsRoot)
 * with no try/catch, so a missing plugins/ directory crashed the whole
 * process with an uncaught ENOENT instead of a diagnostic. Assert the
 * process exits cleanly with parseable JSON and a diagnostic naming the
 * missing directory, never a stack trace on stderr.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const result = spawnSync(
  process.execPath,
  ["scripts/check-provenance.mjs", "--json", "scripts/fixtures/provenance-no-plugins"],
  { encoding: "utf8" },
);

assert.equal(
  result.stderr,
  "",
  `expected no stderr output (no crash / stack trace), got: ${result.stderr}`,
);
assert.equal(result.status, 1, `expected exit 1, got ${result.status}`);

const output = JSON.parse(result.stdout);
assert(
  output.diagnostics.some((item) => item.message.includes("plugins")),
  `expected a diagnostic naming the missing plugins directory, got: ${JSON.stringify(output.diagnostics)}`,
);

console.log("provenance self-test: missing plugins/ directory produces a diagnostic, not a crash");
