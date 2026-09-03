#!/usr/bin/env node

/**
 * Self-test: assert the provenance-red fixture fails with the expected
 * structured diagnostic. Replaces the shell choreography in CI.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const result = spawnSync(
  process.execPath,
  ["scripts/check-provenance.mjs", "--json", "scripts/fixtures/provenance-red"],
  { encoding: "utf8" },
);

assert.equal(result.status, 1, `expected exit 1, got ${result.status}`);

const output = JSON.parse(result.stdout);
assert(
  output.diagnostics.some((item) => item.code === "LEGAL_PAYLOAD_MISSING"),
  `expected a LEGAL_PAYLOAD_MISSING diagnostic, got: ${JSON.stringify(output.diagnostics)}`,
);

console.log("provenance self-test: red fixture correctly rejected with LEGAL_PAYLOAD_MISSING");
