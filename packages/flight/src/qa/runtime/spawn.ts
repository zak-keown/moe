import { spawn as nodeSpawn, spawnSync as nodeSpawnSync } from "node:child_process";
import { Readable } from "node:stream";

/**
 * Subprocess primitives. Production code calls these instead of reaching
 * for `node:child_process` directly, so the process-shape decisions
 * (detached session leader, env replacement, uniform timeout kill) live
 * in one place.
 *
 * Upstream this was a two-runtime shim (`Bun.spawn` when `globalThis.Bun`
 * was defined, `node:child_process` otherwise). The Bun branch is gone -
 * see packages/flight/README.md - but the seam it created is what let the
 * rest of the package move to Node without a single caller changing.
 */

export interface SpawnOptions {
  /** Working directory for the child process. */
  cwd?: string | undefined;
  /**
   * When true, the child becomes a session leader (calls `setsid()` on
   * POSIX). Its pid equals its pgid, so `process.kill(-pid, signal)`
   * targets the entire process group — used by callers that need to reap
   * the whole tree at cleanup time (e.g. `src/adapters/cli/adapter.ts`).
   */
  detached?: boolean | undefined;
  /**
   * When provided, **replaces** the child's environment (not merged with
   * parent). Callers that want inheritance should pass `process.env`.
   */
  env?: Record<string, string> | undefined;
  /**
   * When provided, the child is SIGKILLed if it hasn't exited within the
   * window. Implemented uniformly via setTimeout + proc.kill so the
   * caller's `exited` Promise resolves consistently across Bun and Node.
   */
  timeout_ms?: number | undefined;
}

export interface SpawnedProcess {
  pid: number;
  stdin: { write(data: string | Uint8Array): void; flush(): void };
  stdout: ReadableStream<Uint8Array>;
  stderr: ReadableStream<Uint8Array>;
  kill(): void;
  /**
   * Resolves with the child's exit code when it exits. Resolves with -1
   * when the child was killed by a signal (signal info isn't part of the
   * contract; callers that care can inspect the signal separately).
   * Safe to await after the child has already exited.
   */
  exited: Promise<number>;
}

export interface SpawnSyncResult {
  exitCode: number | null;
  stdout: Uint8Array;
  stderr: Uint8Array;
}

export function spawn(argv: string[], options?: SpawnOptions): SpawnedProcess {
  return spawnViaNode(argv, options);
}

export function spawnSync(argv: string[]): SpawnSyncResult {
  return spawnSyncViaNode(argv);
}

function spawnViaNode(argv: string[], options?: SpawnOptions): SpawnedProcess {
  const proc = nodeSpawn(argv[0]!, argv.slice(1), {
    stdio: ["pipe", "pipe", "pipe"],
    cwd: options?.cwd,
    detached: options?.detached === true,
    ...(options?.env ? { env: options.env } : {}),
  });
  if (!proc.stdin || !proc.stdout || !proc.stderr) {
    throw new Error("Node spawn returned a process with missing stdio");
  }
  if (proc.pid === undefined) {
    throw new Error("Node spawn returned a process with no pid");
  }
  const exited = new Promise<number>((resolve) => {
    if (proc.exitCode !== null) {
      resolve(proc.exitCode);
      return;
    }
    proc.once("exit", (code, _signal) => resolve(code ?? -1));
  });
  return withTimeout(
    {
      pid: proc.pid,
      stdin: {
        write: (d) => {
          proc.stdin!.write(d);
        },
        // Node's child_process stdin flushes synchronously to the kernel
        // pipe on each write call; there's no equivalent of FileSink.flush.
        flush: () => {},
      },
      stdout: Readable.toWeb(proc.stdout) as unknown as ReadableStream<Uint8Array>,
      stderr: Readable.toWeb(proc.stderr) as unknown as ReadableStream<Uint8Array>,
      kill: () => {
        proc.kill();
      },
      exited,
    },
    options?.timeout_ms,
  );
}

function withTimeout(proc: SpawnedProcess, timeoutMs: number | undefined): SpawnedProcess {
  if (!timeoutMs) return proc;
  const handle = setTimeout(() => {
    try {
      proc.kill();
    } catch {
      /* already dead */
    }
  }, timeoutMs);
  proc.exited.finally(() => {
    clearTimeout(handle);
  });
  return proc;
}

function spawnSyncViaNode(argv: string[]): SpawnSyncResult {
  const r = nodeSpawnSync(argv[0]!, argv.slice(1));
  return {
    exitCode: r.status,
    stdout: r.stdout
      ? new Uint8Array(r.stdout.buffer, r.stdout.byteOffset, r.stdout.byteLength)
      : new Uint8Array(),
    stderr: r.stderr
      ? new Uint8Array(r.stderr.buffer, r.stderr.byteOffset, r.stderr.byteLength)
      : new Uint8Array(),
  };
}
