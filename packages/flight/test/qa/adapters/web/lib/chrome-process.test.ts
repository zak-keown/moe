import { createRequire } from "node:module";
import net from "node:net";
import { afterEach, describe, expect, test, vi } from "vitest";

// The CDP library under src/qa/adapters/web/lib/ is vendored CommonJS.
// Bun tolerated a bare `require()` in an ESM file; Node and vitest do not.
// Same fix as src/qa/adapters/web/adapter.ts.
const require = createRequire(import.meta.url);

const { attachChromeProcess } = require(
  "../../../../../src/qa/adapters/web/lib/chrome-process.js",
);
const { createState } = require("../../../../../src/qa/adapters/web/lib/session-state.js");

// CR-031: killChrome() fell back to "kill whoever holds activePort" whenever
// state.chromeProcess was null — even when this session never confirmed it
// owns that port. createState() seeds activePort to the configured default
// (9222, or CHROME_WS_PORT) before any Chrome exists, so a startChrome()
// that threw before ever launching or reconnecting (Chrome binary missing,
// or the configured port already occupied by someone else) still left
// activePort at that same value. closeWebAdapter's error-path call to
// killChrome() would then SIGTERM whatever unrelated process — a
// developer's own Chrome on 9222, say — happened to be listening there.
describe("CR-031: killChrome only kills a port this session confirmed owning", () => {
  let server: net.Server | null = null;
  let killSpy: ReturnType<typeof vi.spyOn> | null = null;
  let prevChromeWsPort: string | undefined;

  afterEach(async () => {
    killSpy?.mockRestore();
    killSpy = null;
    if (server) {
      await new Promise<void>((resolve) => server?.close(() => resolve()));
      server = null;
    }
    if (prevChromeWsPort !== undefined) {
      process.env.CHROME_WS_PORT = prevChromeWsPort;
    } else {
      delete process.env.CHROME_WS_PORT;
    }
  });

  function listenOn(port: number): Promise<net.Server> {
    return new Promise((resolve, reject) => {
      const s = net.createServer();
      s.once("error", reject);
      s.listen(port, "127.0.0.1", () => resolve(s));
    });
  }

  function makeChromeProcess(state: unknown) {
    return attachChromeProcess({
      state,
      chromeHttp: async () => {
        throw new Error("no chrome listening");
      },
      getTabs: async () => [],
      newTab: async () => {},
      closeBridge: null,
    });
  }

  test("a never-confirmed activePort (startChrome never ran, or threw before confirming) is not signalled", async () => {
    const port = 19222;
    prevChromeWsPort = process.env.CHROME_WS_PORT;
    process.env.CHROME_WS_PORT = String(port);
    server = await listenOn(port);

    const state = createState();
    // Sanity: this is exactly the pre-launch seed the finding describes —
    // startChrome() never ran, so nothing has confirmed ownership of the
    // port yet.
    expect(state.activePort).toBe(port);
    expect(state.chromeProcess).toBeNull();

    killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);
    const { killChrome } = makeChromeProcess(state);
    await killChrome();

    // The actual security property: an unconfirmed port must never be
    // signalled. (state.activePortOwned itself is checked below too, so a
    // regression that removes the flag entirely still fails loudly.)
    expect(killSpy).not.toHaveBeenCalled();
    expect(state.activePortOwned).toBeFalsy();
  });

  test("a session that confirmed ownership (launched or reconnected) does signal the port holder", async () => {
    const port = 19223;
    server = await listenOn(port);

    const state = createState();
    // Simulates the post-startChrome() state after a confirmed launch or a
    // meta.json reconnect: both set activePort AND activePortOwned.
    state.activePort = port;
    state.activePortOwned = true;

    killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);
    const { killChrome } = makeChromeProcess(state);
    await killChrome();

    expect(killSpy).toHaveBeenCalled();
  });
});
