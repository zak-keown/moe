import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { runAgent } from "../../../src/qa/agent/agent.js";
import { EvidenceLogger } from "../../../src/qa/evidence/logger.js";
import type { AgentResponse } from "../../../src/qa/models/provider.js";
import { makeRunId } from "../../../src/qa/util/id.js";
import { startFetchServer } from "../helpers/mock-http.js";
import {
  citeAll,
  isChromeUnavailable,
  loadStory,
  makeScriptedClient,
  report,
  step,
  withTimeout,
} from "./helpers.js";

const TODOMVC_HTML = join(import.meta.dirname, "../fixtures/todomvc.html");

async function serveTodomvc() {
  return startFetchServer(() => {
    const html = readFileSync(TODOMVC_HTML, "utf-8");
    return new Response(html, {
      headers: { "Content-Type": "text/html" },
    });
  });
}

describe("Web e2e — TodoMVC", () => {
  test("pass: user can add todo items", async () => {
    let WebAdapter: any;
    try {
      const mod = await import("../../../src/qa/adapters/web/adapter.js");
      WebAdapter = mod.WebAdapter;
    } catch (_err) {
      console.log("Skipping web e2e: chrome-ws-lib not available");
      return;
    }

    const card = loadStory("todomvc-add-pass.md");
    const logDir = mkdtempSync(join(tmpdir(), "moe-flight-todomvc-add-"));
    const logger = new EvidenceLogger(logDir);
    const server = await serveTodomvc();
    const adapter = new WebAdapter();

    const steps: AgentResponse[] = [
      step("call_1", "screenshot", {}),
      step("call_2", "type", { text: "Buy groceries", selector: ".new-todo" }),
      step("call_3", "press", { key: "Enter" }),
      step("call_4", "extract", { selector: ".todo-list" }),
      step("call_5", "extract", { selector: ".todo-count" }),
      step("call_6", "type", { text: "Walk the dog", selector: ".new-todo" }),
      step("call_7", "press", { key: "Enter" }),
      step("call_8", "extract", { selector: ".todo-count" }),
      report(
        "pass",
        "Todo items can be added",
        "Added two items, count updated correctly",
        citeAll(card, "pass"),
      ),
    ];

    const client = makeScriptedClient(steps);

    try {
      await withTimeout(
        adapter.start(`http://localhost:${server.port}`),
        10_000,
        "adapter.start()",
      );
      const result = await withTimeout(
        runAgent(card, adapter, client, logger, undefined, {
          runId: makeRunId(card.id),
          budgetMs: 60_000,
          reflectionInterval: 0,
        }),
        15_000,
        "runAgent()",
      );

      expect(result.status).toBe("pass");
      expect(result.scenario).toBe("todomvc-add-pass");
    } catch (err: any) {
      if (isChromeUnavailable(err)) {
        console.log(`Skipping web e2e: ${err.message}`);
        return;
      }
      throw err;
    } finally {
      await adapter.close();
      await server.stop();
    }
  }, 30_000);

  test("fail: editing is not supported", async () => {
    let WebAdapter: any;
    try {
      const mod = await import("../../../src/qa/adapters/web/adapter.js");
      WebAdapter = mod.WebAdapter;
    } catch (_err) {
      console.log("Skipping web e2e: chrome-ws-lib not available");
      return;
    }

    const card = loadStory("todomvc-edit-fail.md");
    const logDir = mkdtempSync(join(tmpdir(), "moe-flight-todomvc-edit-"));
    const logger = new EvidenceLogger(logDir);
    const server = await serveTodomvc();
    const adapter = new WebAdapter();

    const steps: AgentResponse[] = [
      step("call_1", "type", { text: "Test item", selector: ".new-todo" }),
      step("call_2", "press", { key: "Enter" }),
      step("call_3", "eval", {
        expression:
          "document.querySelector('.todo-list li label').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))",
      }),
      step("call_4", "extract", { selector: ".todo-list" }),
      report(
        "fail",
        "Editing is not supported",
        "Double-clicking a todo did not reveal an edit input",
        citeAll(card, "fail"),
      ),
    ];

    const client = makeScriptedClient(steps);

    try {
      await withTimeout(
        adapter.start(`http://localhost:${server.port}`),
        10_000,
        "adapter.start()",
      );
      const result = await withTimeout(
        runAgent(card, adapter, client, logger, undefined, {
          runId: makeRunId(card.id),
          budgetMs: 60_000,
          reflectionInterval: 0,
        }),
        15_000,
        "runAgent()",
      );

      expect(result.status).toBe("fail");
      expect(result.scenario).toBe("todomvc-edit-fail");
    } catch (err: any) {
      if (isChromeUnavailable(err)) {
        console.log(`Skipping web e2e: ${err.message}`);
        return;
      }
      throw err;
    } finally {
      await adapter.close();
      await server.stop();
    }
  }, 30_000);
});
