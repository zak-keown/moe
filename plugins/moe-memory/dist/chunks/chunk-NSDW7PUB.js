// @generated — do not edit; see scripts/build-runtime.mjs
import { createRequire as __createRequire } from 'module';
const require = __createRequire(import.meta.url);

// src/parser.ts
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
async function detectConversationHarness(filePath) {
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });
  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line);
      if (parsed.payload && (parsed.type === "session_meta" || parsed.type === "turn_context" || parsed.type === "response_item" || parsed.type === "event_msg" || parsed.type === "compacted")) {
        return "codex";
      }
      return "claude";
    } catch {
    }
  }
  return "claude";
}
async function parseConversation(filePath, projectName, archivePath) {
  const harness = await detectConversationHarness(filePath);
  if (harness === "codex") {
    return parseCodexConversation(filePath, projectName, archivePath);
  }
  return parseClaudeConversation(filePath, projectName, archivePath);
}
async function parseClaudeConversation(filePath, projectName, archivePath) {
  const exchanges = [];
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });
  let lineNumber = 0;
  let currentExchange = null;
  const finalizeExchange = () => {
    if (currentExchange && currentExchange.assistantMessages.length > 0) {
      const exchangeId = crypto.createHash("md5").update(`${archivePath}:${currentExchange.userLine}-${currentExchange.lastAssistantLine}`).digest("hex");
      const toolCalls = currentExchange.toolCalls.map((tc) => ({
        ...tc,
        exchangeId
      }));
      const exchange = {
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
        toolCalls: toolCalls.length > 0 ? toolCalls : void 0
      };
      exchanges.push(exchange);
    }
  };
  for await (const line of rl) {
    lineNumber++;
    try {
      const parsed = JSON.parse(line);
      if (parsed.type !== "user" && parsed.type !== "assistant") {
        continue;
      }
      if (!parsed.message) {
        continue;
      }
      let text = "";
      const toolCalls = [];
      if (typeof parsed.message.content === "string") {
        text = parsed.message.content;
      } else if (Array.isArray(parsed.message.content)) {
        const textBlocks = parsed.message.content.filter((block) => block.type === "text" && block.text).map((block) => block.text);
        text = textBlocks.join("\n");
        if (parsed.message.role === "assistant") {
          for (const block of parsed.message.content) {
            if (block.type === "tool_use") {
              const toolCallId = crypto.randomUUID();
              toolCalls.push({
                id: toolCallId,
                exchangeId: "",
                // Will be set when we know the exchange ID
                toolName: block.name || "unknown",
                toolInput: block.input,
                isError: false,
                timestamp: parsed.timestamp || (/* @__PURE__ */ new Date()).toISOString()
              });
            }
          }
        }
        if (parsed.message.role === "user") {
          for (const block of parsed.message.content) {
            if (block.type === "tool_result") {
            }
          }
        }
      }
      if (!text.trim() && toolCalls.length === 0) {
        continue;
      }
      if (parsed.message.role === "user") {
        finalizeExchange();
        currentExchange = {
          project: projectName,
          userMessage: text || "(tool results only)",
          userLine: lineNumber,
          assistantMessages: [],
          lastAssistantLine: lineNumber,
          timestamp: parsed.timestamp || (/* @__PURE__ */ new Date()).toISOString(),
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
          thinkingTriggers: parsed.thinkingMetadata?.triggers ? JSON.stringify(parsed.thinkingMetadata.triggers) : void 0,
          toolCalls: []
        };
      } else if (parsed.message.role === "assistant" && currentExchange) {
        if (text.trim()) {
          currentExchange.assistantMessages.push(text);
        }
        currentExchange.lastAssistantLine = lineNumber;
        if (toolCalls.length > 0) {
          currentExchange.toolCalls.push(...toolCalls);
        }
        if (parsed.timestamp) {
          currentExchange.timestamp = parsed.timestamp;
        }
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
    } catch {
    }
  }
  finalizeExchange();
  return exchanges;
}
function extractTextFromContent(content) {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content.filter(
    (block) => block && typeof block === "object" && typeof block.text === "string"
  ).map((block) => block.text).join("\n");
}
function safeParseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
function stringifyToolOutput(output) {
  if (output === void 0 || output === null) {
    return void 0;
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
function projectFromCwd(cwd) {
  if (!cwd) {
    return void 0;
  }
  const project = path.basename(cwd);
  return project || void 0;
}
async function parseCodexConversation(filePath, projectName, archivePath) {
  const exchanges = [];
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });
  let lineNumber = 0;
  let sessionId;
  let cwd;
  let gitBranch;
  let gitCommit;
  let agentVersion;
  let model;
  let modelProvider;
  let currentExchange = null;
  const toolCallsByCallId = /* @__PURE__ */ new Map();
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
      const exchangeId = crypto.createHash("md5").update(`${archivePath}:${currentExchange.userLine}-${currentExchange.lastAssistantLine}`).digest("hex");
      const toolCalls = currentExchange.toolCalls.map((tc) => ({
        ...tc,
        exchangeId
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
        toolCalls: toolCalls.length > 0 ? toolCalls : void 0
      });
    }
    currentExchange = null;
    toolCallsByCallId.clear();
  };
  const startExchange = (text, timestamp) => {
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
      toolCalls: []
    };
  };
  const appendToolCall = (payload, timestamp) => {
    if (!currentExchange) {
      return;
    }
    const callId = payload.call_id || crypto.randomUUID();
    let toolInput = payload.arguments;
    if (typeof toolInput === "string") {
      toolInput = safeParseJson(toolInput);
    } else if (payload.input !== void 0) {
      toolInput = payload.input;
    } else if (payload.action !== void 0) {
      toolInput = payload.action;
    }
    const toolCall = {
      id: callId,
      exchangeId: "",
      toolName: payload.name || payload.namespace || payload.type || "unknown",
      toolInput,
      isError: false,
      timestamp
    };
    currentExchange.toolCalls.push(toolCall);
    toolCallsByCallId.set(callId, toolCall);
    currentExchange.lastAssistantLine = lineNumber;
  };
  const appendToolResult = (payload) => {
    const callId = payload.call_id;
    if (!callId) {
      return;
    }
    const toolCall = toolCallsByCallId.get(callId);
    if (!toolCall) {
      return;
    }
    const output = stringifyToolOutput(payload.output);
    if (output !== void 0) {
      toolCall.toolResult = output;
    }
    currentExchange.lastAssistantLine = lineNumber;
  };
  for await (const line of rl) {
    lineNumber++;
    if (!line.trim()) {
      continue;
    }
    try {
      const parsed = JSON.parse(line);
      const payload = parsed.payload;
      const timestamp = parsed.timestamp || (/* @__PURE__ */ new Date()).toISOString();
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
          const exchange = currentExchange;
          if (exchange) {
            exchange.assistantMessages.push(text);
            exchange.lastAssistantLine = lineNumber;
            exchange.timestamp = timestamp;
          }
        }
      } else if (payload.type === "function_call" || payload.type === "custom_tool_call" || payload.type === "tool_search_call" || payload.type === "local_shell_call") {
        appendToolCall(payload, timestamp);
      } else if (payload.type === "function_call_output" || payload.type === "custom_tool_call_output" || payload.type === "tool_search_output" || payload.type === "local_shell_call_output") {
        appendToolResult(payload);
      }
    } catch {
    }
  }
  finalizeExchange();
  return exchanges;
}
async function parseConversationFile(filePath) {
  const pathParts = filePath.split("/");
  let project = "unknown";
  const parentDir = pathParts[pathParts.length - 2];
  if (parentDir) {
    project = parentDir;
  }
  const exchanges = await parseConversation(filePath, project, filePath);
  return {
    project,
    exchanges
  };
}

export {
  parseConversation,
  parseConversationFile
};
