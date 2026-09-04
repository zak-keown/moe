/**
 * `startFetchServer` must bind loopback-only, matching its sibling
 * `startMockWsServer` in the same file — see CR-039. The daemon it stands in
 * for has no auth on any HTTP route (`src/qa/config.ts`'s `AppConfig.host`
 * doc comment), so a test helper that serves unauthenticated fixtures must
 * not default to listening on all interfaces.
 *
 * `@hono/node-server`'s `serve()` forwards straight to `net.Server.prototype
 * .listen(port, hostname, cb)` (`http.Server` does not override `listen`),
 * so spying on that shared prototype method is the most direct seam to
 * observe which hostname was actually requested — the same argument Node
 * itself uses to decide `::`/`0.0.0.0` vs `127.0.0.1`.
 */
import { Server as NetServer } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { startFetchServer } from "./mock-http.js";

describe("startFetchServer", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("binds to loopback only, matching startMockWsServer", async () => {
    const listenSpy = vi.spyOn(NetServer.prototype, "listen");

    const mock = await startFetchServer(() => new Response("ok"));
    try {
      const call = listenSpy.mock.calls.find((args) => args[0] === mock.port);
      expect(call).toBeDefined();
      expect(call?.[1]).toBe("127.0.0.1");
    } finally {
      await mock.stop();
    }
  });
});
