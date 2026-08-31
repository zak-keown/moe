import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { writeResultFiles } from "../../../src/qa/evidence/writer.js";
import type { VerdictResult } from "../../../src/qa/types.js";

describe("writeResultFiles", () => {
  let outDir: string;

  beforeEach(() => {
    outDir = mkdtempSync(join(tmpdir(), "moe-flight-writer-"));
  });

  afterEach(() => {
    rmSync(outDir, { recursive: true, force: true });
  });

  test("writes result.json with both runId and scenario for self-identifying artifacts", () => {
    const result: VerdictResult = {
      schemaVersion: 1,
      runId: "story-001_20260416T142301Z_test",
      scenario: "story-001",
      status: "pass",
      summary: "Everything worked",
      reasoning: "All criteria met",
      observations: [],
      evidence: { screenshots: [], log: "run.jsonl" },
      duration_ms: 5000,
    };
    writeResultFiles(outDir, result);
    const json = JSON.parse(readFileSync(join(outDir, "result.json"), "utf-8"));
    // scenario (the cardId) is preserved for back-compat consumers.
    expect(json.scenario).toBe("story-001");
    expect(json.status).toBe("pass");
    // runId is the new self-describing primary key.
    expect(json.runId).toBe("story-001_20260416T142301Z_test");
  });

  test("writes result.md", () => {
    const result: VerdictResult = {
      schemaVersion: 1,
      runId: "story-001_20260416T142301Z_test",
      scenario: "story-001",
      status: "fail",
      summary: "Button was broken",
      reasoning: "Could not submit form",
      observations: [],
      evidence: { screenshots: ["screenshots/001.png"], log: "run.jsonl" },
      duration_ms: 12000,
    };
    writeResultFiles(outDir, result);
    const md = readFileSync(join(outDir, "result.md"), "utf-8");
    expect(md).toContain("story-001");
    expect(md).toContain("fail");
    expect(md).toContain("Button was broken");
    expect(md).toContain("12.0s");
  });

  test("writes individual issue files", () => {
    const result: VerdictResult = {
      schemaVersion: 1,
      runId: "story-001_20260416T142301Z_test",
      scenario: "story-001",
      status: "pass",
      summary: "Passed but found issues",
      reasoning: "Criteria met",
      observations: [
        { kind: "bug", description: "Submit button missing on mobile" },
        { kind: "typo", description: "Footer says 'itmes' not 'items'" },
        { kind: "ux", description: "Navigation was confusing" },
      ],
      evidence: { screenshots: [], log: "run.jsonl" },
      duration_ms: 8000,
    };
    writeResultFiles(outDir, result);
    expect(existsSync(join(outDir, "issues"))).toBe(true);

    // Check files exist with correct naming
    const files = readdirSync(join(outDir, "issues")).sort();
    expect(files).toHaveLength(3);
    expect(files[0]).toMatch(/^001-bug-/);
    expect(files[1]).toMatch(/^002-typo-/);
    expect(files[2]).toMatch(/^003-ux-/);

    // Check content
    const bugContent = readFileSync(join(outDir, "issues", files[0]), "utf-8");
    expect(bugContent).toContain("Submit button missing on mobile");
    expect(bugContent).toContain("story-001");
  });

  test("skips issues dir when no observations", () => {
    const result: VerdictResult = {
      schemaVersion: 1,
      runId: "story-001_20260416T142301Z_test",
      scenario: "story-001",
      status: "pass",
      summary: "Clean pass",
      reasoning: "All good",
      observations: [],
      evidence: { screenshots: [], log: "run.jsonl" },
      duration_ms: 3000,
    };
    writeResultFiles(outDir, result);
    expect(existsSync(join(outDir, "issues"))).toBe(false);
  });
});
