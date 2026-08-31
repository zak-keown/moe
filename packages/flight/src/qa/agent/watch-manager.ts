import { globSync, statSync } from "node:fs";
import { join } from "node:path";

export const WATCH_POLL_INTERVAL_MS = 1000;
export const WAKE_IDLE_MS_MIN = 5_000;
export const WAKE_IDLE_MS_DEFAULT = 60_000;
export const WAKE_TIMEOUT_MS_MAX = 240_000;
export const WAKE_TIMEOUT_MS_DEFAULT = 240_000;

interface FileState {
  size: number;
  mtimeMs: number;
}

/**
 * Result of one `scan()` pass. `appended` is deduplicated per scan window —
 * two appends inside one poll interval register as a single entry.
 */
export interface ScanResult {
  newFiles: string[];
  appended: string[];
}

export interface WaitForWakeOptions {
  idleMs: number;
  timeoutMs: number;
  /** Override for tests; production uses WATCH_POLL_INTERVAL_MS. */
  pollIntervalMs?: number | undefined;
}

export interface WakeResult {
  reason: "idle" | "new_file" | "timeout" | "concurrent_call";
  path?: string | undefined;
  lastActivityMsAgo: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export class WatchManager {
  private globs: string[] = [];
  private known = new Map<string, FileState>();
  private waitInFlight = false;

  addGlob(glob: string): void {
    if (!this.globs.includes(glob)) this.globs.push(glob);
  }

  currentGlobs(): string[] {
    return [...this.globs];
  }

  currentWatches(): string[] {
    return [...this.known.keys()];
  }

  scan(): ScanResult {
    const newFiles: string[] = [];
    const appended: string[] = [];

    for (const pattern of this.globs) {
      let matches: string[];
      try {
        // Was `new Bun.Glob(pattern).scanSync({ absolute: true, onlyFiles: true })`.
        // `withFileTypes` supplies both halves: `isFile()` for `onlyFiles`
        // and `parentPath` for `absolute` (patterns here are absolute, so
        // the join is a no-op for them and correct for relative ones).
        matches = globSync(pattern, { withFileTypes: true })
          .filter((e) => e.isFile())
          .map((e) => join(e.parentPath, e.name));
      } catch {
        // The glob root doesn't exist yet — the motivating case is Codex
        // `$CODEX_HOME/sessions/` before launch. Bun's Glob threw here;
        // `fs.globSync` returns an empty list instead, which reaches the
        // same place. Skip and retry next poll either way.
        continue;
      }
      for (const path of matches) {
        let st: FileState | undefined;
        try {
          const s = statSync(path);
          st = { size: s.size, mtimeMs: s.mtimeMs };
        } catch {
          continue; // raced removal
        }
        const prior = this.known.get(path);
        if (!prior) {
          newFiles.push(path);
          this.known.set(path, st);
        } else if (st.size !== prior.size || st.mtimeMs !== prior.mtimeMs) {
          appended.push(path);
          this.known.set(path, st);
        }
      }
    }
    return { newFiles, appended };
  }

  async waitForWake(opts: WaitForWakeOptions): Promise<WakeResult> {
    if (this.waitInFlight) {
      return { reason: "concurrent_call", lastActivityMsAgo: 0 };
    }
    this.waitInFlight = true;
    try {
      const pollMs = opts.pollIntervalMs ?? WATCH_POLL_INTERVAL_MS;
      const startedAt = Date.now();
      let lastActivityAt = Date.now();

      while (true) {
        const events = this.scan();
        if (events.newFiles.length > 0) {
          return {
            reason: "new_file",
            path: events.newFiles[0],
            lastActivityMsAgo: 0,
          };
        }
        if (events.appended.length > 0) {
          lastActivityAt = Date.now();
        }

        const now = Date.now();
        const msSinceActivity = now - lastActivityAt;
        const msSinceStart = now - startedAt;

        if (msSinceActivity >= opts.idleMs) {
          return { reason: "idle", lastActivityMsAgo: msSinceActivity };
        }
        if (msSinceStart >= opts.timeoutMs) {
          return { reason: "timeout", lastActivityMsAgo: msSinceActivity };
        }

        await sleep(pollMs);
      }
    } finally {
      this.waitInFlight = false;
    }
  }
}
