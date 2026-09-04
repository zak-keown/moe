import { mkdtempSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { TUIAdapter } from "../../../src/qa/adapters/tui/adapter.js";
import { runAgent } from "../../../src/qa/agent/agent.js";
import { EvidenceLogger } from "../../../src/qa/evidence/logger.js";
import type { AgentResponse } from "../../../src/qa/models/provider.js";
import { spawnSync } from "../../../src/qa/runtime/spawn.js";
import { makeRunId } from "../../../src/qa/util/id.js";
import { citeAll, loadStory, makeScriptedClient, report, step } from "./helpers.js";

const hasTmux = (() => {
  try {
    return spawnSync(["tmux", "-V"]).exitCode === 0;
  } catch {
    return false;
  }
})();

const hasNano = (() => {
  try {
    return spawnSync(["which", "nano"]).exitCode === 0;
  } catch {
    return false;
  }
})();

describe.skipIf(!hasTmux || !hasNano)("TUI adapter e2e — nano editor", () => {
  let adapter: TUIAdapter | null = null;
  let tempFile: string | null = null;

  afterEach(async () => {
    if (adapter) {
      try {
        await adapter.close();
      } catch {
        // session may already be dead
      }
      adapter = null;
    }
    if (tempFile) {
      try {
        unlinkSync(tempFile);
      } catch {
        // file may already be gone
      }
      tempFile = null;
    }
  });

  test("pass: user can open, type, and save in nano", async () => {
    const card = loadStory("nano-open-save-pass.md");
    const logDir = mkdtempSync(join(tmpdir(), "moe-flight-nano-save-"));
    adapter = new TUIAdapter({ runDir: logDir });
    const logger = new EvidenceLogger(logDir);

    tempFile = join(tmpdir(), `moe-flight-nano-${Date.now()}.txt`);
    writeFileSync(tempFile, "initial content\n");

    const steps: AgentResponse[] = [
      step("call_0", "type", { text: `nano ${tempFile}\n` }),
      step("call_1", "read_screen", {}),
      step("call_2", "type", { text: "Hello from moe-flight!" }),
      step("call_3", "read_screen", {}),
      step("call_4", "press", { key: "Ctrl+O" }),
      step("call_5", "read_screen", {}),
      step("call_6", "press", { key: "Enter" }),
      step("call_7", "read_screen", {}),
      report(
        "pass",
        "nano opens, accepts typed text, and saves files",
        "Opened file with initial content, typed text, used Ctrl+O to save, confirmed filename",
        citeAll(card, "pass"),
      ),
    ];

    const client = makeScriptedClient(steps, 500);

    await adapter.start(`nano ${tempFile}`);
    const result = await runAgent(card, adapter, client, logger, undefined, {
      runId: makeRunId(card.id),
      budgetMs: 60_000,
      reflectionInterval: 0,
    });

    expect(result.status).toBe("pass");
    expect(result.scenario).toBe("nano-open-save-pass");
  }, 30_000);

  test("fail: nano has no tabs", async () => {
    const card = loadStory("nano-tabs-fail.md");
    const logDir = mkdtempSync(join(tmpdir(), "moe-flight-nano-tabs-"));
    adapter = new TUIAdapter({ runDir: logDir });
    const logger = new EvidenceLogger(logDir);

    tempFile = join(tmpdir(), `moe-flight-nano-${Date.now()}.txt`);
    writeFileSync(tempFile, "some content\n");

    const steps: AgentResponse[] = [
      step("call_0", "type", { text: `nano ${tempFile}\n` }),
      step("call_1", "read_screen", {}),
      report(
        "fail",
        "nano does not support tabbed editing",
        "The screen shows a single file view with no tab bar or tab switching interface",
        citeAll(card, "fail"),
      ),
    ];

    const client = makeScriptedClient(steps, 500);

    await adapter.start(`nano ${tempFile}`);
    const result = await runAgent(card, adapter, client, logger, undefined, {
      runId: makeRunId(card.id),
      budgetMs: 60_000,
      reflectionInterval: 0,
    });

    expect(result.status).toBe("fail");
    expect(result.scenario).toBe("nano-tabs-fail");
  }, 30_000);
});
