/**
 * MOE-FLIGHT DIVERGENCE (added on import): a CommonJS copy of
 * `src/qa/util/pick-free-port.ts`, so this vendored subtree has no edge
 * out of itself.
 *
 * Upstream `chrome-process.js` did `require('../../../util/pick-free-port')`,
 * reaching from the vendored CJS lib into the package's TypeScript. Bun
 * resolved that (it loads `.ts` from `require`); Node does not, and under
 * vitest the file is never emitted, so the whole CDP library failed to
 * load. Duplicating 20 lines of `node:net` is the cheaper of the two
 * fixes — the alternative changes a vendored fork's function signature,
 * which is the thing docs/upstream-sync.md exists to avoid.
 */
const { createServer } = require('net');

function pickFreePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      if (addr && typeof addr === 'object') {
        const port = addr.port;
        srv.close(() => resolve(port));
      } else {
        srv.close();
        reject(new Error('unexpected address shape'));
      }
    });
  });
}

module.exports = { pickFreePort };
