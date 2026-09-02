import { connect } from "node:net";
import { describe, expect, test } from "vitest";
import { serve } from "../../../src/qa/runtime/serve.js";
import { pickFreePort } from "../../../src/qa/util/pick-free-port.js";

/**
 * `serve()` is a thin cross-runtime wrapper (Bun.serve / @hono/node-server).
 * It does NOT parse bodies, enforce size limits, or implement per-route
 * validation — those are caller concerns and the route handlers in src/api/
 * already have coverage for their 4xx/413 contracts in test/api/.
 *
 * The audit (item #6) called out "malformed JSON", "oversized payload",
 * and "mid-flight closed connections" as gaps. The first two don't belong
 * to serve.ts at all; the third does. This file pins the third.
 *
 * One other regression risk we considered: "fetch handler throws → server
 * keeps serving". We cannot pin that one in bun:test — Bun's unhandled-
 * error capture treats a server-side handler throw as a test failure
 * even when the underlying server is fine, so the test can't observe
 * the contract. In production, a route handler that throws is already
 * an evidence-bearing event (it shows up in normal `bun test` output);
 * a dedicated test here would be ceremonial.
 */
describe("runtime/serve error paths", () => {
  test("a client abort mid-request does not crash the server", async () => {
    const port = await pickFreePort();
    const server = serve({
      port,
      fetch: async (req) => {
        const url = new URL(req.url);
        if (url.pathname === "/slow") {
          // Long enough to be cancelled before completion.
          await new Promise((r) => setTimeout(r, 1000));
          return new Response("late");
        }
        return new Response("ok");
      },
    });
    try {
      const ac = new AbortController();
      const slowReq = fetch(`http://127.0.0.1:${port}/slow`, {
        signal: ac.signal,
      });
      // Abort after 50ms — well before the handler resolves.
      setTimeout(() => ac.abort(), 50);
      await expect(slowReq).rejects.toThrow();

      // A subsequent normal request must still complete.
      const followup = await fetch(`http://127.0.0.1:${port}/ok`);
      expect(followup.status).toBe(200);
      expect(await followup.text()).toBe("ok");
    } finally {
      await server.stop();
    }
  });

  test("CR-050: a malformed Host header on an upgrade request does not crash the process", async () => {
    const port = await pickFreePort();
    const server = serve({
      port,
      fetch: () => new Response("ok"),
      websocket: {
        upgrade: () => ({}),
        open: () => {},
        close: () => {},
      },
    });

    // Node's HTTP parser does not validate Host header syntax, so the
    // upgrade listener's `new URL(req.url, \`http://${host}\`)` can throw a
    // synchronous TypeError inside an event listener with nothing to
    // catch it. Register a temporary uncaughtException listener so this
    // test process survives the throw either way (Node's default handler
    // would otherwise tear the whole process down) while still letting
    // us observe whether the throw happened at all.
    const uncaught: unknown[] = [];
    const onUncaught = (err: unknown) => {
      uncaught.push(err);
    };
    process.on("uncaughtException", onUncaught);

    try {
      const socket = connect(port, "127.0.0.1");
      await new Promise<void>((resolve, reject) => {
        socket.once("connect", resolve);
        socket.once("error", reject);
      });
      socket.write(
        "GET /api/ws HTTP/1.1\r\n" +
          "Host: [\r\n" +
          "Upgrade: websocket\r\n" +
          "Connection: Upgrade\r\n" +
          "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n" +
          "Sec-WebSocket-Version: 13\r\n" +
          "\r\n",
      );
      await new Promise((r) => setTimeout(r, 100));
      socket.destroy();

      expect(uncaught).toHaveLength(0);

      // The server (and its other in-flight runs) must still be alive —
      // an ordinary request after the malformed one must still succeed.
      const res = await fetch(`http://127.0.0.1:${port}/`);
      expect(res.status).toBe(200);
      expect(await res.text()).toBe("ok");
    } finally {
      process.removeListener("uncaughtException", onUncaught);
      // Pre-fix, the crashed upgrade handler leaves Node's internal
      // connection bookkeeping for the malformed socket in a state that
      // never lets httpServer.close() complete — server.stop() would
      // hang forever and take the whole suite down with it. Bound the
      // cleanup so a still-broken fix fails this test instead of hanging.
      await Promise.race([
        server.stop(),
        new Promise((resolve) => setTimeout(resolve, 1000)),
      ]);
    }
  });
});
