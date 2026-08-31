import { describe, test, expect } from "vitest";
import { startMockWsServer } from "../../../helpers/mock-http.js";

import { createRequire } from "node:module";

// The CDP library under src/qa/adapters/web/lib/ is vendored CommonJS.
// Bun tolerated a bare `require()` in an ESM file; Node and vitest do
// not. Same fix as src/qa/adapters/web/adapter.ts.
const require = createRequire(import.meta.url);

const { createBrowserSession } = require("../../../../../src/qa/adapters/web/lib/browser-session.js");

// A tiny WS server that speaks just enough CDP for the test -
// Browser.getVersion + on-demand close. Used to simulate Chrome's
// browser-WS dropping mid-session without needing a real Chrome process.
//
// Was `Bun.serve` upstream; `startMockWsServer` is the node:http + `ws`
// equivalent, which is also what src/qa/runtime/serve.ts uses on Node.
async function startMockChromeWS(): Promise<{
  port: number;
  chromeHttp: (path: string) => Promise<unknown>;
  rewriteWsUrl: (url: string) => string;
  closeNextSocket: () => void;
  shutdown: () => Promise<void>;
}> {
  let shouldCloseOnNextMessage = false;
  let port = 0;

  const server = await startMockWsServer({
    http(url) {
      if (url.pathname === "/json/version") {
        return {
          json: { webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/browser/test` },
        };
      }
      return null;
    },
    onMessage(ws, raw) {
      if (shouldCloseOnNextMessage) {
        shouldCloseOnNextMessage = false;
        ws.close();
        return;
      }
      const msg = JSON.parse(raw);
      // Echo a successful response for Browser.getVersion only.
      if (msg.method === "Browser.getVersion") {
        ws.send(JSON.stringify({ id: msg.id, result: { product: "MockChrome/0" } }));
      } else {
        ws.send(JSON.stringify({ id: msg.id, error: { message: `unhandled: ${msg.method}` } }));
      }
    },
  });
  port = server.port;

  return {
    port,
    chromeHttp: async (path: string) => {
      const res = await fetch(`http://127.0.0.1:${port}${path}`);
      return res.json();
    },
    rewriteWsUrl: (u: string) => u,
    // Tells the next inbound WS message to be answered with a close
    // instead of a normal response - simulates Chrome shutting the
    // socket on us.
    closeNextSocket: () => {
      shouldCloseOnNextMessage = true;
    },
    shutdown: () => server.stop(),
  };
}

describe("browser-session reconnect after WS close", () => {
  test("a send() after the WS drops lazy-reconnects instead of failing forever", async () => {
    const mock = await startMockChromeWS();
    const browser = createBrowserSession({
      host: "127.0.0.1",
      port: mock.port,
      rewriteWsUrl: mock.rewriteWsUrl,
      chromeHttp: mock.chromeHttp,
    });

    // First send: lazy-opens the WS, gets a normal response.
    const first = await browser.send("Browser.getVersion", {});
    expect(first.product).toBe("MockChrome/0");

    // Next send the server will drop the connection in response to,
    // simulating Chrome closing the browser-WS mid-session.
    mock.closeNextSocket();
    await expect(
      browser.send("Browser.getVersion", {}, { timeoutMs: 1000 }),
    ).rejects.toThrow();

    // Give the close handler a tick to settle.
    await new Promise((r) => setTimeout(r, 50));

    // The next send MUST lazy-reconnect rather than fail forever with
    // "WebSocket not connected". This is the PRI-1690 bug: the resolved
    // connectPromise short-circuits ensureConnected() so the new
    // connect never runs.
    const recovered = await browser.send("Browser.getVersion", {}, { timeoutMs: 2000 });
    expect(recovered.product).toBe("MockChrome/0");

    await browser.close();
    await mock.shutdown();
  });
});
