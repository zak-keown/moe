import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { pollRunSetManifest } from "../src/components/RunSetDetail";
import type { RunSetManifest } from "../src/lib/api";

const FIXTURE: RunSetManifest = {
  schemaVersion: 1,
  runSetId: "batch_20260101T000000Z_aaaa",
  kind: "batch",
  passes: 1,
  cards: ["card-1"],
  createdAt: "2026-01-01T00:00:00Z",
  completedAt: null,
  runs: [],
  summary: null,
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("pollRunSetManifest", () => {
  test("re-fetches the manifest on an interval — the fallback for a dropped/never-connected WS", async () => {
    const fetchManifest = vi.fn().mockResolvedValue(FIXTURE);
    const onUpdate = vi.fn();

    pollRunSetManifest(fetchManifest, onUpdate, 3000);

    await vi.advanceTimersByTimeAsync(3000);
    expect(fetchManifest).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(3000);
    expect(fetchManifest).toHaveBeenCalledTimes(2);
    expect(onUpdate).toHaveBeenCalledWith(FIXTURE);
  });

  test("the returned cleanup stops the interval", async () => {
    const fetchManifest = vi.fn().mockResolvedValue(FIXTURE);
    const onUpdate = vi.fn();

    const stop = pollRunSetManifest(fetchManifest, onUpdate, 3000);
    stop();

    await vi.advanceTimersByTimeAsync(10000);
    expect(fetchManifest).not.toHaveBeenCalled();
  });
});
