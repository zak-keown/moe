import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationExchange } from "../src/types.js";

vi.mock("../src/summarizers/process.js", () => ({
  createChildProcessAdapter: vi.fn(),
}));

import { SummarizerSdkError, summarizeConversation } from "../src/summarizer.js";
import { createChildProcessAdapter } from "../src/summarizers/process.js";

function makeExchange(overrides: Partial<ConversationExchange> = {}): ConversationExchange {
  return {
    id: "ex-1",
    project: "test-project",
    timestamp: "2025-10-01T12:00:00Z",
    userMessage: "How do I rebase against origin/main?",
    assistantMessage: "Use git rebase origin/main from your feature branch.",
    archivePath: "/tmp/archive/test.jsonl",
    lineStart: 1,
    lineEnd: 2,
    sessionId: "abc-123",
    cwd: "/tmp/nonexistent-cwd-for-test",
    ...overrides,
  };
}

function mockCliResults(...results: Array<{ code?: number; stdout?: string; stderr?: string }>) {
  let callIndex = 0;
  vi.mocked(createChildProcessAdapter).mockReturnValue({
    async run(_spec) {
      const r = results[callIndex++] ?? results[results.length - 1];
      return {
        code: r?.code ?? 0,
        signal: null,
        stdout: r?.stdout ?? "",
        stderr: r?.stderr ?? "",
      };
    },
  });
}

describe("summarizeConversation — Claude CLI resume fallback (cwd-mismatch recovery)", () => {
  beforeEach(() => {
    vi.mocked(createChildProcessAdapter).mockReset();
  });

  it("propagates is_error results as SummarizerSdkError when the fallback also fails", async () => {
    mockCliResults(
      { code: 1, stderr: "No conversation found with session ID: abc-123" },
      { stdout: JSON.stringify({ is_error: true, subtype: "error_during_execution" }) },
    );

    await expect(summarizeConversation([makeExchange()], "abc-123")).rejects.toBeInstanceOf(
      SummarizerSdkError,
    );
  });

  it("attaches the subtype and session_id to the thrown SummarizerSdkError", async () => {
    mockCliResults({
      stdout: JSON.stringify({
        is_error: true,
        subtype: "auth_failed",
        session_id: "sdk-session-id-xyz",
      }),
    });

    let caught: unknown;
    try {
      await summarizeConversation([makeExchange()], "abc-123");
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(SummarizerSdkError);
    expect((caught as SummarizerSdkError).subtype).toBe("auth_failed");
    expect((caught as SummarizerSdkError).sessionId).toBe("sdk-session-id-xyz");
  });

  it("retries without resume when the first call fails with resume error, returning the second call's summary", async () => {
    let callCount = 0;
    vi.mocked(createChildProcessAdapter).mockReturnValue({
      async run(spec) {
        callCount++;
        if (callCount === 1) {
          return {
            code: 1,
            signal: null,
            stdout: "",
            stderr: "No conversation found with session ID: abc-123",
          };
        }
        return {
          code: 0,
          signal: null,
          stdout: JSON.stringify({ result: "<summary>Recovered summary text.</summary>" }),
          stderr: "",
        };
      },
    });

    const result = await summarizeConversation([makeExchange()], "abc-123");
    expect(result).toBe("Recovered summary text.");
    expect(callCount).toBe(2);
  });

  it("passes the session's recorded cwd to the CLI when the path still exists on disk", async () => {
    const realCwd = mkdtempSync(join(tmpdir(), "moe-memory-cwd-test-"));
    try {
      let capturedCwd: string | undefined;
      vi.mocked(createChildProcessAdapter).mockReturnValue({
        async run(spec) {
          capturedCwd = spec.cwd;
          return {
            code: 0,
            signal: null,
            stdout: JSON.stringify({ result: "<summary>ok</summary>" }),
            stderr: "",
          };
        },
      });

      await summarizeConversation([makeExchange({ cwd: realCwd })], "abc-123");
      expect(capturedCwd).toBe(realCwd);
    } finally {
      rmSync(realCwd, { recursive: true, force: true });
    }
  });

  it("omits cwd from CLI options when the session's recorded cwd no longer exists", async () => {
    let capturedCwd: string | undefined;
    vi.mocked(createChildProcessAdapter).mockReturnValue({
      async run(spec) {
        capturedCwd = spec.cwd;
        return {
          code: 0,
          signal: null,
          stdout: JSON.stringify({ result: "<summary>ok</summary>" }),
          stderr: "",
        };
      },
    });

    await summarizeConversation([makeExchange({ cwd: "/definitely/not/here" })], "abc-123");
    expect(capturedCwd).toBeUndefined();
  });

  it("does not retry when the CLI throws a non-resume error", async () => {
    let callCount = 0;
    vi.mocked(createChildProcessAdapter).mockReturnValue({
      async run() {
        callCount++;
        throw new Error("Network unreachable");
      },
    });

    await expect(summarizeConversation([makeExchange()], "abc-123")).rejects.toThrow(
      /Network unreachable/,
    );
    expect(callCount).toBe(1);
  });

  it("does not retry when the CLI yields is_error with a non-resume subtype", async () => {
    let callCount = 0;
    vi.mocked(createChildProcessAdapter).mockReturnValue({
      async run() {
        callCount++;
        return {
          code: 0,
          signal: null,
          stdout: JSON.stringify({ is_error: true, subtype: "auth_failed" }),
          stderr: "",
        };
      },
    });

    await expect(summarizeConversation([makeExchange()], "abc-123")).rejects.toBeInstanceOf(
      SummarizerSdkError,
    );
    expect(callCount).toBe(1);
  });
});
