/**
 * Test-only HTTP / WebSocket servers.
 *
 * Upstream stood these up with `Bun.serve`, which is not available under
 * Node. Both helpers use the same libraries `src/qa/runtime/serve.ts`
 * already picks on the Node side — `@hono/node-server` for the fetch
 * surface and `ws` for upgrades — so the tests exercise the same stack
 * production does.
 *
 * `Bun.serve` reported its own assigned port for `port: 0`; neither
 * replacement does, so every caller picks a port first.
 */

import type { IncomingMessage, Server } from "node:http";
import { createServer } from "node:http";
import type { Duplex } from "node:stream";
import { serve as honoServe } from "@hono/node-server";
import type { WebSocket } from "ws";
import { WebSocketServer } from "ws";
import { pickFreePort } from "../../../src/qa/util/pick-free-port.js";

export interface MockServer {
  port: number;
  stop(): Promise<void>;
}

/** A plain fetch-style HTTP server on a free port. */
export async function startFetchServer(
  handler: (req: Request) => Response | Promise<Response>,
): Promise<MockServer> {
  const port = await pickFreePort();
  const server = honoServe({ port, fetch: (req) => handler(req as Request) });
  return {
    port,
    stop: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

export interface MockWsServerOptions {
  /** Handle non-upgrade requests. Return null for a 404. */
  http?(url: URL, req: IncomingMessage): { status?: number; json?: unknown; text?: string } | null;
  /**
   * Called with the upgrade request's headers before the handshake completes.
   * `Bun.serve` exposed these through its `fetch` handler; `ws` in `noServer`
   * mode hands us the raw `IncomingMessage` instead, so they are translated
   * to a `Headers` the same way src/qa/runtime/serve.ts does.
   */
  onUpgradeRequest?(headers: Headers, req: IncomingMessage): void;
  onMessage?(ws: WebSocket, raw: string): void;
  onOpen?(ws: WebSocket): void;
  onClose?(ws: WebSocket): void;
}

/**
 * An HTTP + WebSocket server on a free port, built on `node:http` plus
 * `ws` in `noServer` mode — the same stitching `serveViaNode` uses.
 * Unlike the production shim this exposes a `message` hook, which the
 * CDP mocks need.
 */
export async function startMockWsServer(opts: MockWsServerOptions): Promise<MockServer> {
  const port = await pickFreePort();
  const wss = new WebSocketServer({ noServer: true });
  const sockets = new Set<WebSocket>();

  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
    const reply = opts.http?.(url, req) ?? null;
    if (reply === null) {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("not found");
      return;
    }
    if (reply.json !== undefined) {
      res.writeHead(reply.status ?? 200, { "content-type": "application/json" });
      res.end(JSON.stringify(reply.json));
      return;
    }
    res.writeHead(reply.status ?? 200, { "content-type": "text/plain" });
    res.end(reply.text ?? "");
  });

  server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (opts.onUpgradeRequest) {
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) {
        if (Array.isArray(v)) for (const vv of v) headers.append(k, vv);
        else if (v !== undefined) headers.set(k, String(v));
      }
      opts.onUpgradeRequest(headers, req);
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      sockets.add(ws);
      opts.onOpen?.(ws);
      ws.on("message", (raw) => {
        opts.onMessage?.(ws, String(raw));
      });
      ws.on("close", () => {
        sockets.delete(ws);
        opts.onClose?.(ws);
      });
    });
  });

  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));

  return {
    port,
    stop: () =>
      new Promise<void>((resolve, reject) => {
        for (const ws of sockets) ws.terminate();
        wss.close();
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

/** `Bun.sleep` had no Node counterpart; this is the same contract. */
export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
