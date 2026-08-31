import { describe, test, expect } from "vitest";

import { startMockWsServer } from "../../../helpers/mock-http.js";

import { createRequire } from "node:module";

// The CDP library under src/qa/adapters/web/lib/ is vendored CommonJS.
// Bun tolerated a bare `require()` in an ESM file; Node and vitest do
// not. Same fix as src/qa/adapters/web/adapter.ts.
const require = createRequire(import.meta.url);

const { WebSocketClient } = require("../../../../../src/qa/adapters/web/lib/websocket-client.js");

// Stand up a WebSocket server and capture the upgrade request's headers. We
// don't need a real CDP server - we only care about the upgrade headers.
//
// Was `Bun.serve`, whose `fetch` handler saw the upgrade request and which
// reported its own bound port for `port: 0`. `startMockWsServer` awaits
// `listening` before returning, which matters here: the client connects
// immediately and swallows connect errors, so a server that is not yet
// accepting turns into a hung test rather than a failure.
async function captureUpgradeHeaders(): Promise<{
  port: number;
  awaitHeaders: () => Promise<Headers>;
  shutdown: () => Promise<void>;
}> {
  let resolveHeaders: (h: Headers) => void = () => {};
  const headersPromise = new Promise<Headers>((r) => {
    resolveHeaders = r;
  });

  const server = await startMockWsServer({
    onUpgradeRequest(headers) {
      resolveHeaders(headers);
    },
  });

  return {
    port: server.port,
    awaitHeaders: () => headersPromise,
    shutdown: () => server.stop(),
  };
}

describe("websocket-client compression negotiation", () => {
  test("does not advertise permessage-deflate in the upgrade handshake", async () => {
    const srv = await captureUpgradeHeaders();
    try {
      const ws = new WebSocketClient(`ws://127.0.0.1:${srv.port}/test`);
      // Don't await connect — we only want the upgrade headers, and
      // closing afterwards keeps the test fast.
      ws.connect().catch(() => {});

      const headers = await srv.awaitHeaders();
      const ext = headers.get("sec-websocket-extensions") ?? "";

      // PRI-1690: Bun's global WebSocket negotiates permessage-deflate
      // by default, and Chrome's CDP sometimes sends frames Bun can't
      // decompress (code=1002, "Invalid compressed data") — slamming
      // the connection mid-run. The fix is to opt out of compression
      // entirely; this test pins that decision.
      expect(ext).not.toMatch(/permessage-deflate/i);

      try {
        ws.close();
      } catch {
        /* best-effort */
      }
    } finally {
      await srv.shutdown();
    }
  });
});
