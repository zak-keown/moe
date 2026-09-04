import { describe, it } from 'vitest';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// CR-051: dialogs.smoke.test.mjs's own block comment states plainly that
// "In Chrome 148+, Runtime.addBinding does not inject the binding function
// into page execution contexts ... this test cannot reliably pass" for the
// Notification.requestPermission test — but the test itself was a plain
// `it(...)`, with no `.skip`, version gate, or `it.todo`. Any contributor
// with a current Chrome who runs the opt-in `pnpm test:chrome` suite gets a
// guaranteed, unconditional failure unrelated to their change.
//
// dialogs.smoke.test.mjs itself only runs against a real, locally installed
// Chrome (it self-skips the whole file otherwise), so it can't assert on its
// own skip state in a Chrome-free environment. This lives in the Chrome-free
// `unit` project instead and checks the test's *declaration* — that it is
// registered via `it.skip(...)` — so CI (which never has Chrome) still
// guards against this regressing.
describe('dialogs.smoke.test.mjs hygiene (CR-051)', () => {
  const TITLE = 'Notification.requestPermission goes through shim — accept yields granted';

  it('declares the known Chrome 148+-incompatible test with it.skip(...)', () => {
    const source = readFileSync(join(__dirname, 'dialogs.smoke.test.mjs'), 'utf8');

    assert.ok(
      source.includes(`it.skip('${TITLE}'`),
      `expected dialogs.smoke.test.mjs to declare "${TITLE}" via it.skip(...) — ` +
        'its own comment says this test "cannot reliably pass" on Chrome 148+'
    );
    assert.ok(
      !source.includes(`it('${TITLE}'`),
      `"${TITLE}" must not also be declared via a plain it(...)`
    );
  });
});
