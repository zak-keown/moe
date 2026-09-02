import { afterEach, describe, expect, test } from "vitest";
import type { StaticRunPayload, VerdictResult } from "../src/lib/api";
import { api } from "../src/lib/api";

// CR-054: api.results.fileUrl must resolve evidence files relative to the
// report's own location when rendered as a self-contained static HTML
// report (renderRun() writes screenshots/, artifacts/ and captures/ as
// siblings of index.html, with no Flight server behind it) — see
// ui/vitest.config.ts's note on hand-faking `globalThis.window` rather
// than pulling in jsdom.

const FIXTURE_RESULT: VerdictResult = {
  schemaVersion: 5,
  runId: "card_20260101T000000Z_aaaa",
  scenario: "card",
  status: "pass",
  summary: "All good",
  reasoning: "It worked",
  observations: [],
  evidence: { screenshots: [], log: "run.jsonl" },
  duration_ms: 1,
};

afterEach(() => {
  if (typeof window !== "undefined") delete (window as any).__MOE_FLIGHT_RUN__;
});

describe("api.results.fileUrl", () => {
  test("builds an /api/results/... URL when no static payload is present (server mode)", () => {
    const url = api.results.fileUrl("run-123", "screenshots/001.png");
    expect(url).toBe("/api/results/run-123/file/screenshots/001.png");
  });

  test("CR-054: resolves the manifest-relative path verbatim in static mode", () => {
    (globalThis as any).window = (globalThis as any).window ?? globalThis;
    const payload: StaticRunPayload = { result: FIXTURE_RESULT, runJsonl: "" };
    (window as any).__MOE_FLIGHT_RUN__ = payload;

    const url = api.results.fileUrl("run-123", "screenshots/001.png");
    // Must NOT hit a server that isn't there — relative to index.html's
    // own directory, exactly where renderRun() left the evidence files.
    expect(url).toBe("screenshots/001.png");
    expect(url).not.toContain("/api/");
  });

  test("CR-054: still percent-encodes path segments in static mode", () => {
    (globalThis as any).window = (globalThis as any).window ?? globalThis;
    (window as any).__MOE_FLIGHT_RUN__ = { result: FIXTURE_RESULT, runJsonl: "" };

    const url = api.results.fileUrl("run-123", "artifacts/weird name.txt");
    expect(url).toBe("artifacts/weird%20name.txt");
  });
});
