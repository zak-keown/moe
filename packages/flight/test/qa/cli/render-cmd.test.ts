import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { render } from "../../../src/qa/cli/render.js";
import type { AppConfig } from "../../../src/qa/config.js";

// Every root makeRun() has ever created, so afterEach can remove it — see
// CR-086. Deliberately never cleared (not even by afterEach): a later test
// asserts on it to confirm earlier roots were actually deleted from disk,
// not merely forgotten by this array.
const createdRoots: string[] = [];

afterEach(() => {
  for (const root of createdRoots) {
    rmSync(root, { recursive: true, force: true });
  }
});

function makeRun(): { projectRoot: string; runId: string } {
  const projectRoot = mkdtempSync(join(tmpdir(), "moe-flight-render-cmd-"));
  createdRoots.push(projectRoot);
  const stateDir = join(projectRoot, ".moe-flight");
  const runId = "card_2026T000000Z_zzzz";
  const runDir = join(stateDir, "results", runId);
  mkdirSync(runDir, { recursive: true });
  writeFileSync(
    join(runDir, "result.json"),
    JSON.stringify({
      schemaVersion: 5,
      runId,
      scenario: "card",
      status: "pass",
      summary: "ok",
      reasoning: "r",
      observations: [],
      evidence: { screenshots: [], log: "run.jsonl" },
      duration_ms: 1,
    }),
  );
  writeFileSync(
    join(runDir, "run.jsonl"),
    `${JSON.stringify({ eventId: "e1", type: "run_start" })}\n`,
  );
  return { projectRoot, runId };
}

describe("render command", () => {
  test("resolves run-id under state-dir and emits index.html", async () => {
    const { projectRoot, runId } = makeRun();
    const config = { projectRoot, stateDirName: ".moe-flight" } as AppConfig;
    const logs: string[] = [];
    await render({ command: "render", runIdOrPath: runId, cli: {} as any }, config, {
      log: (m) => logs.push(m),
    });
    expect(logs.length).toBe(1);
    expect(logs[0]).toMatch(/index\.html$/);
  });

  test("accepts an absolute path to a run-dir directly", async () => {
    const { projectRoot, runId } = makeRun();
    const runDir = join(projectRoot, ".moe-flight", "results", runId);
    const config = { projectRoot, stateDirName: ".moe-flight" } as AppConfig;
    const logs: string[] = [];
    await render({ command: "render", runIdOrPath: runDir, cli: {} as any }, config, {
      log: (m) => logs.push(m),
    });
    expect(logs[0]).toBe(`${runDir}/index.html`);
  });

  test("throws when the run-id can't be resolved", async () => {
    const { projectRoot } = makeRun();
    const config = { projectRoot, stateDirName: ".moe-flight" } as AppConfig;
    await expect(
      render({ command: "render", runIdOrPath: "nonexistent-run", cli: {} as any }, config),
    ).rejects.toThrow(/Run dir not found/);
  });

  test("removes its temp project root after the test finishes (CR-086)", () => {
    let leftoverFromPriorTest: string | undefined;
    for (const root of createdRoots) {
      if (existsSync(root)) leftoverFromPriorTest = root;
    }
    expect(leftoverFromPriorTest).toBeUndefined();
  });
});
