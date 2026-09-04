import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationExchange } from "../src/types.js";

// Stub the SDK's query() so each test controls what messages it yields.
vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: vi.fn(),
}));

import { query } from "@anthropic-ai/claude-agent-sdk";
import { summarizeConversation } from "../src/summarizer.js";

function asyncIterableFor(sdkMessages: unknown[]): AsyncIterable<unknown> {
  return {
    [Symbol.asyncIterator]() {
      let i = 0;
      return {
        next() {
          if (i < sdkMessages.length) {
            return Promise.resolve({ value: sdkMessages[i++], done: false });
          }
          return Promise.resolve({ value: undefined, done: true });
        },
      };
    },
  };
}

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

const BUDGET_ERROR_RESULT =
  "API Error: 400 invalid_request_error - thinking.budget_tokens must be less than max_tokens";

/**
 * CR-059: callClaude's fallback-also-failed branch did `return result;` — the
 * raw "API Error ... thinking.budget_tokens ..." string returned as though it
 * were the model's actual output — instead of throwing. summarizeConversation
 * then ran it through extractSummary(), which finds no <summary> tags and
 * falls back to text.trim(), so the error text itself became "the summary."
 * Every caller (indexer.ts, sync.ts, verify.ts's repairIndex) treats a
 * non-thrown return as success and writes it straight to
 * <archive>-summary.txt with no error sentinel — defeating the #96
 * error-sentinel mechanism entirely: hasRealSummary() sees ordinary
 * non-empty text and treats a persistent misconfiguration as a legitimate,
 * permanent summary forever, with no retry path.
 *
 * The fix must make callClaude throw once both the primary and the fallback
 * model hit this specific error, so the normal catch-and-sentinel machinery
 * in every caller actually engages.
 */
describe("CR-059: a persistent thinking-budget error is not accepted as the summary", () => {
  beforeEach(() => {
    vi.mocked(query).mockReset();
  });

  it("throws (rather than returning the raw error text) when both the primary and fallback model hit thinking.budget_tokens", async () => {
    vi.mocked(query)
      .mockReturnValueOnce(
        asyncIterableFor([
          { type: "result", is_error: false, result: BUDGET_ERROR_RESULT },
        ]) as any,
      )
      .mockReturnValueOnce(
        asyncIterableFor([
          { type: "result", is_error: false, result: BUDGET_ERROR_RESULT },
        ]) as any,
      );

    await expect(summarizeConversation([makeExchange()])).rejects.toThrow();
    expect(vi.mocked(query)).toHaveBeenCalledTimes(2);
  });

  it("still recovers via the fallback model when only the primary hits thinking.budget_tokens", async () => {
    vi.mocked(query)
      .mockReturnValueOnce(
        asyncIterableFor([
          { type: "result", is_error: false, result: BUDGET_ERROR_RESULT },
        ]) as any,
      )
      .mockReturnValueOnce(
        asyncIterableFor([
          { type: "result", is_error: false, result: "<summary>Recovered via fallback.</summary>" },
        ]) as any,
      );

    const result = await summarizeConversation([makeExchange()]);
    expect(result).toBe("Recovered via fallback.");
  });
});
