/**
 * HTTP + WebSocket server.
 *
 * `@hono/node-server` provides the HTTP layer (it accepts a standard
 * `Request -> Response` fetch callback) and the `ws` library handles the
 * upgrade. The two are stitched together via the underlying
 * `http.Server`'s `upgrade` event.
 *
 * Upstream this was a two-runtime shim with a `Bun.serve` branch. The Bun
 * branch is gone - see packages/flight/README.md - and the `idleTimeout` /
 * `wsIdleTimeoutSec` options it owned are now documented as no-ops rather
 * than silently dropped.
 */
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { serve as honoServe } from "@hono/node-server";
import { WebSocketServer } from "ws";

export interface WsLike {
  send(data: string): void;
  readyState: number;
  close(code?: number, reason?: string): void;
}

export interface WebsocketHooks<T> {
  /**
   * Decide whether an incoming request should upgrade to a WebSocket.
   * Return upgrade data to upgrade, or null to fall through to `fetch`.
   * Receives the parsed URL and request headers so callers can implement
   * Origin allowlists or other header-based gates. PRI-1483.
   */
  upgrade(url: URL, headers: Headers): T | null;
  open(ws: WsLike, data: T): void;
  close(ws: WsLike, data: T): void;
}

export interface ServeOptions<T = unknown> {
  port: number;
  /**
   * Accepted and ignored. Was `Bun.serve`'s per-connection idle timeout;
   * `@hono/node-server` has no equivalent knob, and Node's
   * `http.Server` defaults (no per-request idle close) are what the API
   * server has always wanted. Kept in the signature because
   * `MOE_FLIGHT_WS_IDLE_TIMEOUT_SEC` and the config surface still set it.
   */
  idleTimeout?: number | undefined;
  /**
   * Accepted and ignored, as above. Was Bun's `websocket.idleTimeout`
   * (PRI-1483). `ws` has no server-side idle timeout; closing idle
   * sockets is the broadcaster's job.
   */
  wsIdleTimeoutSec?: number | undefined;
  fetch(req: Request): Response | Promise<Response>;
  websocket?: WebsocketHooks<T> | undefined;
}

export interface RunningServer {
  stop(): Promise<void>;
}

export function serve<T extends object>(opts: ServeOptions<T>): RunningServer {
  return serveViaNode(opts);
}

function serveViaNode<T>(opts: ServeOptions<T>): RunningServer {
  const httpServer = honoServe({
    port: opts.port,
    fetch: (req) => opts.fetch(req as Request) as Response | Promise<Response>,
  });

  if (opts.websocket) {
    const hooks = opts.websocket;
    const wss = new WebSocketServer({ noServer: true });
    httpServer.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
      // The Host header is only needed to satisfy the URL constructor
      // (the upgrade hook decides on `url.pathname` / query / headers,
      // never on host) — use a fixed authority so a Host header Node's
      // parser accepts but WHATWG URL rejects as an illegal authority
      // (`[`, `%`, `a b`, ...) can't throw here. Node's HTTP parser does
      // not validate Host syntax, and this handler runs synchronously
      // inside the 'upgrade' event with nothing above it to catch a
      // throw, so an unhandled exception here previously crashed the
      // whole process (CR-050).
      let url: URL;
      try {
        url = new URL(req.url ?? "/", "http://localhost");
      } catch {
        socket.destroy();
        return;
      }
      // Translate Node's `req.headers` (Record<string, string|string[]>) into
      // a Headers object so the upgrade hook has the same shape on both runtimes.
      const headerMap = new Headers();
      for (const [k, v] of Object.entries(req.headers)) {
        if (Array.isArray(v)) for (const vv of v) headerMap.append(k, vv);
        else if (v !== undefined) headerMap.set(k, String(v));
      }
      const data = hooks.upgrade(url, headerMap);
      if (data === null) {
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        const wsLike = ws as unknown as WsLike;
        hooks.open(wsLike, data);
        ws.on("close", () => {
          hooks.close(wsLike, data);
        });
      });
    });
  }

  return {
    stop: () =>
      new Promise<void>((resolve, reject) => {
        httpServer.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
