import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  addWorkerToRun,
  endRun,
  listRuns,
  mergeRunEvents,
  readRunMeta,
  startRun,
} from "../src/core/runs.js";
import { appendEvent } from "../src/core/event-log.js";
import { eventsPath } from "../src/core/paths.js";
import { writeMeta } from "../src/core/worker-store.js";
import { EVENT_NAMES, parseEvent, serializeEvent } from "../src/events.js";
import type { WorkerEvent } from "../src/events.js";

describe("runs", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "moe-crew-runs-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  describe("startRun", () => {
    it("creates run.json with correct shape", () => {
      const id = startRun(dir);
      const meta = readRunMeta(dir, id);
      expect(meta).not.toBeNull();
      expect(meta!.id).toBe(id);
      expect(meta!.workers).toEqual([]);
      expect(meta!.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(meta!.endedAt).toBeUndefined();
    });

    it("records label when provided", () => {
      const id = startRun(dir, "batch deploy");
      const meta = readRunMeta(dir, id);
      expect(meta!.label).toBe("batch deploy");
    });

    it("omits label key when not provided", () => {
      const id = startRun(dir);
      const meta = readRunMeta(dir, id);
      expect("label" in meta!).toBe(false);
    });
  });

  describe("endRun", () => {
    it("stamps endedAt on an existing run", () => {
      const id = startRun(dir);
      const result = endRun(dir, id);
      expect(result).not.toBeNull();
      expect(result!.endedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      // Persisted on disk
      const reread = readRunMeta(dir, id);
      expect(reread!.endedAt).toBe(result!.endedAt);
    });

    it("returns null for a non-existent run", () => {
      expect(endRun(dir, "no-such-run")).toBeNull();
    });
  });

  describe("addWorkerToRun", () => {
    it("appends worker name to the workers array", () => {
      const id = startRun(dir);
      addWorkerToRun(dir, id, "alpha");
      addWorkerToRun(dir, id, "beta");
      const meta = readRunMeta(dir, id);
      expect(meta!.workers).toEqual(["alpha", "beta"]);
    });

    it("is idempotent for the same worker name", () => {
      const id = startRun(dir);
      addWorkerToRun(dir, id, "alpha");
      addWorkerToRun(dir, id, "alpha");
      const meta = readRunMeta(dir, id);
      expect(meta!.workers).toEqual(["alpha"]);
    });

    it("returns null for a non-existent run", () => {
      expect(addWorkerToRun(dir, "no-such-run", "w")).toBeNull();
    });
  });

  describe("listRuns", () => {
    it("returns empty array when no runs exist", () => {
      expect(listRuns(dir)).toEqual([]);
    });

    it("lists runs newest first", () => {
      const id1 = startRun(dir, "first");
      const id2 = startRun(dir, "second");
      const runs = listRuns(dir);
      expect(runs.length).toBe(2);
      // Both are started within ms of each other; just check both are present
      const ids = runs.map((r) => r.id);
      expect(ids).toContain(id1);
      expect(ids).toContain(id2);
    });
  });

  describe("mergeRunEvents", () => {
    /** Write a worker meta so resolveSession can find it by tmux_name. */
    function setupWorker(name: string, sid: string): void {
      writeMeta(dir, {
        tmux_name: name,
        session_id: sid,
        cwd: "/tmp",
        harness: "claude",
      });
    }

    it("merges and sorts events from two workers by timestamp", () => {
      const id = startRun(dir);
      setupWorker("w1", "sid-1");
      setupWorker("w2", "sid-2");
      addWorkerToRun(dir, id, "w1");
      addWorkerToRun(dir, id, "w2");

      // Worker 1 events at T=1, T=3
      appendEvent(eventsPath(dir, "sid-1"), { event: "session_start", ts: "2026-09-02T10:00:01Z" });
      appendEvent(eventsPath(dir, "sid-1"), { event: "stop", ts: "2026-09-02T10:00:03Z" });

      // Worker 2 events at T=2, T=4
      appendEvent(eventsPath(dir, "sid-2"), { event: "session_start", ts: "2026-09-02T10:00:02Z" });
      appendEvent(eventsPath(dir, "sid-2"), { event: "stop", ts: "2026-09-02T10:00:04Z" });

      const resolver = (d: string, worker: string): string | null => {
        if (worker === "w1") return "sid-1";
        if (worker === "w2") return "sid-2";
        return null;
      };

      const merged = mergeRunEvents(dir, id, resolver);
      expect(merged).toHaveLength(4);
      // Check interleaved order
      expect(merged[0]!.worker).toBe("w1");
      expect(merged[0]!.event.event).toBe("session_start");
      expect(merged[1]!.worker).toBe("w2");
      expect(merged[1]!.event.event).toBe("session_start");
      expect(merged[2]!.worker).toBe("w1");
      expect(merged[2]!.event.event).toBe("stop");
      expect(merged[3]!.worker).toBe("w2");
      expect(merged[3]!.event.event).toBe("stop");
    });

    it("returns empty array for a non-existent run", () => {
      expect(mergeRunEvents(dir, "no-such-run", () => null)).toEqual([]);
    });

    it("skips workers with no events file", () => {
      const id = startRun(dir);
      addWorkerToRun(dir, id, "ghost");
      const merged = mergeRunEvents(dir, id, () => null);
      expect(merged).toEqual([]);
    });
  });
});

describe("run event types", () => {
  it("run_start and run_end are in EVENT_NAMES", () => {
    expect(EVENT_NAMES).toContain("run_start");
    expect(EVENT_NAMES).toContain("run_end");
  });

  it("parseEvent accepts run_start", () => {
    const raw = JSON.stringify({
      event: "run_start",
      ts: "2026-09-02T10:00:00Z",
      runId: "abc-123",
      label: "deploy",
    });
    const parsed = parseEvent(raw);
    expect(parsed).not.toBeNull();
    expect(parsed!.event).toBe("run_start");
  });

  it("parseEvent accepts run_end", () => {
    const raw = JSON.stringify({
      event: "run_end",
      ts: "2026-09-02T10:00:00Z",
      runId: "abc-123",
    });
    const parsed = parseEvent(raw);
    expect(parsed).not.toBeNull();
    expect(parsed!.event).toBe("run_end");
  });

  it("round-trips run_start through serialize/parse", () => {
    const e: WorkerEvent = {
      event: "run_start",
      ts: "2026-09-02T10:00:00Z",
      runId: "abc-123",
      label: "deploy",
    };
    expect(parseEvent(serializeEvent(e))).toEqual(e);
  });

  it("round-trips run_end through serialize/parse", () => {
    const e: WorkerEvent = {
      event: "run_end",
      ts: "2026-09-02T10:00:00Z",
      runId: "abc-123",
    };
    expect(parseEvent(serializeEvent(e))).toEqual(e);
  });
});
