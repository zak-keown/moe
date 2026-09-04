import { describe, it } from 'vitest';
import { strict as assert } from 'node:assert';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createOverride } = require('../skills/browsing/host-override.js');

// CR-046: assigning a bare IPv6 literal to `URL#hostname` is a silent no-op
// per the WHATWG URL spec (the hostname must be bracketed, e.g. `[::1]`).
// `instanceRewriteWsUrl` did not bracket IPv6 hosts before assignment, so a
// `CHROME_WS_HOST=::1` override silently failed to rewrite the URL and
// returned it looking successfully rewritten but still pointing at whatever
// host Chrome itself reported.
describe('host-override instanceRewriteWsUrl IPv6 handling', () => {
  it('rewrites the host to a bracketed IPv6 literal', () => {
    const override = createOverride({ host: '::1', port: 9222 });
    const rewritten = override.rewriteWsUrl(
      'ws://localhost:9222/devtools/browser/abc-123',
      override.getHost(),
      override.getPort()
    );
    const url = new URL(rewritten);
    assert.equal(url.hostname, '[::1]');
    assert.equal(url.host, '[::1]:9222');
  });

  it('leaves ordinary hostnames unbracketed', () => {
    const override = createOverride({ host: '127.0.0.1', port: 9222 });
    const rewritten = override.rewriteWsUrl(
      'ws://localhost:9222/devtools/browser/abc-123',
      override.getHost(),
      override.getPort()
    );
    const url = new URL(rewritten);
    assert.equal(url.hostname, '127.0.0.1');
  });
});
