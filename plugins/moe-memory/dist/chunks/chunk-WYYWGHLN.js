// @generated — do not edit; see scripts/build-runtime.mjs
import { createRequire as __createRequire } from 'module';
const require = __createRequire(import.meta.url);
import {
  codexVersionRequirementMessage,
  parseCodexCliVersion,
  versionMeetsMinimum
} from "./chunk-KVDJIHLR.js";
import {
  SUMMARIZER_CONTEXT_MARKER
} from "./chunk-NH4NDHAK.js";
import {
  VERSION
} from "./chunk-ZCVHMAKN.js";

// src/summarizers/claude.ts
import fs from "node:fs";
function buildClaudeSummarizerCommand(options) {
  const claudeBin = process.env.MOE_MEMORY_CLAUDE_BIN || "claude";
  const args = [
    "-p",
    "--input-format",
    "text",
    "--output-format",
    "json",
    "--no-session-persistence",
    "--model",
    options.model
  ];
  if (options.sessionId) {
    args.push("--resume", options.sessionId);
  }
  if (!options.sessionId && options.systemPrompt) {
    args.push("--system-prompt", options.systemPrompt);
  }
  const env = {
    ...process.env,
    MOE_MEMORY_SUMMARIZER_GUARD: "1",
    NODE_OPTIONS: void 0
  };
  const baseUrl = process.env.MOE_MEMORY_API_BASE_URL;
  const token = process.env.MOE_MEMORY_API_TOKEN;
  if (baseUrl) env.ANTHROPIC_BASE_URL = baseUrl;
  if (token) env.ANTHROPIC_AUTH_TOKEN = token;
  return {
    command: claudeBin,
    args,
    cwd: options.cwd && fs.existsSync(options.cwd) ? options.cwd : void 0,
    env,
    stdin: options.prompt,
    timeoutMs: Number(process.env.MOE_MEMORY_API_TIMEOUT_MS) || 12e4,
    maxStderrBytes: 4096
  };
}
async function runClaudeCommand(spec, adapter) {
  const result = await adapter.run(spec);
  if (result.signal) {
    throw new Error(`Claude process killed by signal ${result.signal}`);
  }
  if (!result.stdout.trim()) {
    if (result.code !== 0) {
      const stderrMatch = result.stderr.match(/No conversation found with session ID: (.+)/);
      if (stderrMatch) {
        throw new SummarizerSdkError("error_during_execution", stderrMatch[1]?.trim());
      }
      throw new Error(`Claude exited with code ${result.code}: ${result.stderr.trim()}`);
    }
    return "";
  }
  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    throw new Error(`Claude returned malformed JSON: ${result.stdout.slice(0, 200)}`);
  }
  if (parsed.is_error) {
    throw new SummarizerSdkError(parsed.subtype || "unknown", parsed.session_id);
  }
  if (typeof parsed.result !== "string") {
    throw new Error(`Claude returned non-string result: ${JSON.stringify(parsed).slice(0, 200)}`);
  }
  return parsed.result;
}
function buildSummarySystemPrompt() {
  return 'Write concise, factual summaries. Output ONLY the summary - no preamble, no "Here is", no "I will". Your output will be indexed directly.';
}
function buildSummaryPrompt(conversationText, sessionId) {
  const preamble = `${SUMMARIZER_CONTEXT_MARKER}.

Please write a concise, factual summary of this conversation. Output ONLY the summary - no preamble. Claude will see this summary when searching previous conversations for useful memories and information.

Summarize what happened in 2-4 sentences. Be factual and specific. Output in <summary></summary> tags.

Include:
- What was built/changed/discussed (be specific)
- Key technical decisions or approaches
- Problems solved or current state

Exclude:
- Apologies, meta-commentary, or your questions
- Raw logs or debug output
- Generic descriptions - focus on what makes THIS conversation unique

Good:
<summary>Built JWT authentication for React app with refresh tokens and protected routes. Fixed token expiration bug by implementing refresh-during-request logic.</summary>

Bad:
<summary>I apologize. The conversation discussed authentication and various approaches were considered...</summary>`;
  if (sessionId) {
    return preamble;
  }
  return `${preamble}

${conversationText}`;
}
function buildChunkPrompt(conversationText) {
  return `${SUMMARIZER_CONTEXT_MARKER}.

Please write a concise summary of this part of a conversation in 2-3 sentences. What happened, what was built/discussed. Use <summary></summary> tags.

${conversationText}

Example: <summary>Implemented HID keyboard functionality for ESP32. Hit Bluetooth controller initialization error, fixed by adjusting memory allocation.</summary>`;
}
function buildSynthesisPrompt(chunkSummaries) {
  return `${SUMMARIZER_CONTEXT_MARKER}.

Please write a concise, factual summary that synthesizes these part-summaries into one cohesive paragraph. Focus on what was accomplished and any notable technical decisions or challenges. Output in <summary></summary> tags. Claude will see this summary when searching previous conversations for useful memories and information.

Part summaries:
${chunkSummaries.map((s, i) => `${i + 1}. ${s}`).join("\n")}

Good:
<summary>Built conversation search system with JavaScript, sqlite-vec, and local embeddings. Implemented hierarchical summarization for long conversations. System archives conversations permanently and provides semantic search via CLI.</summary>

Bad:
<summary>This conversation synthesizes several topics discussed across multiple parts...</summary>

Your summary (max 200 words):`;
}

// src/summarizers/codex.ts
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
function appServerTimeoutMs() {
  const configured = Number(process.env.MOE_MEMORY_CODEX_SUMMARY_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : 12e4;
}
function getApiEnv() {
  const baseUrl = process.env.MOE_MEMORY_API_BASE_URL;
  const token = process.env.MOE_MEMORY_API_TOKEN;
  const timeoutMs = process.env.MOE_MEMORY_API_TIMEOUT_MS;
  return {
    ...process.env,
    MOE_MEMORY_SUMMARIZER_GUARD: "1",
    ...baseUrl && { ANTHROPIC_BASE_URL: baseUrl },
    ...token && { ANTHROPIC_AUTH_TOKEN: token },
    ...timeoutMs && { API_TIMEOUT_MS: timeoutMs }
  };
}
function readCommandOutput(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(output);
      } else {
        reject(
          new Error(`${command} ${args.join(" ")} failed with exit code ${code}: ${output.trim()}`)
        );
      }
    });
  });
}
function requireThreadId(result, method) {
  const threadId = result?.thread?.id;
  if (typeof threadId !== "string" || !threadId) {
    throw new Error(`${method} returned unexpected response: ${JSON.stringify(result)}`);
  }
  return threadId;
}
function requireTurnId(result, method) {
  const turnId = result?.turn?.id;
  if (typeof turnId !== "string" || !turnId) {
    throw new Error(`${method} returned unexpected response: ${JSON.stringify(result)}`);
  }
  return turnId;
}
async function assertSupportedCodexVersion(command, env) {
  if (command.skipVersionCheck) {
    return;
  }
  const output = await readCommandOutput(
    command.command,
    command.versionArgs || ["--version"],
    env
  );
  const version = parseCodexCliVersion(output);
  if (!version || !versionMeetsMinimum(version)) {
    throw new Error(codexVersionRequirementMessage(output));
  }
}
async function runCodexCommand(command) {
  const env = getApiEnv();
  await assertSupportedCodexVersion(command, env);
  return new Promise((resolve, reject) => {
    const child = spawn(command.command, command.args, {
      env,
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stderr = "";
    let answer = "";
    let nextRequestId = 1;
    let targetTurnId;
    let finished = false;
    let timeout;
    const pending = /* @__PURE__ */ new Map();
    const lines = createInterface({ input: child.stdout });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    const cleanup = () => {
      if (timeout) {
        clearTimeout(timeout);
      }
      lines.close();
      if (!child.killed) {
        child.kill("SIGTERM");
      }
    };
    const finish = (error, result = "") => {
      if (finished) return;
      finished = true;
      cleanup();
      if (error) {
        reject(error);
      } else {
        resolve(result);
      }
    };
    timeout = setTimeout(() => {
      finish(
        new Error(`Codex summarizer timed out after ${appServerTimeoutMs()}ms: ${stderr.trim()}`)
      );
    }, appServerTimeoutMs());
    const send = (method, params) => {
      const id = nextRequestId++;
      child.stdin.write(`${JSON.stringify({ method, id, params })}
`);
      return new Promise((resolveRequest, rejectRequest) => {
        pending.set(id, { method, resolve: resolveRequest, reject: rejectRequest });
      });
    };
    const notify = (method, params) => {
      const message = params === void 0 ? { method } : { method, params };
      child.stdin.write(`${JSON.stringify(message)}
`);
    };
    lines.on("line", (line) => {
      if (!line.trim()) return;
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        finish(new Error(`Codex app-server emitted invalid JSON: ${line}`));
        return;
      }
      if (typeof message.id === "number" && pending.has(message.id)) {
        const request = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) {
          request.reject(new Error(`${request.method} failed: ${JSON.stringify(message.error)}`));
        } else {
          request.resolve(message.result);
        }
        return;
      }
      if (message.method === "item/agentMessage/delta") {
        answer += message.params?.delta ?? "";
        return;
      }
      if (message.method === "item/completed" && message.params?.item?.type === "agentMessage") {
        answer = message.params.item.text ?? answer;
        return;
      }
      if (message.method === "turn/completed" && (!targetTurnId || message.params?.turn?.id === targetTurnId)) {
        if (message.params.turn.status === "completed") {
          finish(void 0, answer);
        } else {
          const detail = message.params.turn.error?.message || message.params.turn.status;
          finish(new Error(`Codex summarizer turn did not complete: ${detail}`));
        }
      }
    });
    child.on("error", (error) => {
      finish(error);
    });
    child.on("exit", (code) => {
      if (!finished) {
        const detail = code === 0 ? "Codex app-server exited before the summary turn completed" : `Codex summarizer failed with exit code ${code}: ${stderr.trim()}`;
        finish(new Error(detail));
      }
    });
    (async () => {
      try {
        await send("initialize", {
          clientInfo: {
            name: "moe-memory",
            title: "Moe Memory",
            version: VERSION
          },
          capabilities: {
            experimentalApi: true
          }
        });
        notify("initialized");
        const fork = await send("thread/fork", {
          threadId: command.sessionId,
          ephemeral: true,
          sandbox: "read-only",
          approvalPolicy: "never",
          ...command.model ? { model: command.model } : {}
        });
        const forkThreadId = requireThreadId(fork, "thread/fork");
        const turn = await send("turn/start", {
          threadId: forkThreadId,
          input: [
            {
              type: "text",
              text: command.prompt,
              textElements: []
            }
          ]
        });
        targetTurnId = requireTurnId(turn, "turn/start");
      } catch (error) {
        finish(error instanceof Error ? error : new Error(String(error)));
      }
    })();
  });
}
function buildCodexSummarizerCommand(args) {
  const command = args.codexBin || process.env.MOE_MEMORY_CODEX_BIN || "codex";
  return {
    command,
    args: ["app-server"],
    prompt: args.prompt,
    sessionId: args.sessionId,
    model: args.model
  };
}

// src/summarizers/process.ts
import { spawn as spawn2 } from "node:child_process";
function createChildProcessAdapter() {
  return {
    async run(spec) {
      return new Promise((resolve, reject) => {
        const child = spawn2(spec.command, spec.args, {
          cwd: spec.cwd,
          env: { ...spec.env, NODE_OPTIONS: void 0 },
          stdio: ["pipe", "pipe", "pipe"]
        });
        let stdout = "";
        let stderr = "";
        let stderrBytes = 0;
        let finished = false;
        const timeout = setTimeout(() => {
          if (!finished) {
            finished = true;
            child.kill("SIGTERM");
            reject(new Error(`Process timed out after ${spec.timeoutMs}ms`));
          }
        }, spec.timeoutMs);
        child.stdout.on("data", (chunk) => {
          stdout += chunk.toString();
        });
        child.stderr.on("data", (chunk) => {
          const text = chunk.toString();
          if (stderrBytes < spec.maxStderrBytes) {
            stderr += text.slice(0, spec.maxStderrBytes - stderrBytes);
          }
          stderrBytes += Buffer.byteLength(text);
        });
        child.on("error", (error) => {
          if (!finished) {
            finished = true;
            clearTimeout(timeout);
            reject(error);
          }
        });
        child.on("close", (code, signal) => {
          if (!finished) {
            finished = true;
            clearTimeout(timeout);
            resolve({
              code: code ?? 1,
              signal: signal ?? null,
              stdout,
              stderr
            });
          }
        });
        if (spec.stdin) {
          child.stdin.write(spec.stdin);
        }
        child.stdin.end();
      });
    }
  };
}

// src/summarizer.ts
var SummarizerSdkError = class extends Error {
  constructor(subtype, sessionId) {
    super(`Summarizer SDK error: ${subtype}${sessionId ? ` (session ${sessionId})` : ""}`);
    this.subtype = subtype;
    this.sessionId = sessionId;
    this.name = "SummarizerSdkError";
  }
};
function isResumeFailure(error) {
  return error instanceof SummarizerSdkError && error.subtype === "error_during_execution";
}
var SummarizerThinkingBudgetError = class extends Error {
  constructor(rawResult) {
    super(
      `Summarizer hit a persistent thinking.budget_tokens error on both the primary and fallback model: ${rawResult}`
    );
    this.rawResult = rawResult;
    this.name = "SummarizerThinkingBudgetError";
  }
};
function shouldSkipReentrantSync() {
  return process.env.MOE_MEMORY_SUMMARIZER_GUARD === "1";
}
function formatConversationText(exchanges) {
  return exchanges.map((ex) => {
    return `User: ${ex.userMessage}

Agent: ${ex.assistantMessage}`;
  }).join("\n\n---\n\n");
}
function extractSummary(text) {
  const match = text.match(/<summary>(.*?)<\/summary>/s);
  const captured = match?.[1];
  if (captured !== void 0) {
    return captured.trim();
  }
  return text.trim();
}
function buildSummarizerQueryOptions(args) {
  const { model, sessionId } = args;
  return {
    model,
    max_tokens: 4096,
    env: getApiEnv(),
    resume: sessionId,
    persistSession: false,
    ...sessionId ? {} : { systemPrompt: buildSummarySystemPrompt() }
  };
}
function buildCodexSummaryPrompt() {
  return `${SUMMARIZER_CONTEXT_MARKER}.

You are running in an ephemeral Codex fork of an existing session. Use the forked session context, including available reasoning summaries and thinking context, to write a concise, factual summary of the conversation.

Do not inspect files, run commands, search the web, or modify state. Use only the conversation context already available in this forked session.

Output ONLY a <summary></summary> block. Summarize what happened in 2-4 sentences.

Include:
- What was built/changed/discussed (be specific)
- Key technical decisions or approaches
- Problems solved or current state

Exclude:
- Apologies, meta-commentary, or your questions
- Raw logs or debug output
- Generic descriptions - focus on what makes THIS conversation unique

Good:
<summary>Built JWT authentication for React app with refresh tokens and protected routes. Fixed token expiration bug by implementing refresh-during-request logic.</summary>

Bad:
<summary>I apologize. The conversation discussed authentication and various approaches were considered...</summary>`;
}
async function callClaude(prompt, sessionId, useFallback = false, cwd) {
  const primaryModel = process.env.MOE_MEMORY_API_MODEL || "haiku";
  const fallbackModel = process.env.MOE_MEMORY_API_MODEL_FALLBACK || "sonnet";
  const model = useFallback ? fallbackModel : primaryModel;
  const spec = buildClaudeSummarizerCommand({
    prompt,
    model,
    sessionId,
    cwd,
    systemPrompt: sessionId ? void 0 : buildSummarySystemPrompt()
  });
  const adapter = createChildProcessAdapter();
  try {
    return await runClaudeCommand(spec, adapter);
  } catch (error) {
    if (error instanceof Error && error.message.includes("thinking.budget_tokens")) {
      if (!useFallback) {
        console.log(
          `    ${primaryModel} hit thinking budget error, retrying with ${fallbackModel}`
        );
        return await callClaude(prompt, sessionId, true, cwd);
      }
      throw new SummarizerThinkingBudgetError(error.message);
    }
    throw error;
  }
}
async function callCodex(prompt, sessionId, model) {
  const command = buildCodexSummarizerCommand({ sessionId, prompt, model });
  return runCodexCommand(command);
}
function chunkExchanges(exchanges, chunkSize) {
  const chunks = [];
  for (let i = 0; i < exchanges.length; i += chunkSize) {
    chunks.push(exchanges.slice(i, i + chunkSize));
  }
  return chunks;
}
function getCodexSessionId(exchanges, sessionId) {
  if (!exchanges.some((exchange) => exchange.harness === "codex")) {
    return void 0;
  }
  return sessionId || exchanges.find((exchange) => exchange.sessionId)?.sessionId;
}
function getCodexModel(_exchanges) {
  return process.env.MOE_MEMORY_CODEX_MODEL || void 0;
}
async function summarizeConversation(exchanges, sessionId) {
  if (exchanges.length === 0) {
    return "Trivial conversation with no substantive content.";
  }
  if (exchanges.length === 1) {
    const text = formatConversationText(exchanges);
    if (text.length < 100 || exchanges[0]?.userMessage.trim() === "/exit") {
      return "Trivial conversation with no substantive content.";
    }
  }
  const codexSessionId = getCodexSessionId(exchanges, sessionId);
  if (codexSessionId) {
    try {
      const result = await callCodex(
        buildCodexSummaryPrompt(),
        codexSessionId,
        getCodexModel(exchanges)
      );
      return extractSummary(result);
    } catch (error) {
      console.log(
        `  Codex summarizer unavailable, falling back to transcript text: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  if (exchanges.length <= 15) {
    const claudeSessionId = codexSessionId ? void 0 : sessionId;
    const cwd = claudeSessionId ? exchanges.find((e) => e.cwd)?.cwd : void 0;
    const conversationText = claudeSessionId ? "" : formatConversationText(exchanges);
    const prompt = buildSummaryPrompt(conversationText, claudeSessionId);
    try {
      const result = await callClaude(prompt, claudeSessionId, false, cwd);
      return extractSummary(result);
    } catch (error) {
      if (claudeSessionId && isResumeFailure(error)) {
        console.log(
          `    resume failed for ${claudeSessionId} (${error.message}); retrying without resume`
        );
        const fullPrompt = buildSummaryPrompt(formatConversationText(exchanges));
        const result = await callClaude(fullPrompt);
        return extractSummary(result);
      }
      throw error;
    }
  }
  console.log(
    `  Long conversation (${exchanges.length} exchanges) - using hierarchical summarization`
  );
  const chunks = chunkExchanges(exchanges, 8);
  console.log(`  Split into ${chunks.length} chunks`);
  const chunkSummaries = [];
  for (const [i, chunk] of chunks.entries()) {
    const chunkText = formatConversationText(chunk);
    const prompt = buildChunkPrompt(chunkText);
    try {
      const summary = await callClaude(prompt);
      const extracted = extractSummary(summary);
      chunkSummaries.push(extracted);
      console.log(`  Chunk ${i + 1}/${chunks.length}: ${extracted.split(/\s+/).length} words`);
    } catch {
      console.log(`  Chunk ${i + 1} failed, skipping`);
    }
  }
  if (chunkSummaries.length === 0) {
    return "Error: Unable to summarize conversation.";
  }
  const synthesisPrompt = buildSynthesisPrompt(chunkSummaries);
  console.log(`  Synthesizing final summary...`);
  try {
    const result = await callClaude(synthesisPrompt);
    return extractSummary(result);
  } catch {
    console.log(`  Synthesis failed, using chunk summaries`);
    return chunkSummaries.join(" ");
  }
}

export {
  getApiEnv,
  runCodexCommand,
  buildCodexSummarizerCommand,
  SummarizerSdkError,
  isResumeFailure,
  SummarizerThinkingBudgetError,
  shouldSkipReentrantSync,
  formatConversationText,
  buildSummarizerQueryOptions,
  buildCodexSummaryPrompt,
  getCodexModel,
  summarizeConversation
};
