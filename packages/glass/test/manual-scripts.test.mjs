import { describe, it } from 'vitest';
import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// These exercise the standalone scripts in test/manual/ as documented in
// their own header comments (`node <script>`), by spawning them directly.
// test/manual/** is excluded from vitest's own collection (vitest.config.ts),
// but these scripts still need to at least *load* without crashing before a
// contributor with a live Chrome can use them — the bugs under test here
// (CR-052, CR-053) are both load-time failures that occur before any CDP
// connection is attempted, so no live Chrome is needed to catch them.

const __dirname = dirname(fileURLToPath(import.meta.url));
const MANUAL_DIR = join(__dirname, 'manual');

// CR-052: test-harness.js used `require()` while every other file in the
// same directory is CommonJS. Because packages/glass/package.json sets
// "type": "module", a plain .js file there loads as an ES module, where
// `require` is not defined — `node test-harness.js` failed immediately with
// ReferenceError, before any of the script's own logic ran. It also (like
// its .cjs siblings, CR-053) required its library dependency via a path
// resolved relative to test/manual/ instead of the package root.
describe('test/manual/test-harness.cjs (CR-052)', () => {
  it('loads and runs past both the ES-module and relative-path bugs (no live Chrome needed)', () => {
    const result = spawnSync(process.execPath, ['test-harness.cjs', '1'], {
      cwd: MANUAL_DIR,
      encoding: 'utf8',
      timeout: 10_000,
    });
    const output = `${result.stdout}\n${result.stderr}`;

    assert.doesNotMatch(
      output,
      /ReferenceError: require is not defined/,
      'must not fail with the ES-module require() bug (CR-052)'
    );
    assert.doesNotMatch(
      output,
      /Cannot find module '\.\/skills\/browsing\/chrome-ws-lib\.js'/,
      'must not fail to resolve chrome-ws-lib.js via the wrong relative depth (CR-053)'
    );
    // Proves the script got past both load-time bugs and reached its own
    // logic (which then fails gracefully — no Chrome is running here — inside
    // its own try/catch, rather than crashing on load).
    assert.match(output, /React Input Test Harness/, 'expected the script banner to print');
  });
});
