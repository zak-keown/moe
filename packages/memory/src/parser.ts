import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import type { ConversationExchange, ConversationHarness, ToolCall } from "./types.js";

interface JSONLMessage {
  type: string;
  message?: {
    role: "user" | "assistant";
    content: string | Array<any>;
    model?: string;
  };
  timestamp?: string;
  uuid?: string;
  parentUuid?: string;
  isSidechain?: boolean;
  sessionId?: string;
  cwd?: string;
  gitBranch?: string;
  gitCommit?: string;
  version?: string;
  thinkingMetadata?: {
    level?: string;
    disabled?: boolean;
    triggers?: Array<any>;
  };
}

interface CodexRolloutLine {
  timestamp?: string;
  type?: string;
  payload?: any;
}

interface ExchangeBuilder {
  project: string;
  userMessage: string;
  userLine: number;
  assistantMessages: string[];
  lastAssistantLine: number;
  timestamp: string;
  // `| undefined` is deliberate, not noise: these come from JSONL fields that
  // are frequently absent, the parser assigns `undefined` to mean "the transcript
  // did not say", and every consumer reads them as `x ?? default`. Under
  // exactOptionalPropertyTypes that has to be declared.
  parentUuid?: string | undefined;
  isSidechain?: boolean | undefined;
  harness?: ConversationHarness | undefined;
  sessionId?: string | undefined;
  cwd?: string | undefined;
  gitBranch?: string | undefined;
  gitCommit?: string | undefined;
  claudeVersion?: string | undefined;
  agentVersion?: string | undefined;
  model?: string | undefined;
  modelProvider?: string | undefined;
  thinkingLevel?: string | undefined;
  thinkingDisabled?: boolean | undefined;
  thinkingTriggers?: string | undefined;
  toolCalls: ToolCall[];
}

async function detectConversationHarness(filePath: string): Promise<ConversationHarness> {
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line) as CodexRolloutLine;
      if (
        parsed.payload &&
        (parsed.type === "session_meta" ||
          parsed.type === "turn_context" ||
          parsed.type === "response_item" ||
          parsed.type === "event_msg" ||
          parsed.type === "compacted")
      ) {
        return "codex";
      }
      return "claude";
    } catch {}
  }

  return "claude";
}

export async function parseConversation(
  filePath: string,
  projectName: string,
  archivePath: string,
): Promise<ConversationExchange[]> {
  const harness = await detectConversationHarness(filePath);
  if (harness === "codex") {
    return parseCodexConversation(filePath, projectName, archivePath);
  }
  return parseClaudeConversation(filePath, projectName, archivePath);
}

async function parseClaudeConversation(
  filePath: string,
  projectName: string,
  archivePath: string,
): Promise<ConversationExchange[]> {
  const exchanges: ConversationExchange[] = [];
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  let lineNumber = 0;
  let currentExchange: ExchangeBuilder | null = null;

  const finalizeExchange = () => {
    if (currentExchange && currentExchange.assistantMessages.length > 0) {
      const exchangeId = crypto
        .createHash("md5")
        .update(`${archivePath}:${currentExchange.userLine}-${currentExchange.lastAssistantLine}`)
        .digest("hex");

      // Update tool call exchange IDs
      const toolCalls = currentExchange.toolCalls.map((tc) => ({
        ...tc,
        exchangeId,
      }));

      const exchange: ConversationExchange = {
        id: exchangeId,
        project: currentExchange.project,
        timestamp: currentExchange.timestamp,
        userMessage: currentExchange.userMessage,
        assistantMessage: currentExchange.assistantMessages.join("\n\n"),
        archivePath,
        lineStart: currentExchange.userLine,
        lineEnd: currentExchange.lastAssistantLine,
        parentUuid: currentExchange.parentUuid,
        isSidechain: currentExchange.isSidechain,
        harness: currentExchange.harness,
        sessionId: currentExchange.sessionId,
        cwd: currentExchange.cwd,
        gitBranch: currentExchange.gitBranch,
        gitCommit: currentExchange.gitCommit,
        claudeVersion: currentExchange.claudeVersion,
        agentVersion: currentExchange.agentVersion,
        model: currentExchange.model,
        modelProvider: currentExchange.modelProvider,
        thinkingLevel: currentExchange.thinkingLevel,
        thinkingDisabled: currentExchange.thinkingDisabled,
        thinkingTriggers: currentExchange.thinkingTriggers,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      };
      exchanges.push(exchange);
    }
  };

  for await (const line of rl) {
    lineNumber++;

    try {
      const parsed: JSONLMessage = JSON.parse(line);

      // Skip non-message types
      if (parsed.type !== "user" && parsed.type !== "assistant") {
        continue;
      }

      if (!parsed.message) {
        continue;
      }

      // Extract text from message content
      let text = "";
      const toolCalls: ToolCall[] = [];

      if (typeof parsed.message.content === "string") {
        text = parsed.message.content;
      } else if (Array.isArray(parsed.message.content)) {
        // Extract text blocks
        const textBlocks = parsed.message.content
          .filter((block) => block.type === "text" && block.text)
          .map((block) => block.text);
        text = textBlocks.join("\n");

        // Extract tool use blocks
        if (parsed.message.role === "assistant") {
          for (const block of parsed.message.content) {
            if (block.type === "tool_use") {
              const toolCallId = crypto.randomUUID();
              toolCalls.push({
                id: toolCallId,
                exchangeId: "", // Will be set when we know the exchange ID
                toolName: block.name || "unknown",
                toolInput: block.input,
                isError: false,
                timestamp: parsed.timestamp || new Date().toISOString(),
              });
            }
          }
        }

        // Extract tool results
        if (parsed.message.role === "user") {
          for (const block of parsed.message.content) {
            if (block.type === "tool_result") {
              // Store for later association with tool_use
              // For now, we'll just track results exist
              // TODO: Match tool_use_id to previous tool_use
            }
          }
        }
      }

      // Skip empty messages
      if (!text.trim() && toolCalls.length === 0) {
        continue;
      }

      if (parsed.message.role === "user") {
        // Finalize previous exchange before starting new one
        finalizeExchange();

        // Start new exchange
        currentExchange = {
          project: projectName,
          userMessage: text || "(tool results only)",
          userLine: lineNumber,
          assistantMessages: [],
          lastAssistantLine: lineNumber,
          timestamp: parsed.timestamp || new Date().toISOString(),
          parentUuid: parsed.parentUuid,
          isSidechain: parsed.isSidechain,
          harness: "claude",
          sessionId: parsed.sessionId,
          cwd: parsed.cwd,
          gitBranch: parsed.gitBranch,
          gitCommit: parsed.gitCommit,
          claudeVersion: parsed.version,
          agentVersion: parsed.version,
          model: parsed.message.model,
          thinkingLevel: parsed.thinkingMetadata?.level,
          thinkingDisabled: parsed.thinkingMetadata?.disabled,
          thinkingTriggers: parsed.thinkingMetadata?.triggers
            ? JSON.stringify(parsed.thinkingMetadata.triggers)
            : undefined,
          toolCalls: [],
        };
      } else if (parsed.message.role === "assistant" && currentExchange) {
        // Accumulate assistant messages
        if (text.trim()) {
          currentExchange.assistantMessages.push(text);
        }
        currentExchange.lastAssistantLine = lineNumber;

        // Add tool calls to current exchange
        if (toolCalls.length > 0) {
          currentExchange.toolCalls.push(...toolCalls);
        }

        // Update timestamp to last assistant message
        if (parsed.timestamp) {
          currentExchange.timestamp = parsed.timestamp;
        }

        // Update metadata from assistant messages (use most recent)
        if (parsed.sessionId) currentExchange.sessionId = parsed.sessionId;
        if (parsed.cwd) currentExchange.cwd = parsed.cwd;
        if (parsed.gitBranch) currentExchange.gitBranch = parsed.gitBranch;
        if (parsed.gitCommit) currentExchange.gitCommit = parsed.gitCommit;
        if (parsed.version) {
          currentExchange.claudeVersion = parsed.version;
          currentExchange.agentVersion = parsed.version;
        }
        if (parsed.message.model) currentExchange.model = parsed.message.model;
      }
    } catch {}
  }

  // Finalize last exchange
  finalizeExchange();

  return exchanges;
}

function extractTextFromContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .filter(
      (block) => block && typeof block === "object" && typeof (block as any).text === "string",
    )
    .map((block) => (block as any).text)
    .join("\n");
}

function safeParseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function stringifyToolOutput(output: unknown): string | undefined {
  if (output === undefined || output === null) {
    return undefined;
  }
  if (typeof output === "string") {
    return output;
  }

  const text = extractTextFromContent(output);
  if (text.trim()) {
    return text;
  }

  return JSON.stringify(output);
}

function projectFromCwd(cwd?: string): string | undefined {
  if (!cwd) {
    return undefined;
  }
  const project = path.basename(cwd);
  return project || undefined;
}

async function parseCodexConversation(
  filePath: string,
  projectName: string,
  archivePath: string,
): Promise<ConversationExchange[]> {
  const exchanges: ConversationExchange[] = [];
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  let lineNumber = 0;
  let sessionId: string | undefined;
  let cwd: string | undefined;
  let gitBranch: string | undefined;
  let gitCommit: string | undefined;
  let agentVersion: string | undefined;
  let model: string | undefined;
  let modelProvider: string | undefined;
  let currentExchange: ExchangeBuilder | null = null;
  const toolCallsByCallId = new Map<string, ToolCall>();

  const currentProject = () => projectFromCwd(cwd) || projectName;

  const applyMetadataToCurrentExchange = () => {
    if (!currentExchange) {
      return;
    }
    currentExchange.project = currentProject();
    currentExchange.sessionId = sessionId;
    currentExchange.cwd = cwd;
    currentExchange.gitBranch = gitBranch;
    currentExchange.gitCommit = gitCommit;
    currentExchange.agentVersion = agentVersion;
    currentExchange.model = model;
    currentExchange.modelProvider = modelProvider;
  };

  const finalizeExchange = () => {
    if (currentExchange && currentExchange.assistantMessages.length > 0) {
      applyMetadataToCurrentExchange();
      const exchangeId = crypto
        .createHash("md5")
        .update(`${archivePath}:${currentExchange.userLine}-${currentExchange.lastAssistantLine}`)
        .digest("hex");

      const toolCalls = currentExchange.toolCalls.map((tc) => ({
        ...tc,
        exchangeId,
      }));

      exchanges.push({
        id: exchangeId,
        project: currentExchange.project,
        timestamp: currentExchange.timestamp,
        userMessage: currentExchange.userMessage,
        assistantMessage: currentExchange.assistantMessages.join("\n\n"),
        archivePath,
        lineStart: currentExchange.userLine,
        lineEnd: currentExchange.lastAssistantLine,
        harness: "codex",
        sessionId: currentExchange.sessionId,
        cwd: currentExchange.cwd,
        gitBranch: currentExchange.gitBranch,
        gitCommit: currentExchange.gitCommit,
        agentVersion: currentExchange.agentVersion,
        model: currentExchange.model,
        modelProvider: currentExchange.modelProvider,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      });
    }
    currentExchange = null;
    toolCallsByCallId.clear();
  };

  const startExchange = (text: string, timestamp: string) => {
    finalizeExchange();
    currentExchange = {
      project: currentProject(),
      userMessage: text,
      userLine: lineNumber,
      assistantMessages: [],
      lastAssistantLine: lineNumber,
      timestamp,
      harness: "codex",
      sessionId,
      cwd,
      gitBranch,
      gitCommit,
      agentVersion,
      model,
      modelProvider,
      toolCalls: [],
    };
  };

  const appendToolCall = (payload: any, timestamp: string) => {
    if (!currentExchange) {
      return;
    }

    const callId = payload.call_id || crypto.randomUUID();
    let toolInput: unknown = payload.arguments;
    if (typeof toolInput === "string") {
      toolInput = safeParseJson(toolInput);
    } else if (payload.input !== undefined) {
      toolInput = payload.input;
    } else if (payload.action !== undefined) {
      toolInput = payload.action;
    }

    const toolCall: ToolCall = {
      id: callId,
      exchangeId: "",
      toolName: payload.name || payload.namespace || payload.type || "unknown",
      toolInput,
      isError: false,
      timestamp,
    };

    currentExchange.toolCalls.push(toolCall);
    toolCallsByCallId.set(callId, toolCall);
    currentExchange.lastAssistantLine = lineNumber;
  };

  const appendToolResult = (payload: any) => {
    const callId = payload.call_id;
    if (!callId) {
      return;
    }
    const toolCall = toolCallsByCallId.get(callId);
    if (!toolCall) {
      return;
    }
    const output = stringifyToolOutput(payload.output);
    if (output !== undefined) {
      toolCall.toolResult = output;
    }
    currentExchange!.lastAssistantLine = lineNumber;
  };

  for await (const line of rl) {
    lineNumber++;
    if (!line.trim()) {
      continue;
    }

    try {
      const parsed = JSON.parse(line) as CodexRolloutLine;
      const payload = parsed.payload;
      const timestamp = parsed.timestamp || new Date().toISOString();

      if (parsed.type === "session_meta" && payload) {
        sessionId = payload.id || sessionId;
        cwd = payload.cwd || cwd;
        gitBranch = payload.git?.branch || gitBranch;
        gitCommit = payload.git?.commit || gitCommit;
        agentVersion = payload.cli_version || agentVersion;
        modelProvider = payload.model_provider || modelProvider;
        applyMetadataToCurrentExchange();
        continue;
      }

      if (parsed.type === "turn_context" && payload) {
        cwd = payload.cwd || cwd;
        model = payload.model || model;
        applyMetadataToCurrentExchange();
        continue;
      }

      if (parsed.type !== "response_item" || !payload) {
        continue;
      }

      if (payload.type === "message") {
        const text = extractTextFromContent(payload.content);
        if (!text.trim()) {
          continue;
        }

        if (payload.role === "user") {
          startExchange(text, timestamp);
        } else if (payload.role === "assistant") {
          const exchange = currentExchange as ExchangeBuilder | null;
          if (exchange) {
            exchange.assistantMessages.push(text);
            exchange.lastAssistantLine = lineNumber;
            exchange.timestamp = timestamp;
          }
        }
      } else if (
        payload.type === "function_call" ||
        payload.type === "custom_tool_call" ||
        payload.type === "tool_search_call" ||
        payload.type === "local_shell_call"
      ) {
        appendToolCall(payload, timestamp);
      } else if (
        payload.type === "function_call_output" ||
        payload.type === "custom_tool_call_output" ||
        payload.type === "tool_search_output" ||
        payload.type === "local_shell_call_output"
      ) {
        appendToolResult(payload);
      }
    } catch {}
  }

  finalizeExchange();

  return exchanges;
}

/**
 * Convenience function to parse a conversation file
 * Extracts project name from the file path and returns exchanges with metadata
 */
export async function parseConversationFile(filePath: string): Promise<{
  project: string;
  exchanges: ConversationExchange[];
}> {
  // Extract project name from path (directory name before the .jsonl file)
  const pathParts = filePath.split("/");
  let project = "unknown";

  // Find the parent directory name (second to last part)
  const parentDir = pathParts[pathParts.length - 2];
  if (parentDir) {
    project = parentDir;
  }

  const exchanges = await parseConversation(filePath, project, filePath);

  return {
    project,
    exchanges,
  };
}
