import { describe, it } from 'vitest';
import { strict as assert } from 'node:assert';
import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';

const require = createRequire(import.meta.url);
const { buildShimSource } = require('../../../browsing-compat/lib/page-scripts/permission-shim.js');

// Builds a jsdom window with a fake navigator.mediaDevices.getUserMedia,
// evaluates the real shim source in it (runScripts:'dangerously' + eval is
// the standard jsdom approach for page-side scripts — see
// page-scripts/dom-summary.test.mjs), and returns handles for driving both
// sides of the binding channel: the outgoing `window.__dialogShim` calls the
// shim makes (recorded), and the incoming `window.__dialogShim_resolve` the
// operator's resolve command would call.
function makePageWithShim({ secret = 'sess-secret', bindingAvailable = true } = {}) {
  const dom = new JSDOM('<html></html>', { runScripts: 'dangerously' });
  const { window } = dom;
  const originalCalls = [];
  window.navigator.mediaDevices = {
    getUserMedia: async (constraints) => {
      originalCalls.push(constraints);
      return 'FAKE_STREAM';
    },
  };
  const bindingCalls = [];
  if (bindingAvailable) {
    window.__dialogShim = (payloadJson) => { bindingCalls.push(JSON.parse(payloadJson)); };
  }
  window.eval(buildShimSource(secret));
  return { window, originalCalls, bindingCalls };
}

// Flush pending microtasks so promise reactions queued inside the shim
// (which are real Promises inside jsdom's realm) have a chance to settle.
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('page-scripts/permission-shim', () => {
  // CR-063: ask() used to call window[BINDING](...) unconditionally. When
  // the binding is absent from this execution context (observed on Chrome
  // 148+ per dialogs.smoke.test.mjs), that throws synchronously inside the
  // Promise executor, converting every wrapped API into an uncatchable-as-
  // permission TypeError instead of native behaviour.
  it('CR-063: falls back to native behaviour when the binding is unavailable, instead of throwing', async () => {
    const { window, originalCalls } = makePageWithShim({ bindingAvailable: false });
    assert.equal(typeof window.__dialogShim, 'undefined', 'binding must actually be absent for this test to mean anything');

    const stream = await window.navigator.mediaDevices.getUserMedia({ video: true });

    assert.equal(stream, 'FAKE_STREAM', 'must fail open to the original getUserMedia, not throw');
    assert.equal(originalCalls.length, 1);
  });

  it('normal flow: binding present, operator resolve with the correct secret grants access', async () => {
    const { window, bindingCalls, originalCalls } = makePageWithShim({ secret: 'sess-secret' });

    const p = window.navigator.mediaDevices.getUserMedia({ video: true });
    await flush();
    assert.equal(bindingCalls.length, 1, 'ask() should have called the binding once');
    const { id, secret } = bindingCalls[0];
    assert.equal(secret, 'sess-secret', 'outgoing request must carry the session secret');

    // The operator's real resolve command (see dialogs-router.js) supplies
    // the id, the decision, and the secret dialogs.js verified on the way in.
    window.__dialogShim_resolve(id, 'grant', 'sess-secret');

    const stream = await p;
    assert.equal(stream, 'FAKE_STREAM');
    assert.equal(originalCalls.length, 1);
  });

  // CR-064: the resolver is a plain global reachable from page script. A
  // page could grant itself its own pending request by guessing/observing
  // the sequential id: window.__dialogShim_resolve('1', 'grant'). The secret
  // (never exposed to the page) must make that a no-op.
  it('CR-064: page cannot resolve its own pending request without the secret', async () => {
    const { window, bindingCalls } = makePageWithShim({ secret: 'sess-secret' });

    const p = window.navigator.mediaDevices.getUserMedia({ video: true });
    await flush();
    const { id } = bindingCalls[0];

    let settled = false;
    p.then(() => { settled = true; }, () => { settled = true; });

    // The exact exploit shape from the report: no secret at all.
    window.__dialogShim_resolve(id, 'grant');
    await flush();
    assert.equal(settled, false, 'self-grant with no secret must be a no-op — the promise must still be pending');

    // A guessed/reused wrong secret must not work either.
    window.__dialogShim_resolve(id, 'grant', 'wrong-secret');
    await flush();
    assert.equal(settled, false, 'self-grant with the wrong secret must also be a no-op');

    // Sanity: the SAME id with the correct secret still works (proves the
    // pending entry was not incorrectly consumed/corrupted by the failed
    // attempts above).
    window.__dialogShim_resolve(id, 'grant', 'sess-secret');
    const stream = await p;
    assert.equal(stream, 'FAKE_STREAM');
  });

  it('CR-064: a secret minted for one page session does not resolve another session\'s request', async () => {
    const a = makePageWithShim({ secret: 'secret-a' });
    const b = makePageWithShim({ secret: 'secret-b' });

    const pa = a.window.navigator.mediaDevices.getUserMedia({ video: true });
    await flush();
    const idA = a.bindingCalls[0].id;

    let settled = false;
    pa.then(() => { settled = true; }, () => { settled = true; });

    // Session B's secret must not resolve session A's request, even for a
    // matching id — each page session's shim is independently keyed.
    a.window.__dialogShim_resolve(idA, 'grant', 'secret-b');
    await flush();
    assert.equal(settled, false, "a foreign session's secret must not resolve this session's request");

    a.window.__dialogShim_resolve(idA, 'grant', 'secret-a');
    const stream = await pa;
    assert.equal(stream, 'FAKE_STREAM');

    // b's own shim is untouched by any of the above.
    assert.equal(b.bindingCalls.length, 0);
  });
});
