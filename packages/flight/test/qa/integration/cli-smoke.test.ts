import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { CLIAdapter } from "../../../src/qa/adapters/cli/adapter.js";
import { runAgent } from "../../../src/qa/agent/agent.js";
import { EvidenceLogger } from "../../../src/qa/evidence/logger.js";
import type { StoryCard } from "../../../src/qa/format/story-card.js";
import type {
  AgentResponse,
  LLMClient,
  ToolCall,
  ToolResult,
} from "../../../src/qa/models/provider.js";
import { makeRunId } from "../../../src/qa/util/id.js";
import { sleep } from "../helpers/mock-http.js";

const card: StoryCard = {
  id: "cli-smoke-001",
  title: "Echo app responds to input",
  status: "ready",
  tags: [],
  description: "Verify the echo app prints input back",
  acceptanceCriteria: ["App echoes typed input"],
  raw: "",
};

const FIXTURE_PATH = join(import.meta.dirname, "../fixtures/echo-app.sh");

function makeScriptedClient(steps: AgentResponse[]): LLMClient {
  let callIndex = 0;

  return {
    async chat() {
      // Small delay to let the process produce output
      await sleep(300);
      const response = steps[callIndex++];
      if (!response) throw new Error("No more scripted responses");
      return response;
    },
    userMessage(content: string) {
      return { role: "user", content };
    },
    toolResultMessages(calls: ToolCall[], results: ToolResult[]) {
      return calls.map((call, i) => ({
        role: "tool_result",
        tool_call_id: call.id,
        content: results[i].text,
      }));
    },
  };
}

describe("CLI adapter e2e smoke test", () => {
  test("runs agent loop against a real CLI process", async () => {
    const logDir = mkdtempSync(join(tmpdir(), "moe-flight-cli-smoke-"));
    const adapter = new CLIAdapter({ runDir: logDir });
    const logger = new EvidenceLogger(logDir);

    const steps: AgentResponse[] = [
      // Turn 1: type to launch the echo app inside the shell
      {
        text: "Launch the echo app",
        toolCalls: [{ id: "call_0", name: "type", arguments: { text: `bash ${FIXTURE_PATH}\n` } }],
        stopReason: "tool_use",
        rawAssistantMessage: { role: "assistant", content: "launch echo" },
        usage: { inputTokens: 0, outputTokens: 0 },
      },
      // Turn 2: read_output — should see welcome message
      {
        text: "Let me read the initial output",
        toolCalls: [{ id: "call_1", name: "read_output", arguments: {} }],
        stopReason: "tool_use",
        rawAssistantMessage: { role: "assistant", content: "read initial" },
        usage: { inputTokens: 0, outputTokens: 0 },
      },
      // Turn 3: type "hello world\n"
      {
        text: "I see the welcome message, let me type something",
        toolCalls: [{ id: "call_2", name: "type", arguments: { text: "hello world\n" } }],
        stopReason: "tool_use",
        rawAssistantMessage: { role: "assistant", content: "typing" },
        usage: { inputTokens: 0, outputTokens: 0 },
      },
      // Turn 3: read_output — should see "You said: hello world"
      {
        text: "Let me read the response",
        toolCalls: [{ id: "call_3", name: "read_output", arguments: {} }],
        stopReason: "tool_use",
        rawAssistantMessage: { role: "assistant", content: "read response" },
        usage: { inputTokens: 0, outputTokens: 0 },
      },
      // Turn 4: report result
      {
        text: "The echo app works correctly",
        toolCalls: [
          {
            id: "call_4",
            name: "report_result",
            arguments: {
              status: "pass",
              summary: "Echo app correctly echoes input",
              reasoning: "The app displayed a welcome message and echoed back the typed input",
              criteria: [
                {
                  criterion: "App echoes typed input",
                  verdict: "pass",
                  evidence: "read_output showed the typed line echoed back",
                },
              ],
            },
          },
        ],
        stopReason: "tool_use",
        rawAssistantMessage: { role: "assistant", content: "reporting" },
        usage: { inputTokens: 0, outputTokens: 0 },
      },
    ];

    const client = makeScriptedClient(steps);

    try {
      await adapter.start(`bash ${FIXTURE_PATH}`);
      const result = await runAgent(card, adapter, client, logger, undefined, {
        runId: makeRunId(card.id),
        budgetMs: 60_000,
        reflectionInterval: 0,
      });

      expect(result.status).toBe("pass");
      expect(result.scenario).toBe("cli-smoke-001");
      expect(result.summary).toBe("Echo app correctly echoes input");
    } finally {
      await adapter.close();
    }
  });
});
