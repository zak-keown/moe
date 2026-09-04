import { describe, expect, it } from "vitest";
import { SummarizerSdkError } from "../src/summarizer.js";
import { buildClaudeSummarizerCommand, runClaudeCommand } from "../src/summarizers/claude.js";
import type { ProcessAdapter, ProcessResult, ProcessSpec } from "../src/summarizers/process.js";

function scriptedProcess(result: Partial<ProcessResult>): ProcessAdapter {
  return {
    async run(_spec: ProcessSpec): Promise<ProcessResult> {
      return {
        code: result.code ?? 0,
        signal: result.signal ?? null,
        stdout: result.stdout ?? "",
        stderr: result.stderr ?? "",
      };
    },
  };
}

function command(overrides: Partial<Parameters<typeof buildClaudeSummarizerCommand>[0]> = {}) {
  return buildClaudeSummarizerCommand({
    prompt: "Summarize this",
    model: "haiku",
    ...overrides,
  });
}

describe("buildClaudeSummarizerCommand", () => {
  it("produces the exact CLI argv for a fresh summary", () => {
    const spec = command();
    expect(spec.args).toEqual([
      "-p",
      "--input-format",
      "text",
      "--output-format",
      "json",
      "--no-session-persistence",
      "--model",
      "haiku",
    ]);
  });

  it("adds --resume for a resumed session", () => {
    const spec = command({ sessionId: "abc-123" });
    expect(spec.args).toContain("--resume");
    expect(spec.args).toContain("abc-123");
  });

  it("adds --system-prompt only for fresh summaries", () => {
    const fresh = command({ systemPrompt: "Be concise" });
    expect(fresh.args).toContain("--system-prompt");

    const resumed = command({ sessionId: "abc-123", systemPrompt: "Be concise" });
    expect(resumed.args).not.toContain("--system-prompt");
  });

  it("strips NODE_OPTIONS from env", () => {
    const spec = command();
    expect(spec.env.NODE_OPTIONS).toBeUndefined();
  });

  it("sets reentrancy guard", () => {
    const spec = command();
    expect(spec.env.MOE_MEMORY_SUMMARIZER_GUARD).toBe("1");
  });

  it("respects cwd when directory exists", () => {
    const spec = command({ cwd: "/" });
    expect(spec.cwd).toBe("/");
  });

  it("drops cwd when directory does not exist", () => {
    const spec = command({ cwd: "/nonexistent/path/xyz" });
    expect(spec.cwd).toBeUndefined();
  });
});

describe("runClaudeCommand", () => {
  it("returns the result from valid JSON output", async () => {
    const process = scriptedProcess({
      stdout: JSON.stringify({ result: "Built a thing." }),
    });
    const result = await runClaudeCommand(command(), process);
    expect(result).toBe("Built a thing.");
  });

  it("classifies only the exact missing resumed session", async () => {
    const process = scriptedProcess({
      code: 1,
      stdout: "",
      stderr: "No conversation found with session ID: missing-42\n",
    });
    await expect(runClaudeCommand(command({ sessionId: "missing-42" }), process)).rejects.toEqual(
      expect.objectContaining({ subtype: "error_during_execution", sessionId: "missing-42" }),
    );
  });

  it("throws SummarizerSdkError on is_error JSON", async () => {
    const process = scriptedProcess({
      stdout: JSON.stringify({ is_error: true, subtype: "rate_limit", session_id: "s1" }),
    });
    await expect(runClaudeCommand(command(), process)).rejects.toBeInstanceOf(SummarizerSdkError);
  });

  it("throws on nonzero exit without matching stderr", async () => {
    const process = scriptedProcess({
      code: 1,
      stdout: "",
      stderr: "Some other error",
    });
    await expect(runClaudeCommand(command(), process)).rejects.toThrow(/exit.*code.*1/);
  });

  it("throws on signal kill", async () => {
    const process = scriptedProcess({
      code: 0,
      signal: "SIGTERM",
      stdout: "",
    });
    await expect(runClaudeCommand(command(), process)).rejects.toThrow(/SIGTERM/);
  });

  it("throws on malformed JSON", async () => {
    const process = scriptedProcess({
      stdout: "not json {{{",
    });
    await expect(runClaudeCommand(command(), process)).rejects.toThrow(/malformed JSON/);
  });

  it("throws on non-string result", async () => {
    const process = scriptedProcess({
      stdout: JSON.stringify({ result: 42 }),
    });
    await expect(runClaudeCommand(command(), process)).rejects.toThrow(/non-string result/);
  });

  it("returns empty string for zero exit with no stdout", async () => {
    const process = scriptedProcess({
      code: 0,
      stdout: "",
    });
    const result = await runClaudeCommand(command(), process);
    expect(result).toBe("");
  });

  it("bounded stderr is truncated to maxStderrBytes", async () => {
    const longStderr = "x".repeat(10000);
    let capturedStderr = "";
    const process: ProcessAdapter = {
      async run(spec: ProcessSpec): Promise<ProcessResult> {
        return {
          code: 1,
          signal: null,
          stdout: "",
          stderr: longStderr.slice(0, spec.maxStderrBytes),
        };
      },
    };
    try {
      await runClaudeCommand(command(), process);
    } catch (e: any) {
      capturedStderr = e.message;
    }
    expect(capturedStderr.length).toBeLessThan(longStderr.length);
  });
});
