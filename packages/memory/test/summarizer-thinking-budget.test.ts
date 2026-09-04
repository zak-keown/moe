import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationExchange } from "../src/types.js";

const runClaudeCommandMock = vi.hoisted(() => vi.fn());
vi.mock("../src/summarizers/claude.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/summarizers/claude.js")>();
  return {
    ...actual,
    runClaudeCommand: runClaudeCommandMock,
  };
});

vi.mock("../src/summarizers/process.js", () => ({
  createChildProcessAdapter: () => ({}),
}));

const { summarizeConversation, SummarizerThinkingBudgetError } = await import(
  "../src/summarizer.js"
);

function makeExchange(overrides: Partial<ConversationExchange> = {}): ConversationExchange {
  return {
    id: "ex-1",
    project: "test-project",
    timestamp: "2025-10-01T12:00:00Z",
    userMessage:
      "How do I configure the retry policy for the sync worker so it backs off exponentially?",
    assistantMessage:
      "Wrap the retry loop with an exponential backoff helper and cap the delay at 30 seconds.",
    archivePath: "/tmp/archive/test.jsonl",
    lineStart: 1,
    lineEnd: 2,
    ...overrides,
  };
}

/**
 * CR-059: callClaude's fallback-also-failed branch used to `return result;`
 * — returning the raw error text as though it were model output — instead of
 * throwing. Now it throws SummarizerThinkingBudgetError so callers' catch
 * blocks write the #96 error sentinel and retry on the next run.
 *
 * Plan 1 replaced @anthropic-ai/claude-agent-sdk with a child process
 * adapter. We mock runClaudeCommand (from summarizers/claude.js) to throw
 * errors containing "thinking.budget_tokens".
 */
describe("CR-059: a persistent thinking-budget error is not accepted as the summary", () => {
  beforeEach(() => {
    runClaudeCommandMock.mockReset();
  });

  it("throws (rather than returning the raw error text) when both the primary and fallback model hit thinking.budget_tokens", async () => {
    runClaudeCommandMock.mockRejectedValue(
      new Error(
        "API Error: 400 invalid_request_error - thinking.budget_tokens must be less than max_tokens",
      ),
    );

    await expect(summarizeConversation([makeExchange()])).rejects.toThrow(
      SummarizerThinkingBudgetError,
    );
    expect(runClaudeCommandMock).toHaveBeenCalledTimes(2);
  });

  it("still recovers via the fallback model when only the primary hits thinking.budget_tokens", async () => {
    runClaudeCommandMock
      .mockRejectedValueOnce(
        new Error(
          "API Error: 400 invalid_request_error - thinking.budget_tokens must be less than max_tokens",
        ),
      )
      .mockResolvedValueOnce("<summary>Recovered via fallback.</summary>");

    const result = await summarizeConversation([makeExchange()]);
    expect(result).toBe("Recovered via fallback.");
  });
});
