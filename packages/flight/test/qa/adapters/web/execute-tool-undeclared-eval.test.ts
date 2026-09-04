import { describe, expect, test, vi } from "vitest";
import { WebAdapter, type ChromeSession } from "../../../../src/qa/adapters/web/adapter.js";
import type { EvidenceLogger } from "../../../../src/qa/evidence/logger.js";

// CR-080: `eval` was deliberately dropped from webToolDefinitions()
// (PRI-1590 experiment) "to remove its pull on the agent toward
// developer-pattern escapes," but WebAdapter#executeTool's `switch (name)`
// still had an unconditional `case "eval": return executeEval(ctx, args);`
// with nothing checking the dispatched name against the tools actually
// declared by toolDefinitions(). The schema-shape validation only runs
// `if (schema)` — i.e. only for tools present in the schema — and silently
// no-ops for anything else, so a call named "eval" (a lenient/custom LLM
// provider, a revived transcript, a test harness) still ran.
//
// This constructs a WebAdapter with a stubbed `chromeSession` — the
// documented PRI-1436 dependency-injection seam for tests — so no real
// Chrome process is needed.
describe("CR-080: executeTool rejects a tool name removed from toolDefinitions()", () => {
  function makeChrome(): ChromeSession {
    return {
      // If executeEval ever gets reached, this call proves it — and would
      // throw in real usage since none of the other CDP methods it might
      // need are stubbed here.
      evaluate: vi.fn(async () => "should not be called"),
    };
  }

  test('"eval" is not in the declared tool schema', () => {
    const adapter = new WebAdapter({ chromeSession: makeChrome() });
    const names = adapter.toolDefinitions().map((t) => t.name);
    expect(names).not.toContain("eval");
  });

  test('calling executeTool("eval", ...) does not dispatch to the page-eval executor', async () => {
    const chrome = makeChrome();
    const adapter = new WebAdapter({ chromeSession: chrome });
    const logger = {} as unknown as EvidenceLogger;

    await adapter.executeTool("eval", { expression: "1+1" }, logger);

    // The load-bearing assertion: whatever executeTool does with an
    // undeclared tool name, it must never reach the page-eval executor,
    // which is the actual capability CR-080's schema removal was supposed
    // to remove.
    expect(chrome.evaluate).not.toHaveBeenCalled();
  });
});
