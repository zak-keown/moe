import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

// The CDP library under src/qa/adapters/web/lib/ is vendored CommonJS.
// Bun tolerated a bare `require()` in an ESM file; Node and vitest do not.
// Same fix as src/qa/adapters/web/adapter.ts.
const require = createRequire(import.meta.url);

const CHROME_PROCESS_PATH = require.resolve(
  "../../../../../src/qa/adapters/web/lib/chrome-process.js",
);
const CHROME_LAUNCHER_HELPERS_PATH = require.resolve(
  "../../../../../src/qa/adapters/web/lib/chrome-launcher-helpers.js",
);
const SESSION_STATE_PATH = require.resolve(
  "../../../../../src/qa/adapters/web/lib/session-state.js",
);

type FakeProc = EventEmitter & { pid: number; unref: () => void };

// CR-011: trySpawnOn() (an internal helper inside chrome-process.js, reached
// only through startChrome()) calls `spawn(chromePath, args, {...})` and
// `proc.unref()`, then polls `isPortAlive()` — but never attaches
// `proc.on('error', ...)`. Per Node's child_process docs, spawn() can emit an
// asynchronous 'error' event for failures that only surface after the call
// returns (EACCES on a file that exists but isn't executable, the binary
// vanishing between the existsSync() check and the actual spawn(), resource
// exhaustion like EMFILE/EAGAIN, ...). An EventEmitter with no 'error'
// listener throws synchronously when 'error' is emitted, and an uncaught
// throw from a process-internal event tick crashes the whole host process —
// not just this one QA run.
//
// This test monkey-patches the real `child_process` and (chrome-process.js's
// sibling) `chrome-launcher-helpers` modules' own exports objects — the same
// singleton objects Node's `require()` cache returns everywhere in this
// process — so that chrome-process.js's own top-level
// `const { spawn } = require('child_process')` and
// `const { isPortAlive } = require('./chrome-launcher-helpers')` destructure
// our fakes instead of the real implementations. This only works if the
// patches land BEFORE chrome-process.js is required for the first time in
// this module registry, so every test below force-evicts chrome-process.js
// (and its already-cached exports/session-state) from `require.cache` and
// re-requires it fresh after patching.
describe("CR-011: trySpawnOn attaches an 'error' listener to the spawned Chrome process", () => {
  let cacheRoot: string;
  let originalXdg: string | undefined;
  let originalChromeWsPort: string | undefined;
  let cp: typeof import("node:child_process");
  let helpers: { isPortAlive: (...args: unknown[]) => Promise<boolean> };
  let fsMod: typeof import("node:fs");
  let realSpawn: typeof cp.spawn;
  let realExistsSync: typeof fsMod.existsSync;
  let realIsPortAlive: typeof helpers.isPortAlive;

  beforeEach(() => {
    cacheRoot = mkdtempSync(join(tmpdir(), "moe-flight-cr011-"));
    originalXdg = process.env.XDG_CACHE_HOME;
    process.env.XDG_CACHE_HOME = cacheRoot;
    originalChromeWsPort = process.env.CHROME_WS_PORT;
    delete process.env.CHROME_WS_PORT;

    // Evict any earlier cached copy so this test's patches are guaranteed to
    // be in place before chrome-process.js's own top-level require runs.
    delete require.cache[CHROME_PROCESS_PATH];
    delete require.cache[CHROME_LAUNCHER_HELPERS_PATH];
    delete require.cache[SESSION_STATE_PATH];

    cp = require("node:child_process");
    fsMod = require("node:fs");
    helpers = require(CHROME_LAUNCHER_HELPERS_PATH);
    realSpawn = cp.spawn;
    realExistsSync = fsMod.existsSync;
    realIsPortAlive = helpers.isPortAlive;
  });

  afterEach(() => {
    cp.spawn = realSpawn;
    fsMod.existsSync = realExistsSync;
    helpers.isPortAlive = realIsPortAlive;
    delete require.cache[CHROME_PROCESS_PATH];
    delete require.cache[CHROME_LAUNCHER_HELPERS_PATH];
    delete require.cache[SESSION_STATE_PATH];

    if (originalXdg === undefined) delete process.env.XDG_CACHE_HOME;
    else process.env.XDG_CACHE_HOME = originalXdg;
    if (originalChromeWsPort === undefined) delete process.env.CHROME_WS_PORT;
    else process.env.CHROME_WS_PORT = originalChromeWsPort;

    rmSync(cacheRoot, { recursive: true, force: true });
  });

  test("an async spawn failure does not throw unhandled, and doesn't leave startChrome() hanging", async () => {
    // Pretend the platform's first candidate Chrome path exists, so
    // startChrome() never gets stuck at "Chrome not found" before it even
    // reaches trySpawnOn().
    fsMod.existsSync = (() => true) as typeof fsMod.existsSync;

    let portAlive = false;
    // Bypass the real HTTP probe entirely — trySpawnOn()'s poll loop only
    // needs *a* boolean, and the fake process below never binds a real CDP
    // port for it to find.
    helpers.isPortAlive = async () => portAlive;

    let capturedProc: FakeProc | null = null;
    let spawnCalls = 0;
    cp.spawn = ((..._args: unknown[]) => {
      spawnCalls += 1;
      const fake = new EventEmitter() as FakeProc;
      fake.pid = 424242;
      fake.unref = () => {};
      capturedProc = fake;
      return fake;
    }) as typeof cp.spawn;

    const { attachChromeProcess } = require(CHROME_PROCESS_PATH);
    const { createState } = require(SESSION_STATE_PATH);

    const state = createState();
    const { startChrome } = attachChromeProcess({
      state,
      chromeHttp: async () => {
        throw new Error("no chrome listening");
      },
      getTabs: async () => [],
      newTab: async () => {},
      closeBridge: null,
    });

    // Explicit port ⇒ startChrome() takes the single-attempt branch (no
    // pickFreePort()/retry dance), so exactly one trySpawnOn() call happens.
    const startPromise = startChrome(true, null, 54321);

    // Let the microtask queue drain so trySpawnOn()'s synchronous
    // post-spawn() work — attaching the 'error' listener, calling unref() —
    // has actually run, without waiting on any real timer.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(spawnCalls).toBe(1);
    expect(capturedProc).not.toBeNull();

    // The actual defect: Node's EventEmitter throws synchronously when
    // 'error' is emitted with no listener attached — exactly what happens to
    // a real ChildProcess when spawn() fails asynchronously (EACCES, a
    // TOCTOU race, EMFILE, ...) after already having returned to the caller.
    expect(() => {
      (capturedProc as unknown as FakeProc).emit(
        "error",
        Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" }),
      );
    }).not.toThrow();

    // Cleanup: let the poll loop see the port as alive so startChrome()
    // settles quickly instead of the background promise polling for the
    // real 15s deadline after this test has already finished.
    portAlive = true;
    await startPromise.catch(() => {
      // Either outcome is fine here — we only care that it settles instead
      // of dangling. A fixed trySpawnOn() may have already abandoned the
      // attempt because of the 'error' we emitted above, in which case
      // startChrome() rejects; that's expected and not what this test is
      // checking.
    });
  });
});
