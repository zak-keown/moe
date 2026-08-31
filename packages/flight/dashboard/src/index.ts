import { Server as HttpServer } from "node:http";
import { isAbsolute, join, resolve } from "node:path";
import { serve as honoServe } from "@hono/node-server";
import { loadGridManifest } from "./manifest.js";
import { createDashboard } from "./server.js";

// The dashboard entry point. Binds createDashboard's fetch handler to an HTTP
// server and starts the scanner loop. The read-only web dashboard and the e2e
// tests both go through here.
//
// The dashboard's only inputs are the filesystem: results/ and the grid manifest
// at `manifestPath`. It imports nothing from the harness.
//
// Was `Bun.serve`. `@hono/node-server` is the replacement — the same one
// packages/flight's own src/qa/runtime/serve.ts picks — which makes
// `startDashboard` async, because Node only knows the bound port after the
// 'listening' event and the tests launch on port 0.

export interface StartDashboardArgs {
  readonly port: number;
  readonly resultsRoot: string;
  readonly manifestPath: string;
}

export interface DashboardHandle {
  readonly port: number;
  stop(): Promise<void>;
}

export interface DashboardCliArgs {
  readonly resultsDir: string;
  readonly port: number;
  readonly manifestPath: string;
  readonly root: string;
}

// Parse argv (the part AFTER the script name). Flags: --results <dir> (default
// 'results'), --port <n> (default 8787), --root <repo> (default process.cwd()),
// --manifest <path> (default <results>/grid-manifest.json). Unknown flags are
// ignored. `cwd` is injectable for testability (defaults to process.cwd()).
export function parseArgs(argv: readonly string[], cwd: string = process.cwd()): DashboardCliArgs {
  let resultsDir = "results";
  let port = 8787;
  let root = cwd;
  let manifest: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--results") {
      resultsDir = argv[++i] ?? resultsDir;
    } else if (a === "--port") {
      const n = Number(argv[++i]);
      if (Number.isFinite(n)) port = n;
    } else if (a === "--root") {
      root = argv[++i] ?? root;
    } else if (a === "--manifest") {
      manifest = argv[++i];
    }
  }
  const defaultManifestPath = isAbsolute(resultsDir)
    ? join(resultsDir, "grid-manifest.json")
    : join(root, resultsDir, "grid-manifest.json");
  const manifestPath = manifest ?? defaultManifestPath;
  return { resultsDir, port, manifestPath, root };
}

export async function startDashboard(args: StartDashboardArgs): Promise<DashboardHandle> {
  // The grid manifest is the scenario × agent × credential × os eligibility
  // matrix; null when absent/malformed (a results-only board). Identity comes
  // from each run's verdict.json / phase.json, so the dashboard needs no
  // known-agent vocabulary.
  const manifest = loadGridManifest(args.manifestPath);
  const dash = createDashboard({
    resultsRoot: args.resultsRoot,
    manifest,
  });

  const listening = honoServe({ port: args.port, fetch: dash.fetch });
  // `honoServe` returns a union that includes Http2Server. We never ask for
  // HTTP/2, so narrow rather than cast — the timeout knobs below exist only on
  // node:http's Server and silently dropping them is the failure mode this
  // whole block is here to prevent.
  if (!(listening instanceof HttpServer)) {
    throw new Error("dashboard: expected a node:http server from @hono/node-server");
  }
  const server: HttpServer = listening;

  // THE LOAD-BEARING LINE. Upstream passed `idleTimeout: 0` to Bun.serve to
  // disable its 10s per-request idle timeout, because the GET /events SSE
  // stream is deliberately long-lived: with the default, a quiet connection is
  // killed and htmx reconnect-loops. Node's equivalent is not "no timeout" —
  // `requestTimeout` defaults to 300s and `timeout` to 0, so without this the
  // stream would look perfect for five minutes and then start flapping. The
  // stream's own ':keepalive' every ~5s mitigates but does not fix it.
  server.requestTimeout = 0;
  server.timeout = 0;

  const boundPort = await new Promise<number>((res, rej) => {
    server.once("error", rej);
    server.once("listening", () => {
      const addr = server.address();
      res(typeof addr === "object" && addr !== null ? addr.port : args.port);
    });
  });

  dash.startScanner();
  return {
    port: boundPort,
    stop: () =>
      new Promise<void>((res, rej) => {
        dash.stopScanner();
        server.closeAllConnections();
        server.close((err) => (err ? rej(err) : res()));
      }),
  };
}

/**
 * The `moe-flight dashboard` entry. Upstream this was a `main()` behind
 * `import.meta.main` (Bun-only) plus a `bin`; it is an exported function so
 * `packages/flight/src/cli.ts` can dispatch into it, which is how the three
 * upstream bins collapse into one. `src/bin.ts` keeps a standalone entry.
 *
 * `argv` is the part AFTER the subcommand, matching upstream's
 * `process.argv.slice(2)`.
 */
export async function runDashboardCli(argv: readonly string[]): Promise<void> {
  const cli = parseArgs(argv);
  const handle = await startDashboard({
    port: cli.port,
    // Resolve resultsDir against root (not cwd) so --root /repo always reads
    // results from /repo/results, whether or not --results was also given.
    resultsRoot: resolve(cli.root, cli.resultsDir),
    manifestPath: resolve(cli.manifestPath),
  });
  // Print the bound URL so the user knows where to point a browser.
  process.stdout.write(`dashboard: http://localhost:${handle.port}/\n`);
}
