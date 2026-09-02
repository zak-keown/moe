import { describe, it } from 'vitest';
import { strict as assert } from 'node:assert';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { WebSocketClient } = require('../../skills/browsing/lib/websocket-client.js');

// CR-066: connect() used to settle only from req.on('upgrade') (resolve) or
// req.on('error') (reject) — no 'response' handler and no timeout. An
// endpoint that answers the upgrade request with an ordinary HTTP response
// (stale/wrong port now owned by something else, a proxy, a wedged Chrome)
// left the promise pending forever.

function withHttpServer(requestHandler, fn) {
  return new Promise((resolve, reject) => {
    const server = createHttpServer(requestHandler);
    server.listen(0, '127.0.0.1', async () => {
      const { port } = server.address();
      try {
        await fn(port);
        resolve();
      } catch (e) {
        reject(e);
      } finally {
        server.close();
      }
    });
  });
}

function withSilentTcpServer(fn) {
  return new Promise((resolve, reject) => {
    // Accepts the TCP connection but never writes anything back — neither
    // an HTTP response nor an upgrade. Models a wedged/hung endpoint.
    const server = createNetServer((socket) => {
      // deliberately do nothing with the socket
      void socket;
    });
    server.listen(0, '127.0.0.1', async () => {
      const { port } = server.address();
      try {
        await fn(port);
        resolve();
      } catch (e) {
        reject(e);
      } finally {
        server.close();
      }
    });
  });
}

describe('websocket-client handshake (CR-066)', () => {
  it('rejects (does not hang) when the endpoint answers with a plain HTTP 200', async () => {
    await withHttpServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('not a websocket server');
    }, async (port) => {
      const ws = new WebSocketClient(`ws://127.0.0.1:${port}/devtools/browser/x`);
      await assert.rejects(
        () => ws.connect(2000),
        /HTTP 200|responded with/i,
      );
    });
  });

  it('rejects (does not hang) when the endpoint answers with HTTP 403', async () => {
    await withHttpServer((_req, res) => {
      res.writeHead(403);
      res.end();
    }, async (port) => {
      const ws = new WebSocketClient(`ws://127.0.0.1:${port}/devtools/browser/x`);
      await assert.rejects(
        () => ws.connect(2000),
        /403/,
      );
    });
  });

  it('rejects after the connect timeout when the endpoint never responds at all', async () => {
    await withSilentTcpServer(async (port) => {
      const ws = new WebSocketClient(`ws://127.0.0.1:${port}/devtools/browser/x`);
      const start = Date.now();
      await assert.rejects(
        () => ws.connect(300), // short timeout for a fast test
        /timed out/i,
      );
      const elapsed = Date.now() - start;
      assert.ok(elapsed < 5000, `must not hang well past its own timeout (took ${elapsed}ms)`);
    });
  });

  it('rejects when the server upgrades but with the wrong Sec-WebSocket-Accept', async () => {
    await new Promise((resolvePromise, rejectPromise) => {
      const server = createHttpServer();
      server.on('upgrade', (req, socket) => {
        // A conforming server would compute this from the client's
        // Sec-WebSocket-Key; send an obviously wrong value instead.
        socket.write(
          'HTTP/1.1 101 Switching Protocols\r\n' +
          'Upgrade: websocket\r\n' +
          'Connection: Upgrade\r\n' +
          'Sec-WebSocket-Accept: not-the-real-value==\r\n' +
          '\r\n'
        );
      });
      server.listen(0, '127.0.0.1', async () => {
        const { port } = server.address();
        try {
          const ws = new WebSocketClient(`ws://127.0.0.1:${port}/devtools/browser/x`);
          await assert.rejects(() => ws.connect(2000), /Sec-WebSocket-Accept mismatch/i);
          resolvePromise();
        } catch (e) {
          rejectPromise(e);
        } finally {
          server.close();
        }
      });
    });
  });

  it('still resolves normally against a real, correct WebSocket upgrade', async () => {
    await new Promise((resolvePromise, rejectPromise) => {
      const crypto = require('crypto');
      const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
      const server = createHttpServer();
      server.on('upgrade', (req, socket) => {
        const key = req.headers['sec-websocket-key'];
        const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
        socket.write(
          'HTTP/1.1 101 Switching Protocols\r\n' +
          'Upgrade: websocket\r\n' +
          'Connection: Upgrade\r\n' +
          `Sec-WebSocket-Accept: ${accept}\r\n` +
          '\r\n'
        );
      });
      server.listen(0, '127.0.0.1', async () => {
        const { port } = server.address();
        try {
          const ws = new WebSocketClient(`ws://127.0.0.1:${port}/devtools/browser/x`);
          await ws.connect(2000);
          assert.equal(ws.isConnected(), true);
          ws.close();
          resolvePromise();
        } catch (e) {
          rejectPromise(e);
        } finally {
          server.close();
        }
      });
    });
  });
});
