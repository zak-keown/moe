import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error — the production helper is intentionally plain ESM.
import { discoverHarnesses } from "../skills/smoothing-the-experience/scripts/lib/discovery.mjs";
// @ts-expect-error — the production helper is intentionally plain ESM.
import {
  evidenceKey,
  makeEvidence,
  redactedEvidenceSummary,
} from "../skills/smoothing-the-experience/scripts/lib/evidence.mjs";

describe("smoothing evidence contract", () => {
  it("rejects prose and secret-bearing fields", () => {
    expect(() =>
      makeEvidence({
        harness: "claude",
        rootSessionId: "root-1",
        projectRoot: "/fixture/repo-a",
        observedAt: "2026-09-01T00:00:00.000Z",
        class: "network",
        operation: { hostname: "docs.example.invalid" },
        outcome: "success",
        approvalProvenance: "unknown",
        sourceSchema: "claude-jsonl-tool-use-v1",
        toolOutput: "private output",
      }),
    ).toThrow(/unknown evidence field: toolOutput/);
  });

  it("derives grouping keys without exposing root session ids", () => {
    const row = makeEvidence({
      harness: "claude",
      rootSessionId: "root-1",
      projectRoot: "/fixture/repo-a",
      observedAt: "2026-09-01T00:00:00.000Z",
      class: "filesystem",
      operation: { action: "read", path: "src/index.ts" },
      outcome: "success",
      approvalProvenance: "explicit",
      sourceSchema: "claude-jsonl-tool-use-v1",
    });
    expect(evidenceKey(row)).toBe(
      'claude\u0000filesystem\u0000{"action":"read","path":"src/index.ts"}',
    );
    expect(JSON.stringify(redactedEvidenceSummary([row]))).not.toContain("root-1");
  });

  it.each([
    ["tool output", "mcp", { toolId: "mcp__fixture__search", toolOutput: "secret" }],
    ["URL paths and queries", "network", { url: "https://x.invalid/?token=secret" }],
    ["arbitrary command arguments", "shell", { command: "git status", args: ["--porcelain"] }],
  ])("rejects nested %s", (_label, evidenceClass, operation) => {
    expect(() =>
      makeEvidence({
        harness: "claude",
        rootSessionId: "root-1",
        projectRoot: "/fixture/repo-a",
        observedAt: "2026-09-01T00:00:00.000Z",
        class: evidenceClass,
        operation,
        outcome: "success",
        approvalProvenance: "unknown",
        sourceSchema: "claude-jsonl-tool-use-v1",
      }),
    ).toThrow(/invalid operation|unknown .* operation field/);
  });

  it.each([
    ["missing", undefined],
    ["null", null],
    ["an array", []],
    ["an empty object", {}],
    ["a string", "git status"],
  ])("rejects %s operations", (_label, operation) => {
    expect(() =>
      makeEvidence({
        harness: "claude",
        rootSessionId: "root-1",
        projectRoot: "/fixture/repo-a",
        observedAt: "2026-09-01T00:00:00.000Z",
        class: "shell",
        operation,
        outcome: "success",
        approvalProvenance: "unknown",
        sourceSchema: "claude-jsonl-tool-use-v1",
      }),
    ).toThrow(/invalid operation/);
  });
});

it("honors config roots and reports unsupported installed harnesses", async () => {
  const homeDir = await mkdtemp(join(tmpdir(), "moe-smoothing-discovery-"));
  await mkdir(join(homeDir, "claude-home", "projects"), { recursive: true });
  await mkdir(join(homeDir, "codex-home", "sessions"), { recursive: true });
  await writeFile(join(homeDir, "bin-cursor"), "fixture");
  const report = await discoverHarnesses({
    env: {
      CLAUDE_CONFIG_DIR: join(homeDir, "claude-home"),
      CODEX_HOME: join(homeDir, "codex-home"),
    },
    homeDir,
    cwd: join(homeDir, "repo-a"),
    nowMs: Date.parse("2026-09-03T00:00:00Z"),
    days: 30,
    fsOps: undefined,
    detectedCommands: new Set(["claude", "codex", "cursor"]),
  });
  expect(
    report.harnesses.map((entry: { harness: string; status: string }) => [
      entry.harness,
      entry.status,
    ]),
  ).toEqual([
    ["claude", "ready"],
    ["codex", "ready"],
    ["cursor", "not-evaluated"],
  ]);
  expect(report.cutoffMs).toBe(Date.parse("2026-08-04T00:00:00Z"));
});
